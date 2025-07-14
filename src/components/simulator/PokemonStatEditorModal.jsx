import React, { useState } from 'react';
import { NON_VOLATILE_STATUSES, VOLATILE_STATUSES } from '../../config/gameData';

const PokemonStatEditorModal = ({ pokemon, onSave, onClose }) => {
    const safePokemon = {
        ...pokemon,
        status: pokemon.status || 'None',
        volatileStatuses: pokemon.volatileStatuses || [],
        stat_stages: pokemon.stat_stages || { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 }
    };
    const [editedPokemon, setEditedPokemon] = useState(safePokemon);

    const handleStatChange = (stat, value) => {
        setEditedPokemon(p => ({
            ...p,
            stat_stages: { ...p.stat_stages, [stat]: Math.max(-6, Math.min(6, Number(value) || 0)) }
        }));
    };

    const handleHPChange = (e) => {
        setEditedPokemon(p => ({ ...p, currentHp: Math.max(0, Math.min(p.maxHp, Number(e.target.value))) }));
    };

    const handlePrimaryStatusChange = (e) => {
        setEditedPokemon(p => ({ ...p, status: e.target.value }));
    };

    const handleVolatileStatusChange = (statusName, isChecked) => {
        setEditedPokemon(p => {
            const currentVolatiles = p.volatileStatuses || [];
            if (isChecked) {
                return { ...p, volatileStatuses: [...currentVolatiles, statusName] };
            } else {
                return { ...p, volatileStatuses: currentVolatiles.filter(s => s !== statusName) };
            }
        });
    };

    const handleSave = () => {
        onSave(editedPokemon);
        onClose();
    };

    const hpPercentage = editedPokemon.maxHp > 0 ? Math.round((editedPokemon.currentHp / editedPokemon.maxHp) * 100) : 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
                <h2 className="text-2xl font-bold text-indigo-400">Edit {pokemon.name}</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">HP ({editedPokemon.currentHp}/{editedPokemon.maxHp} - {hpPercentage}%)</label>
                        <input type="number" value={editedPokemon.currentHp} onChange={handleHPChange} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Primary Status</label>
                        <select value={editedPokemon.status} onChange={handlePrimaryStatusChange} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600">
                            {NON_VOLATILE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Volatile Conditions</label>
                    <div className="grid grid-cols-3 gap-2">
                        {VOLATILE_STATUSES.map(vs => (
                            <label key={vs} className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={editedPokemon.volatileStatuses?.includes(vs) || false}
                                    onChange={(e) => handleVolatileStatusChange(vs, e.target.checked)}
                                    className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded"
                                />
                                {vs}
                            </label>
                        ))}
                    </div>
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-indigo-300 mb-2">Stat Stages</h3>
                    <div className="grid grid-cols-3 gap-2">
                        {Object.keys(editedPokemon.stat_stages).map(stat => (
                            <div key={stat}>
                                <label className="block text-xs font-medium text-gray-400 capitalize">{stat.replace('-', ' ')}</label>
                                <input type="number" value={editedPokemon.stat_stages[stat]} onChange={(e) => handleStatChange(stat, e.target.value)} min="-6" max="6" className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 text-center" />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md font-semibold">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

export default PokemonStatEditorModal;