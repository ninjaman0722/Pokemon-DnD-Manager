import React, { useState } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
import { doc, addDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../../config/firebase';
import CustomAbilityModal from './CustomAbilityModal';

const CustomAbilityCreator = () => {
    const { state, dispatch } = useManagerContext();
    const { customAbilities } = state;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAbility, setEditingAbility] = useState(null);

    const handleOpenCreateModal = () => {
        setEditingAbility(null);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (ability) => {
        setEditingAbility(ability);
        setIsModalOpen(true);
    };

    const handleSaveCustomAbility = async (abilityData) => {
        dispatch({ type: 'SET_LOADING', payload: 'Saving Custom Ability...' });
        try {
            const collectionPath = `campaigns/${state.selectedCampaignId}/custom-abilities`;
            if (abilityData.id) {
                const docRef = doc(db, collectionPath, abilityData.id);
                await updateDoc(docRef, abilityData);
            } else {
                await addDoc(collection(db, collectionPath), abilityData);
            }
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to save custom ability: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
            setIsModalOpen(false);
        }
    };

    const handleDeleteCustomAbility = async (abilityId) => {
        if (!window.confirm("Are you sure you want to permanently delete this custom ability?")) {
            return;
        }
        dispatch({ type: 'SET_LOADING', payload: 'Deleting...' });
        try {
            const docRef = doc(db, `campaigns/${state.selectedCampaignId}/custom-abilities`, abilityId);
            await deleteDoc(docRef);
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to delete custom ability: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    return (
        <div>
            {isModalOpen && <CustomAbilityModal abilityToEdit={editingAbility} onSave={handleSaveCustomAbility} onClose={() => setIsModalOpen(false)} />}

            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-indigo-300">My Custom Abilities</h2>
                <button onClick={handleOpenCreateModal} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md font-semibold">
                    + Create New Ability
                </button>
            </div>

            <div className="bg-gray-900/50 p-4 rounded-lg min-h-[200px]">
                {customAbilities.length > 0 ? (
                    <ul className="space-y-2">
                        {customAbilities.map(a => (
                            <li key={a.id} className="p-3 rounded-md bg-gray-700 flex justify-between items-center">
                                <div className="flex-grow">
                                    <h3 className="font-semibold capitalize">{a.name}</h3>
                                    <p className="text-sm text-gray-400">{a.effect_entries[0].short_effect}</p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0 ml-4">
                                    <button onClick={() => handleOpenEditModal(a)} className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded">Edit</button>
                                    <button onClick={() => handleDeleteCustomAbility(a.id)} className="text-sm bg-red-600 hover:bg-red-700 px-3 py-1 rounded">Delete</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-400 italic pt-8">
                        You haven't created any custom abilities yet.
                    </p>
                )}
            </div>
        </div>
    );
};

export default CustomAbilityCreator;