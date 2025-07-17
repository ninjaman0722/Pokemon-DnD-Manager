// src/components/manager/CampaignSettingsModal.jsx
import React, { useState, useEffect } from 'react';

const PermissionToggle = ({ label, description, isChecked, onChange }) => (
    <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-md">
        <div>
            <label className="font-semibold text-white">{label}</label>
            <p className="text-xs text-gray-400">{description}</p>
        </div>
        <button
            onClick={onChange}
            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${isChecked ? 'bg-green-500' : 'bg-gray-600'}`}
        >
            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isChecked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </div>
);


const CampaignSettingsModal = ({ campaign, onSave, onClose, dispatch }) => {
    const [permissions, setPermissions] = useState(campaign.defaultPermissions || {});

    useEffect(() => {
        setPermissions(campaign.defaultPermissions || {});
    }, [campaign.defaultPermissions]);

    const handlePermissionChange = (permissionKey) => {
        setPermissions(prev => ({
            ...prev,
            [permissionKey]: !prev[permissionKey]
        }));
    };

    const handleSaveChanges = async () => {
        dispatch({ type: 'SET_LOADING', payload: 'Saving Settings...' });
        try {
            await onSave(permissions); // The actual save logic is passed in via props
            onClose(); // Close modal on success
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to save settings: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-indigo-400">Campaign Settings: {campaign.name}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                </div>
                
                <p className="text-sm text-gray-300 mb-4">These are the default permissions for all trainers who join this campaign.</p>

                <div className="space-y-3 overflow-y-auto pr-2 flex-grow">
                    <PermissionToggle 
                        label="View Pokémon Box"
                        description="Allow trainers to see Pokémon stored in their box."
                        isChecked={permissions.canViewBox}
                        onChange={() => handlePermissionChange('canViewBox')}
                    />
                    <PermissionToggle 
                        label="View Bag"
                        description="Allow trainers to see the items in their bag."
                        isChecked={permissions.canViewBag}
                        onChange={() => handlePermissionChange('canViewBag')}
                    />
                     <PermissionToggle 
                        label="Edit Nicknames"
                        description="Allow trainers to give their Pokémon nicknames."
                        isChecked={permissions.canEditNicknames}
                        onChange={() => handlePermissionChange('canEditNicknames')}
                    />
                    <PermissionToggle 
                        label="Use Items"
                        description="Allow trainers to use healing items on their Pokémon outside of battle."
                        isChecked={permissions.canUseItems}
                        onChange={() => handlePermissionChange('canUseItems')}
                    />
                    {/* Add more toggles here as you expand the system */}
                </div>

                <div className="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleSaveChanges} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md font-semibold">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

export default CampaignSettingsModal;