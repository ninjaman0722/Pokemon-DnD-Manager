import React, { useState } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
import { doc, addDoc, setDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { fetchPokemonData } from '../../utils/api';
import CustomPokemonModal from './CustomPokemonModal';
import OfficialSearchModal from './OfficialSearchModal';
import { officialFormsData } from '../../config/officialFormsData';

const CustomPokemonCreator = () => {
    const { state, dispatch } = useManagerContext();
    // Use the filtered combinedPokemonList for the search source
    const { customPokemon, combinedPokemonList } = state; 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPokemon, setEditingPokemon] = useState(null);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

    const handleOpenCreateModal = () => {
        setEditingPokemon(null);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (pokemon) => {
        setEditingPokemon(pokemon);
        setIsModalOpen(true);
    };

    // This function now correctly accepts BOTH arguments from the modal
    const handleEditOfficialPokemon = async (pokemonName, forms) => {
        dispatch({ type: 'SET_LOADING', payload: `Fetching ${pokemonName}...` });
        try {
            const officialData = await fetchPokemonData(pokemonName);

            // It now combines the fetched data with the forms array passed from the modal
            const finalPokemon = {
                ...officialData,
                isOverride: true,
                forms: forms, 
            };
            
            handleOpenEditModal(finalPokemon);
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: error.message });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
            setIsSearchModalOpen(false); // Close the search modal
        }
    };

const handleSaveCustomPokemon = async (pokemonData) => {
    dispatch({ type: 'SET_LOADING', payload: 'Saving Custom Pokémon...' });
    try {
        const docId = pokemonData.id || pokemonData.name.toLowerCase().replace(/\s/g, '-');
        // This now points to the campaign-specific subcollection
        const docRef = doc(db, `campaigns/${state.selectedCampaignId}/custom-pokemon`, docId);
        await setDoc(docRef, { ...pokemonData, id: docId });
    } catch (error) {
        dispatch({ type: 'SET_ERROR', payload: `Failed to save custom Pokémon: ${error.message}` });
    } finally {
        dispatch({ type: 'SET_LOADING', payload: null });
        setIsModalOpen(false);
    }
};

const handleDeleteCustomPokemon = async (pokemonId) => {
    if (!window.confirm("Are you sure you want to permanently delete this custom Pokémon?")) {
        return;
    }
    dispatch({ type: 'SET_LOADING', payload: 'Deleting...' });
    try {
        // This now points to the campaign-specific subcollection
        const docRef = doc(db, `campaigns/${state.selectedCampaignId}/custom-pokemon`, pokemonId);
        await deleteDoc(docRef);
    } catch (error) {
        dispatch({ type: 'SET_ERROR', payload: `Failed to delete custom Pokémon: ${error.message}` });
    } finally {
        dispatch({ type: 'SET_LOADING', payload: null });
    }
};

    return (
        <div>
            {isModalOpen && <CustomPokemonModal pokemonToEdit={editingPokemon} onSave={handleSaveCustomPokemon} onClose={() => setIsModalOpen(false)} />}
            {isSearchModalOpen && (
                <OfficialSearchModal
                    title="Edit Official Pokémon"
                    sourceList={combinedPokemonList} // Use the correct, filtered list
                    onSelect={handleEditOfficialPokemon} // The handler now correctly matches the onSelect signature
                    onClose={() => setIsSearchModalOpen(false)}
                />
            )}
            
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-indigo-300">My Custom Pokémon</h2>
                <div className="flex gap-2">
                    <button onClick={() => setIsSearchModalOpen(true)} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">
                        Edit Official Pokémon
                    </button>
                    <button onClick={handleOpenCreateModal} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md font-semibold">
                        + Create New Pokémon
                    </button>
                </div>
            </div>
            
            <div className="bg-gray-900/50 p-4 rounded-lg min-h-[200px]">
                {customPokemon.length > 0 ? (
                    <ul className="space-y-2">
                        {customPokemon.map(p => (
                            <li key={p.id} className="p-3 rounded-md bg-gray-700 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <img src={p.sprite || 'https://placehold.co/40x40/64748b/ffffff?text=?'} alt={p.name} className="h-10 w-10" />
                                    <span className="font-semibold">{p.name}</span>
                                    {p.isOverride && <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">Official Variant</span>}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleOpenEditModal(p)} className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded">Edit</button>
                                    <button onClick={() => handleDeleteCustomPokemon(p.id)} className="text-sm bg-red-600 hover:bg-red-700 px-3 py-1 rounded">Delete</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-400 italic pt-8">
                        You haven't created any custom Pokémon yet.
                    </p>
                )}
            </div>
        </div>
    );
};

export default CustomPokemonCreator;