import React, { useState } from 'react';

const getInitialAbilityState = () => ({
    name: '',
    effect_entries: [{ short_effect: '' }],
    isCustom: true,
});

const getHydratedAbilityState = (ability) => ({
    ...getInitialAbilityState(),
    ...ability,
    effect_entries: (ability.effect_entries && ability.effect_entries.length > 0)
        ? ability.effect_entries
        : [{ short_effect: '' }],
});

const CustomAbilityModal = ({ abilityToEdit, onSave, onClose }) => {
    const [ability, setAbility] = useState(abilityToEdit ? getHydratedAbilityState(abilityToEdit) : getInitialAbilityState());

    const handleEffectChange = (text) => {
        setAbility(a => ({ ...a, effect_entries: [{ short_effect: text }] }));
    };

    const handleSaveChanges = () => {
        if (!ability.name) {
            alert("An ability must have a name.");
            return;
        }
        onSave(ability);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-lg p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-bold text-indigo-400">{abilityToEdit ? 'Edit' : 'Create'} Custom Ability</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400">Ability Name</label>
                    <input 
                        type="text" 
                        value={ability.name} 
                        onChange={e => setAbility(a => ({ ...a, name: e.target.value }))} 
                        className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" 
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400">Effect Description</label>
                    <textarea 
                        value={ability.effect_entries[0].short_effect} 
                        onChange={e => handleEffectChange(e.target.value)} 
                        rows="4" 
                        className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" 
                        placeholder="Describe how this ability works in your campaign."></textarea>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleSaveChanges} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md font-semibold">Save Ability</button>
                </div>
            </div>
        </div>
    );
};

export default CustomAbilityModal;