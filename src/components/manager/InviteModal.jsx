// src/components/manager/InviteModal.jsx
import React, { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

// Helper to generate a random code
const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const InviteModal = ({ campaign, onClose, dispatch }) => {
    const [inviteCode, setInviteCode] = useState(campaign.inviteCode || 'Generating...');
    const [isCopied, setIsCopied] = useState(false);

    const generateAndSaveCode = async () => {
        dispatch({ type: 'SET_LOADING', payload: 'Generating Code...' });
        const newCode = generateCode();
        const campaignRef = doc(db, 'campaigns', campaign.id);
        try {
            await updateDoc(campaignRef, { inviteCode: newCode });
            setInviteCode(newCode);
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to create invite code: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    useEffect(() => {
        if (!campaign.inviteCode) {
            generateAndSaveCode();
        }
    }, [campaign.inviteCode]);

    const handleCopy = () => {
        navigator.clipboard.writeText(inviteCode);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-indigo-400">Invite Trainers to {campaign.name}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                </div>
                <div>
                    <p className="text-gray-300 mb-2">Share this code with your players. They can use it to join your campaign.</p>
                    <div className="flex items-center gap-2 p-3 bg-gray-900 rounded-md">
                        <span className="flex-grow text-2xl font-mono tracking-widest text-center text-yellow-300">{inviteCode}</span>
                        <button onClick={handleCopy} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3 rounded-md text-sm">
                            {isCopied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                </div>
                 <button onClick={generateAndSaveCode} className="w-full text-sm text-center text-gray-400 hover:text-white hover:underline">
                    Generate a new code
                </button>
                {/* We will add a list of joined members here in a future step */}
            </div>
        </div>
    );
};

export default InviteModal;