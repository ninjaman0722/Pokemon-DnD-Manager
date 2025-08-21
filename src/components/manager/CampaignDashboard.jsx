// src/components/manager/CampaignDashboard.jsx
import React, { useState } from 'react';
import InviteModal from './InviteModal';
import DeleteCampaignModal from './DeleteCampaignModal';
import { deleteCampaignAndSubcollections } from '../../utils/firebaseUtils';
import { db, auth } from '../../config/firebase';
import { doc, collection, query, where, getDocs, updateDoc, arrayUnion, arrayRemove, serverTimestamp, addDoc } from 'firebase/firestore';
import MemberManagementModal from './MemberManagementModal';
import CampaignSettingsModal from './CampaignSettingsModal';
import ProfileModal from './ProfileModal';

const CampaignDashboard = ({ campaigns, dispatch, user }) => {
    const [campaignToInvite, setCampaignToInvite] = useState(null);
    const [campaignToDelete, setCampaignToDelete] = useState(null);
    const [editingCampaign, setEditingCampaign] = useState(null);
    const [managingMembersOf, setManagingMembersOf] = useState(null);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [newCampaignName, setNewCampaignName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false); // Added local loading state

    const myCampaigns = campaigns.filter(c => c.role === 'DM');
    const joinedCampaigns = campaigns.filter(c => c.role === 'TRAINER');

    const handleKickMember = async (userIdToKick) => {
        if (!managingMembersOf) return;

        if (window.confirm(`Are you sure you want to remove this member from the campaign? They will lose access.`)) {
            const campaignRef = doc(db, 'campaigns', managingMembersOf.id);
            try {
                setLoading(true);
                dispatch({ type: 'SET_LOADING', payload: 'Kicking member...' });
                await updateDoc(campaignRef, {
                    members: arrayRemove(userIdToKick)
                });
            } catch (error) {
                dispatch({ type: 'SET_ERROR', payload: `Failed to kick member: ${error.message}` });
                setError(`Failed to kick member: ${error.message}`);
            } finally {
                setLoading(false);
                dispatch({ type: 'SET_LOADING', payload: null });
            }
        }
    };

    const handleManageClick = (campaignId) => {
        dispatch({ type: 'SELECT_CAMPAIGN', payload: campaignId });
        dispatch({ type: 'SET_VIEW', payload: 'TRAINER_MANAGER' });
    };

    const handleDeleteConfirm = async () => {
        if (!campaignToDelete) return;

        try {
            setLoading(true);
            dispatch({ type: 'SET_LOADING', payload: 'Deleting Campaign...' });
            await deleteCampaignAndSubcollections(campaignToDelete.id);
            dispatch({ type: 'SELECT_CAMPAIGN', payload: null });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to delete campaign: ${error.message}` });
            setError(`Failed to delete campaign: ${error.message}`);
        } finally {
            setCampaignToDelete(null);
            setLoading(false);
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    const handleJoinCampaign = async () => {
        if (joinCode.length < 6 || !user?.uid) {
            setError('Invalid invite code or user not authenticated.');
            return;
        }
        try {
            setLoading(true);
            dispatch({ type: 'SET_LOADING', payload: 'Joining Campaign...' });
            const campaignsRef = collection(db, 'campaigns');
            const q = query(campaignsRef, where("inviteCode", "==", joinCode));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("Invalid Invite Code. Please check the code and try again.");
            }

            const campaignDoc = querySnapshot.docs[0];
            const campaignData = campaignDoc.data();

            if (campaignData.ownerId === user.uid) {
                throw new Error("You are the owner of this campaign and cannot join it as a trainer.");
            }
            if (campaignData.members && campaignData.members.includes(user.uid)) {
                throw new Error("You have already joined this campaign.");
            }

            await updateDoc(campaignDoc.ref, {
                members: arrayUnion(user.uid)
            });

            setJoinCode('');
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: error.message });
            setError(error.message);
        } finally {
            setLoading(false);
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    const handleSaveSettings = async (newPermissions) => {
        if (!editingCampaign) return;
        const campaignRef = doc(db, 'campaigns', editingCampaign.id);
        try {
            setLoading(true);
            dispatch({ type: 'SET_LOADING', payload: 'Saving settings...' });
            await updateDoc(campaignRef, { defaultPermissions: newPermissions });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to update settings: ${error.message}` });
            setError(`Failed to update settings: ${error.message}`);
        } finally {
            setLoading(false);
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    const handleCreateCampaign = async (e) => {
        e.preventDefault();
        if (!newCampaignName.trim() || newCampaignName.length > 100 || !user?.uid) {
            setError('Campaign name must be 1-100 characters.');
            return;
        }
        try {
            setLoading(true);
            dispatch({ type: 'SET_LOADING', payload: 'Creating Campaign...' });
            const campaignsRef = collection(db, 'campaigns');
            const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const newCampaign = {
                name: newCampaignName,
                ownerId: user.uid,
                createdAt: serverTimestamp(),
                members: [],
                description: '',
                inviteCode,
                defaultPermissions: {
                    canViewRoster: true,
                    canViewBox: true,
                    canViewBag: true,
                    canEditNicknames: true,
                    canLevelUp: false,
                    canChangeMovesets: false,
                    canUseItems: true,
                    canOrganizeBox: true,
                    canRenameBoxes: true,
                    partyLevel: 5,
                }
            };
            const docRef = await addDoc(campaignsRef, newCampaign);
            dispatch({ type: 'SELECT_CAMPAIGN', payload: docRef.id });
            setNewCampaignName('');
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to create campaign: ${error.message}` });
            setError(`Failed to create campaign: ${error.message}`);
        } finally {
            setLoading(false);
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    return (
        <div>
            {/* Profile Modal */}
            {showProfileModal && (
                <ProfileModal
                    user={user}
                    campaigns={campaigns}
                    onClose={() => setShowProfileModal(false)}
                    dispatch={dispatch}
                />
            )}

            {/* Existing modals */}
            {campaignToInvite && (
                <InviteModal
                    campaign={campaignToInvite}
                    onClose={() => setCampaignToInvite(null)}
                    dispatch={dispatch}
                />
            )}
            {campaignToDelete && (
                <DeleteCampaignModal
                    campaign={campaignToDelete}
                    onClose={() => setCampaignToDelete(null)}
                    onConfirm={handleDeleteConfirm}
                />
            )}
            {editingCampaign && (
                <CampaignSettingsModal
                    campaign={editingCampaign}
                    onClose={() => setEditingCampaign(null)}
                    onSave={handleSaveSettings}
                    dispatch={dispatch}
                />
            )}
            {managingMembersOf && (
                <MemberManagementModal
                    campaign={managingMembersOf}
                    onClose={() => setManagingMembersOf(null)}
                    onKickMember={handleKickMember}
                />
            )}

            {/* Error Display */}
            {error && (
                <div className="mb-4 p-3 bg-red-500/20 text-red-400 rounded-md">
                    {error}
                </div>
            )}

            {/* Manage Profile Button */}
            <div className="mb-6 flex justify-end">
                <button
                    onClick={() => setShowProfileModal(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
                    disabled={loading}
                >
                    Manage Profile
                </button>
            </div>

            {/* DM View */}
            <div className="mb-12">
                <h2 className="text-3xl font-bold text-indigo-400 border-b-2 border-gray-700 pb-2 mb-4">My Campaigns (DM)</h2>
                <div className="mb-8 p-6 bg-gray-800/60 rounded-lg shadow-md">
                    <form onSubmit={handleCreateCampaign} className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                        <input
                            type="text"
                            value={newCampaignName}
                            onChange={e => setNewCampaignName(e.target.value)}
                            placeholder="New Campaign Name"
                            className="flex-grow bg-gray-900 p-2 rounded-md border border-gray-600"
                            maxLength="100"
                        />
                        <button
                            type="submit"
                            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md font-semibold text-lg"
                            disabled={loading}
                        >
                            Create Campaign
                        </button>
                    </form>
                </div>
                {myCampaigns.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {myCampaigns.map(campaign => (
                            <div key={campaign.id} className="bg-gray-800 rounded-lg shadow-lg p-6 flex flex-col justify-between">
                                <h3 className="text-xl font-bold mb-4">{campaign.name}</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setManagingMembersOf(campaign)}
                                        className="bg-teal-600 hover:bg-teal-700 text-white font-bold p-2 rounded-md aspect-square"
                                        title="Manage Members"
                                        disabled={loading}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                            <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.25 1.25 0 0 1 .41 1.412A9.957 9.957 0 0 1 10 18c2.31 0 4.438-.784 6.131-2.095a1.25 1.25 0 0 1 .41-1.412A9.998 9.998 0 0 0 10 12a9.998 9.998 0 0 0-6.535 2.493Z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleManageClick(campaign.id)}
                                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
                                        disabled={loading}
                                    >
                                        Manage
                                    </button>
                                    <button
                                        onClick={() => setCampaignToInvite(campaign)}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
                                        disabled={loading}
                                    >
                                        Invite
                                    </button>
                                    <button
                                        onClick={() => setCampaignToDelete(campaign)}
                                        className="bg-red-800 hover:bg-red-700 text-white font-bold p-2 rounded-md aspect-square"
                                        disabled={loading}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-1.009.246-1.855.85-2.433 1.623A2.004 2.004 0 0 0 2 7.558V14.5a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 18 14.5V7.558c0-.422-.128-.826-.367-1.165A2.738 2.738 0 0 0 15.19 5.8C14.61 5.029 13.763 4.42 12.753 4.193V3.75A2.75 2.75 0 0 0 10 1h-1.25ZM10 2.5h-1.25a1.25 1.25 0 0 0-1.25 1.25v.452c.26.04.514.103.762.188a2.5 2.5 0 0 1 1.476 0c.248-.085.502-.148.762-.188V3.75A1.25 1.25 0 0 0 10 2.5ZM9.25 7.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Zm-3 0a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 6.25 7.5Zm6 0a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => setEditingCampaign(campaign)}
                                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold p-2 rounded-md aspect-square"
                                        title="Campaign Settings"
                                        disabled={loading}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M11.09 3.562a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61a1.75 1.75 0 0 1-1.044.512H3.75a.75.75 0 0 1-.75-.75v-1.192a1.75 1.75 0 0 1 .512-1.044l8.61-8.61Zm1.388 1.388a.25.25 0 0 0-.354 0l-8.61 8.61H3.75v.025l8.36-8.36a.25.25 0 0 0 0-.354l-1.086-1.086Z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400 italic">You haven't created any campaigns yet. Use the form above to start one.</p>
                )}
            </div>
            <div className="mb-12">
                <h2 className="text-3xl font-bold text-yellow-400 border-b-2 border-gray-700 pb-2 mb-4">Join a New Campaign</h2>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleJoinCampaign();
                    }}
                    className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 bg-gray-800/60 p-4 rounded-lg"
                >
                    <input
                        type="text"
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="Enter Invite Code"
                        className="flex-grow bg-gray-900 p-2 rounded-md border border-gray-600 uppercase placeholder:capitalize"
                        maxLength="6"
                    />
                    <button
                        type="submit"
                        disabled={joinCode.length < 6 || loading}
                        className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-md font-semibold text-lg text-white disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        Join Campaign
                    </button>
                </form>
            </div>
            <div>
                <h2 className="text-3xl font-bold text-yellow-400 border-b-2 border-gray-700 pb-2 mb-4">Joined Campaigns (Trainer)</h2>
                {joinedCampaigns.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {joinedCampaigns.map(campaign => (
                            <div key={campaign.id} className="bg-gray-800 rounded-lg shadow-lg p-6 flex flex-col justify-between">
                                <div>
                                    <h3 className="text-xl font-bold">{campaign.name}</h3>
                                    <p className="text-sm text-gray-400">Campaign by {campaign.dmName}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        dispatch({ type: 'SELECT_CAMPAIGN', payload: campaign.id });
                                        dispatch({ type: 'SET_VIEW', payload: 'TRAINER_VIEW' });
                                    }}
                                    className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
                                    disabled={loading}
                                >
                                    View Team
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400 italic">You haven't joined any campaigns yet. Ask your DM for an invite code!</p>
                )}
            </div>
        </div>
    );
};

export default CampaignDashboard;