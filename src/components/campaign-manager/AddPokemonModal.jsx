// src/components/manager/AddPokemonModal.jsx
import React, { useState } from 'react';
import AutocompleteInput from '../common/AutocompleteInput';

const AddPokemonModal = ({ trainer, onAdd, onClose, pokemonList, dispatch }) => {
    const [pokemonName, setPokemonName] = useState('');
    const [level, setLevel] = useState(50);
    // Default destination is the roster, but it can be changed to a box ID
    const [destination, setDestination] = useState('roster');

    const handleAddClick = () => {
        if (!pokemonName) {
            dispatch({ type: 'SET_ERROR', payload: "Please select a Pokémon." });
            return;
        }
        const destinationObject = destination === 'roster' 
            ? { type: 'roster' } 
            : { type: 'box', boxId: destination };
            
        onAdd(pokemonName, level, destinationObject);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-lg p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-indigo-400">Add Pokémon to {trainer.name}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Pokémon Name</label>
                        <AutocompleteInput 
                            value={pokemonName}
                            onChange={setPokemonName}
                            onSelect={setPokemonName}
                            sourceList={pokemonList}
                            placeholder="Search for a Pokémon..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="level" className="block text-sm font-medium text-gray-400 mb-1">Level</label>
                            <input 
                                type="number" 
                                id="level"
                                value={level} 
                                onChange={(e) => setLevel(Math.max(1, Math.min(100, Number(e.target.value))))}
                                className="w-full bg-gray-900 p-2 rounded-md border border-gray-600"
                            />
                        </div>
                        <div>
                            <label htmlFor="destination" className="block text-sm font-medium text-gray-400 mb-1">Destination</label>
                            <select 
                                id="destination"
                                value={destination} 
                                onChange={e => setDestination(e.target.value)}
                                className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 capitalize"
                            >
                                <option value="roster">Party / Roster</option>
                                {trainer.boxes?.map(box => (
                                    <option key={box.id} value={box.id}>
                                        {box.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleAddClick} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md font-semibold">Add Pokémon</button>
                </div>
            </div>
        </div>
    );
};

export default AddPokemonModal;