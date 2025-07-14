import React, { useState, useEffect } from 'react';
import { FUSION_RECIPES } from '../../config/gameData';

const FusionModal = ({ trainer, onFuse, onClose }) => {
    const [basePokemon, setBasePokemon] = useState(null);
    const [partnerPokemon, setPartnerPokemon] = useState(null);
    const [canFuse, setCanFuse] = useState(false);

    const potentialBases = trainer.roster.filter(p => FUSION_RECIPES[p.speciesName]);
    
    let potentialPartners = [];
    if (basePokemon) {
        const recipe = FUSION_RECIPES[basePokemon.speciesName];
        const partnerNames = Object.keys(recipe.partners);
        potentialPartners = trainer.roster.filter(p => partnerNames.includes(p.speciesName));
    }
    
    useEffect(() => {
        if (basePokemon && partnerPokemon) {
            const recipe = FUSION_RECIPES[basePokemon.speciesName];
            // Normalize both item names for a robust, case-insensitive check.
            const normalizedRecipeItem = recipe.item.toLowerCase().replace(/\s/g, '-');
            const hasItem = Object.values(trainer.bag || {}).some(item => item.name.toLowerCase().replace(/\s/g, '-') === normalizedRecipeItem);
            setCanFuse(hasItem);
        } else {
            setCanFuse(false);
        }
    }, [basePokemon, partnerPokemon, trainer.bag]);

    const handleFuseClick = () => {
        const recipe = FUSION_RECIPES[basePokemon.speciesName];
        const fusedFormName = recipe.partners[partnerPokemon.speciesName];
        onFuse(basePokemon.id, partnerPokemon.id, fusedFormName, recipe.item);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-lg p-6 space-y-4">
                <h2 className="text-2xl font-bold text-indigo-400">Fuse Pokémon</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Base Pokémon</label>
                        <select onChange={e => setBasePokemon(trainer.roster.find(p => p.id === e.target.value))} className="w-full bg-gray-900 p-2 rounded-md">
                            <option value="">Select Base...</option>
                            {potentialBases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-400">Partner Pokémon</label>
                        <select onChange={e => setPartnerPokemon(trainer.roster.find(p => p.id === e.target.value))} disabled={!basePokemon} className="w-full bg-gray-900 p-2 rounded-md disabled:bg-gray-700">
                             <option value="">Select Partner...</option>
                            {potentialPartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                </div>
                {!canFuse && basePokemon && partnerPokemon && <p className="text-red-400 text-center">Missing required item: {FUSION_RECIPES[basePokemon.speciesName].item}</p>}
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleFuseClick} disabled={!canFuse} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md font-semibold disabled:bg-gray-500">Fuse</button>
                </div>
            </div>
        </div>
    );
};

export default FusionModal;
