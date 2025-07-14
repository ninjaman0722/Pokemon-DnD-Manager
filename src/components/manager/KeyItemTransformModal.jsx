// src/components/manager/KeyItemTransformModal.jsx

import React, { useState, useEffect } from 'react';
import { KEY_ITEM_RECIPES } from '../../config/gameData';

const KeyItemTransformModal = ({ trainer, onTransform, onClose }) => {
    const [selectedItem, setSelectedItem] = useState('');
    const [selectedPokemonId, setSelectedPokemonId] = useState('');
    const [canTransform, setCanTransform] = useState(false);

    const availableItems = Object.keys(KEY_ITEM_RECIPES).filter(item => 
        Object.values(trainer.bag || {}).some(bagItem => 
            bagItem.name.toLowerCase().replace(/\s/g, '-') === item.toLowerCase().replace(/\s/g, '-')
        )
    );

    let transformablePokemon = [];
    if (selectedItem && KEY_ITEM_RECIPES[selectedItem]) {
        const recipe = KEY_ITEM_RECIPES[selectedItem];
        const possibleTargets = Object.keys(recipe);
        transformablePokemon = trainer.roster.filter(p => 
            // Use the form-specific speciesIdentifier for matching.
            p.speciesIdentifier && possibleTargets.includes(p.speciesIdentifier)
        );
    }

    useEffect(() => {
        setCanTransform(selectedItem && selectedPokemonId);
    }, [selectedItem, selectedPokemonId]);

    const handleTransformClick = () => {
        const recipe = KEY_ITEM_RECIPES[selectedItem];
        const pokemonToTransform = trainer.roster.find(p => p.id === selectedPokemonId);
        // Use the form-specific speciesIdentifier to find the new form in the recipe.
        const newFormName = recipe[pokemonToTransform.speciesIdentifier];
        onTransform(selectedPokemonId, newFormName);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-lg p-6 space-y-4">
                <h2 className="text-2xl font-bold text-indigo-400">Transform Pokémon</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Key Item</label>
                        <select value={selectedItem} onChange={e => setSelectedItem(e.target.value)} className="w-full bg-gray-900 p-2 rounded-md">
                            <option value="">Select Item...</option>
                            {availableItems.map(item => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-400">Pokémon to Transform</label>
                        <select value={selectedPokemonId} onChange={e => setSelectedPokemonId(e.target.value)} disabled={!selectedItem} className="w-full bg-gray-900 p-2 rounded-md disabled:bg-gray-700">
                             <option value="">Select Pokémon...</option>
                            {transformablePokemon.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleTransformClick} disabled={!canTransform} className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-md font-semibold disabled:bg-gray-500">Transform</button>
                </div>
            </div>
        </div>
    );
};

export default KeyItemTransformModal;
