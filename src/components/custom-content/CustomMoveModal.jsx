import React, { useState } from 'react';
import { TYPE_COLORS, NON_VOLATILE_STATUSES, VOLATILE_STATUSES } from '../../config/gameData';

// The effect structure is now an array of objects
const getInitialMoveState = () => ({
    name: '',
    type: 'normal',
    damage_class: 'status',
    power: 0,
    accuracy: 100,
    pp: 20,
    effect_entries: [{ short_effect: '' }],
    // Replaces the 'meta' object with a more flexible 'effects' array
    effects: [], 
    isCustom: true,
});

const CustomMoveModal = ({ moveToEdit, onSave, onClose }) => {
    // Ensure the move has an 'effects' array, even if it's old data
    const [move, setMove] = useState(moveToEdit ? { ...moveToEdit, effects: moveToEdit.effects || [] } : getInitialMoveState());

    const handleChange = (field, value) => {
        setMove(m => ({ ...m, [field]: value }));
    };

    const handleEffectChange = (text) => {
        setMove(m => ({ ...m, effect_entries: [{ short_effect: text }] }));
    };

    // --- NEW FUNCTIONS FOR MANAGING THE EFFECTS ARRAY ---
    const handleAddEffect = () => {
        const newEffect = {
            id: crypto.randomUUID(), // Unique key for React rendering
            type: 'STAT_CHANGE',
            target: 'opponent',
            stat: 'attack',
            change: -1,
            status: 'Burned',
            chance: 100,
        };
        setMove(m => ({ ...m, effects: [...m.effects, newEffect] }));
    };

    const handleUpdateEffect = (effectId, field, value) => {
        const newEffects = move.effects.map(eff => {
            if (eff.id === effectId) {
                return { ...eff, [field]: value };
            }
            return eff;
        });
        setMove(m => ({ ...m, effects: newEffects }));
    };

    const handleRemoveEffect = (effectId) => {
        setMove(m => ({ ...m, effects: m.effects.filter(eff => eff.id !== effectId) }));
    };
    // --- END OF NEW FUNCTIONS ---

    const handleSaveChanges = () => {
        if (!move.name || !move.type || !move.damage_class) {
            alert("A move must have a name, type, and category.");
            return;
        }
        onSave(move);
    };

    const renderEffectEditor = (effect) => {
        return (
            <div key={effect.id} className="p-3 bg-gray-700 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3 flex justify-end">
                    <button onClick={() => handleRemoveEffect(effect.id)} className="text-red-500 font-bold">Remove Effect</button>
                </div>
                <div>
                    <label className="text-xs">Effect Type</label>
                    <select value={effect.type} onChange={e => handleUpdateEffect(effect.id, 'type', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md text-sm">
                        <option value="STAT_CHANGE">Stat Change</option>
                        <option value="STATUS_EFFECT">Status Effect</option>
                        <option value="VOLATILE_STATUS_EFFECT">Volatile Status</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs">Target</label>
                    <select value={effect.target} onChange={e => handleUpdateEffect(effect.id, 'target', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md text-sm">
                        <option value="opponent">Target</option>
                        <option value="user">User</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs">Chance (%)</label>
                    <input type="number" value={effect.chance} onChange={e => handleUpdateEffect(effect.id, 'chance', Number(e.target.value))} className="w-full bg-gray-900 p-2 rounded-md text-sm" />
                </div>

                {effect.type === 'STAT_CHANGE' && (
                    <>
                        <div>
                            <label className="text-xs">Stat</label>
                            <select value={effect.stat} onChange={e => handleUpdateEffect(effect.id, 'stat', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md text-sm capitalize">
                                {['attack', 'defense', 'special-attack', 'special-defense', 'speed', 'accuracy', 'evasion'].map(s => <option key={s} value={s}>{s.replace('-', ' ')}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs">Change</label>
                            <input type="number" value={effect.change} onChange={e => handleUpdateEffect(effect.id, 'change', Number(e.target.value))} min="-6" max="6" className="w-full bg-gray-900 p-2 rounded-md text-sm" />
                        </div>
                    </>
                )}
                 {effect.type === 'STATUS_EFFECT' && (
                    <div>
                        <label className="text-xs">Status</label>
                        <select value={effect.status} onChange={e => handleUpdateEffect(effect.id, 'status', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md text-sm">
                            {NON_VOLATILE_STATUSES.filter(s => s !== 'None').map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                )}
                 {effect.type === 'VOLATILE_STATUS_EFFECT' && (
                    <div>
                        <label className="text-xs">Volatile Status</label>
                        <select value={effect.status} onChange={e => handleUpdateEffect(effect.id, 'status', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md text-sm">
                            {VOLATILE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-bold text-indigo-400">{moveToEdit ? 'Edit' : 'Create'} Custom Move</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                </div>

                {/* Core Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-3"><label className="block text-sm font-medium text-gray-400">Move Name</label><input type="text" value={move.name} onChange={e => handleChange('name', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" /></div>
                    <div><label className="block text-sm font-medium text-gray-400">Type</label><select value={move.type} onChange={e => handleChange('type', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 capitalize">{Object.keys(TYPE_COLORS).map(type => <option key={type} value={type}>{type}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-400">Category</label><select value={move.damage_class} onChange={e => handleChange('damage_class', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 capitalize"><option value="physical">Physical</option><option value="special">Special</option><option value="status">Status</option></select></div>
                    <div><label className="block text-sm font-medium text-gray-400">Power</label><input type="number" value={move.power} onChange={e => handleChange('power', Number(e.target.value))} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" /></div>
                    <div><label className="block text-sm font-medium text-gray-400">Accuracy</label><input type="number" value={move.accuracy} onChange={e => handleChange('accuracy', Number(e.target.value))} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" /></div>
                    <div><label className="block text-sm font-medium text-gray-400">PP</label><input type="number" value={move.pp} onChange={e => handleChange('pp', Number(e.target.value))} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" /></div>
                </div>

                {/* Effect Description */}
                <div><label className="block text-sm font-medium text-gray-400">Effect Description</label><textarea value={move.effect_entries[0].short_effect} onChange={e => handleEffectChange(e.target.value)} rows="3" className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" placeholder="e.g. Lowers the target's Attack stat. Has a 30% chance to burn."></textarea></div>
                
                {/* Effects Engine */}
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-400">Move Effects</label>
                    {move.effects.map(renderEffectEditor)}
                    <button onClick={handleAddEffect} className="w-full bg-indigo-800 hover:bg-indigo-700 p-2 rounded-md font-semibold text-sm">+ Add New Effect</button>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleSaveChanges} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md font-semibold">Save Move</button>
                </div>
            </div>
        </div>
    );
};

export default CustomMoveModal;