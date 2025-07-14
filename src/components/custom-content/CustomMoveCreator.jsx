import React, { useState } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
// Import setDoc
import { doc, addDoc, setDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';
import { fetchMoveData } from '../../utils/api';
import CustomMoveModal from './CustomMoveModal';
import OfficialSearchModal from './OfficialSearchModal';
import { TYPE_COLORS } from '../../config/gameData';

const CustomMoveCreator = () => {
    const { state, dispatch } = useManagerContext();
    const { customMoves, moveList } = state; 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMove, setEditingMove] = useState(null);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

    const handleOpenCreateModal = () => {
        setEditingMove(null);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (move) => {
        setEditingMove(move);
        setIsModalOpen(true);
    };

    const handleEditOfficialMove = async (moveName) => {
        dispatch({ type: 'SET_LOADING', payload: `Fetching ${moveName}...` });
        try {
            const officialData = await fetchMoveData(moveName);
            handleOpenEditModal(officialData);
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: error.message });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    // --- UPDATED SAVE FUNCTION ---
    const handleSaveCustomMove = async (moveData) => {
        dispatch({ type: 'SET_LOADING', payload: 'Saving Custom Move...' });
        try {
            // If it's an override of an official move, use its name as the document ID
            if (moveData.isOverride) {
                const docId = moveData.name.toLowerCase().replace(/\s/g, '-');
                const docRef = doc(db, `artifacts/${appId}/public/data/custom-moves`, docId);
                await setDoc(docRef, moveData); // Use setDoc to create or overwrite
            } else if (moveData.id) {
                // Editing an existing purely custom move
                const docRef = doc(db, `artifacts/${appId}/public/data/custom-moves`, moveData.id);
                await updateDoc(docRef, moveData);
            } else {
                // Creating a brand new purely custom move
                await addDoc(collection(db, `artifacts/${appId}/public/data/custom-moves`), moveData);
            }
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to save custom move: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
            setIsModalOpen(false);
        }
    };

    const handleDeleteCustomMove = async (moveId) => {
        if (!window.confirm("Are you sure you want to permanently delete this custom move?")) {
            return;
        }
        dispatch({ type: 'SET_LOADING', payload: 'Deleting...' });
        try {
            const docRef = doc(db, `artifacts/${appId}/public/data/custom-moves`, moveId);
            await deleteDoc(docRef);
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to delete custom move: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    return (
        <div>
            {isModalOpen && <CustomMoveModal moveToEdit={editingMove} onSave={handleSaveCustomMove} onClose={() => setIsModalOpen(false)} />}
            {isSearchModalOpen && (
                <OfficialSearchModal
                    title="Edit Official Move"
                    sourceList={moveList}
                    onSelect={handleEditOfficialMove}
                    onClose={() => setIsSearchModalOpen(false)}
                />
            )}

            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-indigo-300">My Custom Moves</h2>
                <div className="flex gap-2">
                    <button onClick={() => setIsSearchModalOpen(true)} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">
                        Edit Official Move
                    </button>
                    <button onClick={handleOpenCreateModal} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md font-semibold">
                        + Create New Move
                    </button>
                </div>
            </div>
            
            <div className="bg-gray-900/50 p-4 rounded-lg min-h-[200px]">
                {customMoves.length > 0 ? (
                    <ul className="space-y-2">
                        {customMoves.map(m => (
                            <li key={m.id || m.name} className="p-3 rounded-md bg-gray-700 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <span className={`px-3 py-1 text-xs rounded-full uppercase font-bold ${TYPE_COLORS[m.type]}`}>{m.type}</span>
                                    <span className="font-semibold capitalize">{m.name}</span>
                                    {m.isOverride && <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">Official Variant</span>}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleOpenEditModal(m)} className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded">Edit</button>
                                    <button onClick={() => handleDeleteCustomMove(m.id || m.name.toLowerCase().replace(/\s/g, '-'))} className="text-sm bg-red-600 hover:bg-red-700 px-3 py-1 rounded">Delete</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-400 italic pt-8">
                        You haven't created any custom moves yet.
                    </p>
                )}
            </div>
        </div>
    );
};

export default CustomMoveCreator;