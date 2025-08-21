// src/components/manager/ProfileModal.jsx
import React, { useState, useEffect } from 'react';
import { auth, db } from '../../config/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateProfile, updateEmail, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { deleteCampaignAndSubcollections } from '../../utils/firebaseUtils';

const storage = getStorage();

const ProfileModal = ({ user, campaigns, onClose, dispatch }) => {
    const [activeTab, setActiveTab] = useState('general');
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [bio, setBio] = useState('');
    const [avatarUrl, setAvatarUrl] = useState(user?.photoURL || '');
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(user?.photoURL || '');
    const [newEmail, setNewEmail] = useState(user?.email || '');
    const [passwordForReauth, setPasswordForReauth] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Fetch user data from Firestore (bio, avatarUrl if not in Auth)
    useEffect(() => {
        if (!user?.uid) {
            setError('User not authenticated. Please log in again.');
            return;
        }
        const fetchUserData = async () => {
            setLoading(true);
            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    setBio(data.bio || '');
                    setAvatarUrl(data.avatarUrl || user.photoURL || '');
                    setAvatarPreview(data.avatarUrl || user.photoURL || '');
                }
            } catch (err) {
                setError(`Failed to load profile: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };
        fetchUserData();
    }, [user]);

    // Handle avatar file change and preview
    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        } else {
            setError('Please select a valid image file.');
        }
    };

    // Upload avatar to Storage and get URL
    const uploadAvatar = async () => {
        if (!avatarFile) return avatarUrl;
        setLoading(true);
        try {
            const storageRef = ref(storage, `avatars/${user.uid}/${avatarFile.name}`);
            await uploadBytes(storageRef, avatarFile);
            const url = await getDownloadURL(storageRef);
            return url;
        } catch (err) {
            setError(`Failed to upload avatar: ${err.message}`);
            return null;
        } finally {
            setLoading(false);
        }
    };

    // Save general profile changes
    const handleSaveGeneral = async () => {
        if (!user?.uid) {
            setError('User not authenticated.');
            return;
        }
        if (displayName.length < 2 || displayName.length > 50) {
            setError('Display name must be 2-50 characters.');
            return;
        }
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const uploadedAvatarUrl = await uploadAvatar();
            if (uploadedAvatarUrl) {
                await updateProfile(auth.currentUser, { displayName, photoURL: uploadedAvatarUrl });
            } else {
                await updateProfile(auth.currentUser, { displayName });
            }
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                displayName,
                bio,
                avatarUrl: uploadedAvatarUrl || avatarUrl,
            });
            setSuccess('Profile updated successfully!');
        } catch (err) {
            setError(`Failed to update profile: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Change email with re-authentication
    const handleChangeEmail = async () => {
        if (!user?.uid) {
            setError('User not authenticated.');
            return;
        }
        if (!newEmail || !passwordForReauth) {
            setError('Email and password are required.');
            return;
        }
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const credential = EmailAuthProvider.credential(user.email, passwordForReauth);
            await reauthenticateWithCredential(auth.currentUser, credential);
            await updateEmail(auth.currentUser, newEmail);
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { email: newEmail });
            setSuccess('Email updated successfully!');
        } catch (err) {
            setError(`Failed to update email: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Reset password
    const handleResetPassword = async () => {
        if (!user?.email) {
            setError('User not authenticated.');
            return;
        }
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            await sendPasswordResetEmail(auth, user.email);
            setSuccess('Password reset email sent! Check your inbox.');
        } catch (err) {
            setError(`Failed to send reset email: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Delete account
    const handleDeleteAccount = async () => {
        if (!user?.uid) {
            setError('User not authenticated.');
            return;
        }
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const ownedCampaigns = campaigns.filter(c => c.role === 'DM');
            for (const campaign of ownedCampaigns) {
                await deleteCampaignAndSubcollections(campaign.id);
            }
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { deleted: true });
            await deleteUser(auth.currentUser);
            dispatch({ type: 'SET_VIEW', payload: 'AUTH' });
            onClose();
        } catch (err) {
            setError(`Failed to delete account: ${err.message}`);
        } finally {
            setLoading(false);
            setConfirmDelete(false);
        }
    };

    // Calculate stats with fallback
    const ownedCampaignsCount = campaigns?.filter(c => c.role === 'DM').length || 0;
    const joinedCampaignsCount = campaigns?.filter(c => c.role === 'TRAINER').length || 0;
    const joinDate = user?.metadata?.creationTime
        ? new Date(user.metadata.creationTime).toLocaleDateString()
        : 'Unknown';

    // If user is not authenticated, show a fallback UI
    if (!user) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                <div className="bg-gray-800 p-6 rounded-lg shadow-2xl max-w-lg w-full">
                    <h2 className="text-2xl font-bold text-indigo-400 mb-4">Manage Profile</h2>
                    <p className="text-red-400 mb-4">Error: User not authenticated. Please log in again.</p>
                    <button
                        onClick={onClose}
                        className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-2xl max-w-lg w-full overflow-y-auto max-h-[80vh]">
                <h2 className="text-2xl font-bold text-indigo-400 mb-4">Manage Profile</h2>
                {error && <p className="bg-red-500/20 text-red-400 p-3 rounded-md mb-4">{error}</p>}
                {success && <p className="bg-green-500/20 text-green-400 p-3 rounded-md mb-4">{success}</p>}
                {loading && <p className="text-indigo-400 mb-4">Loading...</p>}

                {/* Tabs */}
                <div className="flex mb-4 space-x-2">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`px-4 py-2 rounded-md ${activeTab === 'general' ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                        General
                    </button>
                    <button
                        onClick={() => setActiveTab('security')}
                        className={`px-4 py-2 rounded-md ${activeTab === 'security' ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                        Security
                    </button>
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={`px-4 py-2 rounded-md ${activeTab === 'stats' ? 'bg-indigo-600' : 'bg-gray-700'}`}
                    >
                        Stats
                    </button>
                </div>

                {/* General Tab */}
                {activeTab === 'general' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="displayName">Display Name</label>
                            <input
                                type="text"
                                id="displayName"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full bg-gray-900 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500"
                                placeholder="Enter display name"
                            />
                        </div>
                        <button
                            onClick={handleSaveGeneral}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md"
                            disabled={loading}
                        >
                            Save General Changes
                        </button>
                    </div>
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="newEmail">New Email</label>
                            <input
                                type="email"
                                id="newEmail"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                className="w-full bg-gray-900 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500"
                                placeholder="Enter new email"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="passwordForReauth">Current Password (for re-authentication)</label>
                            <input
                                type="password"
                                id="passwordForReauth"
                                value={passwordForReauth}
                                onChange={(e) => setPasswordForReauth(e.target.value)}
                                className="w-full bg-gray-900 p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500"
                                placeholder="Enter current password"
                            />
                        </div>
                        <button
                            onClick={handleChangeEmail}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md"
                            disabled={loading}
                        >
                            Change Email
                        </button>
                        <button
                            onClick={handleResetPassword}
                            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-md"
                            disabled={loading}
                        >
                            Reset Password
                        </button>
                        <button
                            onClick={handleDeleteAccount}
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md"
                            disabled={loading}
                        >
                            {confirmDelete ? 'Confirm Delete Account' : 'Delete Account'}
                        </button>
                        {confirmDelete && <p className="text-red-400 text-sm">This action is irreversible. All data will be lost.</p>}
                    </div>
                )}

                {/* Stats Tab */}
                {activeTab === 'stats' && (
                    <div className="space-y-4 text-gray-300">
                        <p><strong>Join Date:</strong> {joinDate}</p>
                        <p><strong>Owned Campaigns (DM):</strong> {ownedCampaignsCount}</p>
                        <p><strong>Joined Campaigns (Trainer):</strong> {joinedCampaignsCount}</p>
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="mt-4 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md"
                    disabled={loading}
                >
                    Close
                </button>
            </div>
        </div>
    );
};

export default ProfileModal;