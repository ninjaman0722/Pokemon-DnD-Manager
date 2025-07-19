// src/components/manager/MemberManagementModal.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

const MemberManagementModal = ({ campaign, onKickMember, onClose }) => {
    const [memberProfiles, setMemberProfiles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchProfiles = async () => {
            if (!campaign.members || campaign.members.length === 0) {
                setMemberProfiles([]);
                setIsLoading(false);
                return;
            }
            // Fetch the user document for each member ID
            try {
                const profilePromises = campaign.members.map(id => getDoc(doc(db, "users", id)));
                const profileSnapshots = await Promise.all(profilePromises);
                const profiles = profileSnapshots
                    .filter(snap => snap.exists())
                    .map(snap => ({ id: snap.id, ...snap.data() }));
                setMemberProfiles(profiles);
            } catch (error) {
                console.error("Failed to fetch member profiles:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfiles();
    }, [campaign.members]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-lg p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-indigo-400">Manage Members</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                </div>
                
                <div className="bg-gray-900/50 p-3 rounded-md min-h-[200px]">
                    {isLoading ? <p>Loading members...</p> : (
                        <ul className="space-y-2">
                            {memberProfiles.map(profile => (
                                <li key={profile.id} className="p-2 rounded-md flex items-center justify-between hover:bg-gray-700/50">
                                    <div>
                                        <p className="font-semibold">{profile.displayName}</p>
                                        <p className="text-xs text-gray-400">{profile.email}</p>
                                    </div>
                                    <button 
                                        onClick={() => onKickMember(profile.id)}
                                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-md text-sm"
                                    >
                                        Kick
                                    </button>
                                </li>
                            ))}
                            {memberProfiles.length === 0 && <p className="text-gray-400 italic text-center">No members have joined yet.</p>}
                        </ul>
                    )}
                </div>
                 <div className="flex justify-end">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Close</button>
                </div>
            </div>
        </div>
    );
};

export default MemberManagementModal;