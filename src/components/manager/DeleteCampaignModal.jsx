// src/components/manager/DeleteCampaignModal.jsx
import React, { useState } from 'react';

const DeleteCampaignModal = ({ campaign, onConfirm, onClose }) => {
    const [confirmationText, setConfirmationText] = useState('');
    const isMatch = confirmationText === campaign.name;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
                <h2 className="text-2xl font-bold text-red-500">Delete Campaign?</h2>
                <p className="text-gray-300">
                    This is permanent and cannot be undone. All trainers, rosters, custom content, and battle scenarios associated with
                    <strong className="text-yellow-300"> {campaign.name} </strong> 
                    will be lost forever.
                </p>
                <p className="text-gray-300">
                    To confirm, please type the campaign name below:
                </p>
                <input
                    type="text"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <div className="flex justify-end gap-4 pt-4">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md">
                        Cancel
                    </button>
                    <button 
                        onClick={onConfirm}
                        disabled={!isMatch}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md disabled:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Permanently Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteCampaignModal;