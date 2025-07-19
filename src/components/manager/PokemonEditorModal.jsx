import React, { useState, useEffect } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
import { calculateStat, fetchItemData, fetchMoveData, getSprite } from '../../utils/api';
import AutocompleteInput from '../common/AutocompleteInput';
import { NON_VOLATILE_STATUSES, VOLATILE_STATUSES, TYPE_COLORS, MOVE_CATEGORY_ICONS, POKEBALLS } from '../../config/gameData';
import { useDynamicStats } from '../../hooks/useDynamicStats';

const PokemonEditorModal = ({ pokemon, onSave, onClose, dispatch, itemList, isWildEditor = false, trainerCategory, partyLevel }) => {
    const { state } = useManagerContext();
    const { customMoves } = state;

    // Store the original form's data to allow reverting changes
    const [baseFormState, setBaseFormState] = useState(null);

    const [editedPokemon, setEditedPokemon] = useState(pokemon);
    const [allMoves, setAllMoves] = useState([]);
    const [isMovesLoading, setIsMovesLoading] = useState(true);
    const [moveSearch, setMoveSearch] = useState(['', '', '', '']);
    const [itemSearch, setItemSearch] = useState(pokemon.heldItem?.name || '');
    const [quantity, setQuantity] = useState(1);
    const calculatedStats = useDynamicStats(editedPokemon, trainerCategory);

    // On initial mount, save the pokemon's base state before any form changes are applied.
    useEffect(() => {
        if (!baseFormState) {
            setBaseFormState({
                ability: pokemon.ability,
                types: pokemon.types,
                baseStats: pokemon.baseStats,
                sprite: pokemon.sprite,
                shinySprite: pokemon.shinySprite
            });
        }
    }, [pokemon, baseFormState]);


    useEffect(() => {
        const processMoveList = async () => {
            setIsMovesLoading(true);
            const moveDataPromises = (editedPokemon.allMoveNames || []).map(name => {
                const customVariant = customMoves.find(cm => cm.name.toLowerCase() === name.toLowerCase());
                return customVariant || fetchMoveData(name);
            });
            const fullMoveData = await Promise.all(moveDataPromises);
            setAllMoves(fullMoveData.sort((a, b) => a.name.localeCompare(b.name)));
            setIsMovesLoading(false);
        };
        processMoveList();
    }, [editedPokemon.allMoveNames, customMoves]);

    const handleFieldChange = (field, value) => setEditedPokemon(p => ({ ...p, [field]: value }));

    // --- MODIFIED FUNCTION ---
    const handleItemSelect = async (itemName) => {
        setItemSearch(itemName);
        const itemData = itemName ? await fetchItemData(itemName) : null;

        // --- MODIFIED LINE ---
        // We now convert both the form's triggerItem and the selected itemName to lowercase for a reliable match.
        const targetForm = editedPokemon.forms?.find(form =>
            form.changeMethod === 'ITEM_HOLD' && form.triggerItem.toLowerCase() === itemName.toLowerCase()
        );

        if (targetForm) {
            // If a form is triggered, apply its data over the base state
            setEditedPokemon(p => ({
                ...p,
                ...baseFormState,
                ...targetForm.data,
                heldItem: itemData,
                maxHp: calculateStat(targetForm.data.baseStats.hp, p.level, true),
                currentHp: calculateStat(targetForm.data.baseStats.hp, p.level, true),
            }));
        } else {
            // If no form matches or item is removed, revert to base state
            setEditedPokemon(p => ({
                ...p,
                ...baseFormState,
                heldItem: itemData,
                maxHp: calculateStat(baseFormState.baseStats.hp, p.level, true),
                currentHp: calculateStat(baseFormState.baseStats.hp, p.level, true),
            }));
        }
    };

    const handleLevelChange = (e) => {
        const newLevel = parseInt(e.target.value, 10) || 1;
        const currentBaseStats = editedPokemon.baseStats; // Use current base stats, which may be from a form
        const newMaxHp = calculateStat(currentBaseStats.hp, newLevel, true);
        const currentHp = editedPokemon.fainted ? 0 : newMaxHp;
        setEditedPokemon(p => ({ ...p, level: newLevel, maxHp: newMaxHp, currentHp }));
    };

    const handleMoveChange = (index, newMove) => {
        const newMoves = [...editedPokemon.moves];
        newMoves[index] = { ...newMove, pp: newMove.maxPp || newMove.pp };
        setEditedPokemon(p => ({ ...p, moves: newMoves }));
    };

    const handlePpChange = (moveIndex, newPp) => {
        const newMoves = [...editedPokemon.moves];
        const move = newMoves[moveIndex];
        const updatedPp = Math.max(0, Math.min(move.maxPp, Number(newPp) || 0));
        newMoves[moveIndex] = { ...move, pp: updatedPp };
        setEditedPokemon(p => ({ ...p, moves: newMoves }));
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

    const handleSaveChanges = () => {
        onSave(editedPokemon, isWildEditor ? quantity : null);
        onClose();
    };

    const getMoveDescription = (move) => {
        if (!move || !move.effect_entries || move.effect_entries.length === 0) return "No description available.";
        const entry = move.effect_entries.find(e => e.language?.name === 'en') || move.effect_entries[0];
        if (!entry) return "No description available.";
        return entry.short_effect.replace(/\$effect_chance/g, move.meta?.ailment_chance);
    };
    const handleShinyToggle = (e) => {
        setEditedPokemon(p => ({ ...p, isShiny: e.target.checked }));
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-4xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <h2 className="text-3xl font-bold text-indigo-400">Edit {pokemon.name}</h2>
                <div className="flex flex-col sm:flex-row gap-4">
                    <img
                        src={getSprite(editedPokemon)} // Use the new helper function here
                        alt={pokemon.name}
                        className="w-24 h-24 bg-gray-700 rounded-md self-center sm:self-start"
                    />
                    <div className="grid grid-cols-2 gap-4 flex-grow">
                        {isWildEditor && (<div><label className="block text-sm font-medium text-gray-400">Quantity</label><input type="number" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" min="1" max="50" /></div>)}
                        <div>
                            <label className="block text-sm font-medium text-gray-400">Level</label>
                            {trainerCategory === 'partyMembers' && !isWildEditor ? (
                                // If it's a Party Member, show the static Party Level
                                <div className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 text-gray-300">
                                    {partyLevel} (Party Level)
                                </div>
                            ) : (
                                // Otherwise, show the editable input
                                <input type="number" value={editedPokemon.level} onChange={handleLevelChange} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600" min="1" max="100" />
                            )}
                        </div>

                        {/* --- NEW GENDER SELECTOR --- */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400">Gender</label>
                            <select
                                value={editedPokemon.gender || 'Genderless'}
                                onChange={(e) => handleFieldChange('gender', e.target.value)}
                                className="w-full bg-gray-900 p-2 rounded-md border border-gray-600"
                            >
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Genderless">Genderless</option>
                            </select>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-400">Ability</label>
                            <select value={editedPokemon.ability} onChange={(e) => handleFieldChange('ability', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 capitalize">
                                {editedPokemon.abilities?.map(ab => <option key={ab.name} value={ab.name.replace(/-/g, ' ')}>{ab.name.replace(/-/g, ' ')}</option>)}
                            </select>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-400">Pokéball</label>
                            <select value={editedPokemon.pokeball} onChange={(e) => handleFieldChange('pokeball', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 capitalize">
                                {POKEBALLS.map(b => <option key={b.name} value={b.name}>{b.name.replace(/-/g, ' ')}</option>)}
                            </select>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-400">Held Item</label>
                            <AutocompleteInput value={itemSearch} onChange={setItemSearch} onSelect={handleItemSelect} placeholder="None" sourceList={itemList} />
                        </div>
                    </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
                    <input
                        type="checkbox"
                        checked={editedPokemon.isShiny || false}
                        onChange={handleShinyToggle}
                        className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded"
                    />
                    Shiny
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Primary Status</label>
                        <select value={editedPokemon.status} onChange={(e) => handleFieldChange('status', e.target.value)} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600">
                            {NON_VOLATILE_STATUSES.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Volatile Conditions</label>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
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
                </div>
                {/* This part will now automatically update when the form changes base stats! */}
                <div><h3 className="text-lg font-semibold text-indigo-300">Stats (Lvl {editedPokemon.level})</h3><ul className="text-sm grid grid-cols-3 sm:grid-cols-6 gap-2 mt-1">{Object.entries(calculatedStats).map(([key, value]) => <li key={key} className="bg-gray-700 p-2 rounded text-center"><span className="font-semibold capitalize block">{key.replace('special-', 'Sp. ')}</span> {value}</li>)}</ul></div>
                <div>
                    <h3 className="text-lg font-semibold text-indigo-300 mb-2">Active Moveset (Select 4)</h3>
                    {isMovesLoading ? <p>Loading moves...</p> : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[0, 1, 2, 3].map(index => {
                                const move = editedPokemon.moves[index];
                                return (
                                    <div key={index} className="bg-gray-700 p-3 rounded-lg space-y-2">
                                        <AutocompleteInput
                                            value={moveSearch[index]}
                                            onChange={(val) => { const newSearches = [...moveSearch]; newSearches[index] = val; setMoveSearch(newSearches); }}
                                            onSelect={(moveName) => {
                                                const newMove = allMoves.find(m => m.name === moveName);
                                                if (newMove) {
                                                    handleMoveChange(index, newMove);
                                                    const newSearches = [...moveSearch];
                                                    newSearches[index] = '';
                                                    setMoveSearch(newSearches);
                                                }
                                            }}
                                            placeholder={move ? `Current: ${move.name}` : 'Select a move...'}
                                            sourceList={allMoves.map(m => m.name)}
                                        />
                                        {move && (
                                            <div className="bg-gray-800 p-2 rounded">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-1 text-xs rounded-full uppercase font-bold ${TYPE_COLORS[move.type]}`}>{move.type}</span>
                                                        <div title={move.damage_class}>{MOVE_CATEGORY_ICONS[move.damage_class]}</div>
                                                    </div>
                                                    <div className="text-xs text-gray-400 flex items-center gap-3">
                                                        <span>Pwr: {move.power || '—'}</span>
                                                        <span>Acc: {move.accuracy || '—'}</span>
                                                        <div className="flex items-center gap-1">
                                                            <span>PP:</span>
                                                            <input
                                                                type="number"
                                                                value={move.pp}
                                                                onChange={(e) => handlePpChange(index, e.target.value)}
                                                                className="w-10 bg-gray-900 p-1 rounded border border-gray-600 text-center"
                                                            />
                                                            <span>/ {move.maxPp}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-gray-300 mt-2">{getMoveDescription(move)}</p>
                                            </div>

                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleSaveChanges} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md font-semibold">{isWildEditor ? 'Add to Team' : 'Save Changes'}</button>
                </div>
            </div>
        </div>
    );
};
export default PokemonEditorModal;