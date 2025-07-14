// src/components/custom-content/CustomPokemonModal.jsx

import React, { useState } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
import { TYPE_COLORS } from '../../config/gameData';
import { FORM_CHANGE_METHOD } from '../../config/constants';
import AutocompleteInput from '../common/AutocompleteInput';

// This is the blueprint for a new, blank form.
const getInitialFormState = () => ({
    id: crypto.randomUUID(), // A unique ID for React keys
    formName: '',
    changeMethod: 'BATTLE',
    triggerItem: '',
    data: {
        sprite: '',
        shinySprite: '',
        types: [],
        ability: '',
        baseStats: { hp: 10, attack: 10, defense: 10, 'special-attack': 10, 'special-defense': 10, speed: 10 },
        sprites: {},
    }
});

const getInitialPokemonState = () => ({
    name: '',
    sprite: '',
    shinySprite: '',
    sprites: {},
    types: [],
    gender: 'Genderless',
    baseStats: { hp: 10, attack: 10, defense: 10, 'special-attack': 10, 'special-defense': 10, speed: 10 },
    abilities: [{ name: '' }],
    allMoveNames: [],
    isCustom: true,
    forms: [], // We now use a 'forms' array instead of 'megaForm'
});

const CustomPokemonModal = ({ pokemonToEdit, onSave, onClose }) => {
    const { state } = useManagerContext();
    const { moveList, abilityList } = state;

    const [pokemon, setPokemon] = useState(pokemonToEdit || getInitialPokemonState());
    
    const [newMove, setNewMove] = useState('');
    const [abilitySearch, setAbilitySearch] = useState(
        (pokemonToEdit?.abilities || [{ name: '' }]).map(a => a.name)
    );
    const [editingFormId, setEditingFormId] = useState(null);
    const editingForm = pokemon.forms?.find(f => f.id === editingFormId);

    const handleStatChange = (stat, value) => {
        setPokemon(p => ({ ...p, baseStats: { ...p.baseStats, [stat]: Number(value) || 0 }}));
    };
    const handleTypeToggle = (type) => {
        const newTypes = pokemon.types.includes(type)
            ? pokemon.types.filter(t => t !== type)
            : [...pokemon.types, type].slice(0, 2);
        setPokemon(p => ({ ...p, types: newTypes }));
    };
     const handleAbilityChange = (index, value) => {
        const newAbilities = [...(pokemon.abilities || [])];
        newAbilities[index] = { name: value };
        setPokemon(p => ({ ...p, abilities: newAbilities }));
    };
    const handleAddMove = (moveName) => {
        if (moveName && !(pokemon.allMoveNames || []).includes(moveName)) {
            setPokemon(p => ({ ...p, allMoveNames: [...(p.allMoveNames || []), moveName].sort() }));
        }
        setNewMove('');
    };
    const handleRemoveMove = (moveName) => {
        setPokemon(p => ({ ...p, allMoveNames: p.allMoveNames.filter(m => m !== moveName) }));
    };

    // --- NEW FORM MANAGEMENT LOGIC ---
    const handleAddNewForm = () => {
        const newForm = getInitialFormState();
        newForm.data.baseStats = { ...pokemon.baseStats };
        newForm.data.types = [ ...pokemon.types ];
        setPokemon(p => ({ ...p, forms: [...(p.forms || []), newForm] }));
        setEditingFormId(newForm.id); 
    };

    const handleDeleteForm = (formId) => {
        if (window.confirm("Are you sure you want to delete this form?")) {
            setPokemon(p => ({ ...p, forms: p.forms.filter(f => f.id !== formId)}));
            if (editingFormId === formId) setEditingFormId(null);
        }
    };
    
    const handleUpdateForm = (formId, field, value) => {
        const newForms = pokemon.forms.map(f => (f.id === formId) ? { ...f, [field]: value } : f);
        setPokemon(p => ({ ...p, forms: newForms }));
    };

    const handleUpdateFormData = (formId, field, value) => {
        const newForms = pokemon.forms.map(f => (f.id === formId) ? { ...f, data: { ...f.data, [field]: value } } : f);
        setPokemon(p => ({ ...p, forms: newForms }));
    };

    const handleFormStatChange = (formId, stat, value) => {
        const newForms = pokemon.forms.map(f => {
            if (f.id === formId) {
                const newStats = { ...f.data.baseStats, [stat]: Number(value) || 0 };
                return { ...f, data: { ...f.data, baseStats: newStats } };
            }
            return f;
        });
        setPokemon(p => ({ ...p, forms: newForms }));
    };

    const handleFormTypeToggle = (formId, type) => {
        const newForms = pokemon.forms.map(f => {
            if (f.id === formId) {
                 const currentTypes = f.data.types || [];
                 const newTypes = currentTypes.includes(type)
                    ? currentTypes.filter(t => t !== type)
                    : [...currentTypes, type].slice(0, 2);
                 return { ...f, data: { ...f.data, types: newTypes } };
            }
            return f;
        });
        setPokemon(p => ({ ...p, forms: newForms }));
    };

    const handleSaveChanges = () => {
        if (!pokemon.name || pokemon.types.length === 0) {
            alert("A Pokémon must have a name and at least one type.");
            return;
        }
        const finalPokemon = { ...pokemon, forms: pokemon.forms?.map(({ id, ...rest }) => rest) || [] };
        onSave(finalPokemon);
    };

    const renderFormEditor = () => {
        if (!editingForm) return null;

        return (
             <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-[60] p-4">
                <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                    <h3 className="text-2xl font-bold text-yellow-400">Editing Form: {editingForm.formName || 'New Form'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="text-sm">Form Name</label><input type="text" value={editingForm.formName} onChange={e => handleUpdateForm(editingForm.id, 'formName', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md" /></div>
                        <div><label className="text-sm">Sprite URL</label><input type="text" value={editingForm.data.sprite} onChange={e => handleUpdateFormData(editingForm.id, 'sprite', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md" /></div>
                        <div><label className="text-sm">Change Method</label><select value={editingForm.changeMethod} onChange={e => handleUpdateForm(editingForm.id, 'changeMethod', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md"><option value={FORM_CHANGE_METHOD.BATTLE}>Battle</option><option value={FORM_CHANGE_METHOD.ITEM_HOLD}>Item Hold</option></select></div>
                        <div><label className="text-sm">Trigger Item</label><input type="text" value={editingForm.triggerItem} onChange={e => handleUpdateForm(editingForm.id, 'triggerItem', e.target.value)} placeholder="e.g. Charizardite X" className="w-full bg-gray-900 p-2 rounded-md" /></div>
                        <div className="md:col-span-2"><label className="text-sm">Ability</label><input type="text" value={editingForm.data.ability} onChange={e => handleUpdateFormData(editingForm.id, 'ability', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md" /></div>
                    </div>
                    <div><label className="text-sm mb-2 block">Types</label><div className="flex flex-wrap gap-2">{Object.keys(TYPE_COLORS).map(type => (<button key={type} onClick={() => handleFormTypeToggle(editingForm.id, type)} className={`px-3 py-1 text-xs rounded-full uppercase font-bold transition-all ${(editingForm.data.types || []).includes(type) ? `ring-2 ring-white ${TYPE_COLORS[type]}` : `opacity-50 ${TYPE_COLORS[type]}`}`}>{type}</button>))}</div></div>
                    <div><label className="text-sm mb-2 block">Base Stats</label><div className="grid grid-cols-3 md:grid-cols-6 gap-2">{Object.entries(editingForm.data.baseStats).map(([key, value]) => (<div key={key}><label className="text-xs capitalize">{key.replace('special-', 'Sp. ')}</label><input type="number" value={value} onChange={e => handleFormStatChange(editingForm.id, key, e.target.value)} className="w-full bg-gray-900 p-1 rounded-md text-center" /></div>))}</div></div>
                    <div className="flex justify-end"><button onClick={() => setEditingFormId(null)} className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-md font-semibold">Done Editing Form</button></div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            {renderFormEditor()}
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-4xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <h2 className="text-3xl font-bold text-indigo-400">{pokemonToEdit ? 'Edit' : 'Create'} Pokémon</h2>
                
                {/* --- BASE POKEMON EDITOR --- */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label>Name</label><input type="text" value={pokemon.name} onChange={e => setPokemon(p => ({...p, name: e.target.value}))} className="w-full bg-gray-900 p-2 rounded-md"/></div>
                    <div><label>Sprite URL</label><input type="text" value={pokemon.sprite} onChange={e => setPokemon(p => ({...p, sprite: e.target.value}))} className="w-full bg-gray-900 p-2 rounded-md"/></div>
                </div>
                <div><label className="mb-2 block">Types</label><div className="flex flex-wrap gap-2">{Object.keys(TYPE_COLORS).map(type => (<button key={type} onClick={() => handleTypeToggle(type)} className={`px-3 py-1 text-xs rounded-full uppercase font-bold transition-all ${pokemon.types.includes(type) ? `ring-2 ring-white ${TYPE_COLORS[type]}` : `opacity-50 ${TYPE_COLORS[type]}`}`}>{type}</button>))}</div></div>
                <div><label className="mb-2 block">Base Stats</label><div className="grid grid-cols-3 md:grid-cols-6 gap-2">{Object.entries(pokemon.baseStats).map(([key, value]) => (<div key={key}><label className="text-xs capitalize">{key.replace('special-', 'Sp. ')}</label><input type="number" value={value} onChange={e => handleStatChange(key, e.target.value)} className="w-full bg-gray-900 p-1 rounded-md text-center" /></div>))}</div></div>
                <div>
                     <label className="mb-2 block">Abilities</label>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {[0, 1, 2].map(i => (
                            <AutocompleteInput 
                                key={i}
                                value={abilitySearch[i] || ''}
                                onChange={val => setAbilitySearch(s => { const newS = [...s]; newS[i] = val; return newS; })}
                                onSelect={abilityName => handleAbilityChange(i, abilityName)}
                                placeholder={(pokemon.abilities && pokemon.abilities[i]) ? pokemon.abilities[i].name : `Ability ${i+1}`}
                                sourceList={abilityList}
                            />
                        ))}
                    </div>
                </div>
                <div>
                    <label className="mb-2 block">Learnable Moves</label>
                    <div className="flex gap-2 mb-2"><AutocompleteInput value={newMove} onChange={setNewMove} onSelect={handleAddMove} placeholder="Search for a move to add..." sourceList={moveList} /> <button onClick={() => handleAddMove(newMove)} className="bg-indigo-600 hover:bg-indigo-700 px-4 rounded-md font-semibold">Add</button></div>
                    <ul className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-gray-900/50 p-2 rounded-md min-h-[50px] max-h-48 overflow-y-auto">
                        {(pokemon.allMoveNames || []).map(move => (<li key={move} className="flex justify-between items-center bg-gray-700 px-2 py-1 rounded-md text-sm"><span className="capitalize truncate">{move.replace(/-/g, ' ')}</span><button onClick={() => handleRemoveMove(move)} className="text-red-400 font-bold">✕</button></li>))}
                    </ul>
                </div>

                {/* --- NEW FORMS SECTION --- */}
                <div className="pt-4 border-t border-gray-700">
                     <h3 className="text-xl font-semibold text-yellow-300 mb-2">Alternate Forms</h3>
                     <div className="space-y-2">
                        {pokemon.forms?.map((form) => (
                             <div key={form.id} className="p-2 rounded-md bg-gray-700 flex justify-between items-center">
                                 <span>{form.formName || 'Untitled Form'}</span>
                                 <div className="flex gap-2">
                                     <button onClick={() => setEditingFormId(form.id)} className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded">Edit</button>
                                     <button onClick={() => handleDeleteForm(form.id)} className="text-sm bg-red-600 hover:bg-red-700 px-3 py-1 rounded">Delete</button>
                                 </div>
                             </div>
                        ))}
                     </div>
                     <button onClick={handleAddNewForm} className="mt-2 w-full bg-indigo-800 hover:bg-indigo-700 p-2 rounded-md font-semibold text-sm">+ Add New Form</button>
                </div>


                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleSaveChanges} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md font-semibold">Save Pokémon</button>
                </div>
            </div>
        </div>
    );
};

export default CustomPokemonModal;