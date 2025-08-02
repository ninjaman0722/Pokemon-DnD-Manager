import React, { useState, useEffect } from 'react';
import { TYPE_COLORS, HIGH_CRIT_RATE_MOVES, CRIT_CHANCE_PERCENTAGES, PROTECTIVE_MOVES, MULTI_HIT_MOVES } from '../../config/gameData';
import { FORM_CHANGE_METHOD } from '../../config/constants';
import { calculateCritStage, calculateHitChance } from '../../utils/api';

const ActionControlPanel = ({ pokemon, battleState, allTrainers, queuedAction, onActionReady, onCancelAction, onEnterTargetingMode }) => {
    // --- STATE AND HANDLERS NOW LIVE HERE ---
    const [view, setView] = useState('FIGHT');
    const [showTransformChoice, setShowTransformChoice] = useState(false);
    const { teams, activePokemonIndices } = battleState;
    const [playerTeam, opponentTeam] = teams;
    const getActivePokemon = (team, indices) => indices.map(i => team.pokemon[i]).filter(p => p && !p.fainted);
    const playerActivePokemon = getActivePokemon(playerTeam, activePokemonIndices.players);
    const opponentActivePokemon = getActivePokemon(opponentTeam, activePokemonIndices.opponent);
    const allActivePokemon = [...playerActivePokemon, ...opponentActivePokemon];
    const teamId = battleState.teams.find(t => t.pokemon.some(p => p.id === pokemon.id))?.id;
    const [localAction, setLocalAction] = useState(null);

    // --- OTHER HANDLERS ---
    useEffect(() => {
        setView('FIGHT');
        setShowTransformChoice(false);
        setLocalAction(null);
    }, [pokemon.id]);

    const onUpdateAction = (action) => {
        onActionReady(action);
    };

    const handleSelectMove = (move) => {
        const moveId = move.name.toLowerCase().replace(' ', '-');
        const moveHitData = MULTI_HIT_MOVES.get(moveId);

        // Determine if the move's secondary effect should be applied by default.
        const defaultApplyEffect = (move.effects?.[0]?.chance === 100) || (move.meta?.ailment_chance === 100);

        const baseAction = {
            type: 'FIGHT',
            move,
            pokemon,
            applyEffect: defaultApplyEffect,
            isCritical: false,
            willHit: true,
            hits: Array.from({ length: moveHitData?.[0] || 1 }, () => ({ targetId: '' }))
        };

        setLocalAction(baseAction);

        // For non-multi-hit moves, immediately enter targeting mode
        if (!moveHitData) {
            onEnterTargetingMode(move, baseAction);
        }
    };

    const handleConfirmMultiHitMove = () => {
        if (!localAction || !localAction.hits) return;
        const uniqueTargetIds = [...new Set(localAction.hits.map(hit => hit.targetId).filter(Boolean))];

        if (uniqueTargetIds.length === 0) {
            // Handle case where no targets were selected
            console.warn("No targets selected for multi-hit move.");
            return;
        }

        const finalAction = { ...localAction, targetIds: uniqueTargetIds };

        // NOW, officially queue the action
        onActionReady(finalAction);

        // Reset the local state to hide the detail panel
        setLocalAction(null);
    };

    const handleNumberOfHitsChange = (num) => {
        if (!localAction) return;
        const selectedMove = localAction.move;
        const moveId = selectedMove.name.toLowerCase().replace(/ /g, '-');
        const moveHitData = MULTI_HIT_MOVES.get(moveId);
        if (!moveHitData) return;

        const newNumberOfHits = Math.max(moveHitData[0], Math.min(moveHitData[1], num));
        const currentHits = localAction.hits || [];
        const newHits = [];
        const lastTargetId = currentHits.length > 0 ? currentHits[currentHits.length - 1].targetId : '';

        for (let i = 0; i < newNumberOfHits; i++) {
            newHits.push(currentHits[i] || { targetId: lastTargetId });
        }

        setLocalAction(prev => ({ ...prev, hits: newHits }));
    };

    // --- CORRECTED: This now updates the 'localAction' state ---
    const handleHitTargetChange = (hitIndex, targetId) => {
        if (!localAction) return;
        const newHits = [...(localAction.hits || [])];
        if (newHits[hitIndex]) {
            newHits[hitIndex].targetId = targetId;
            setLocalAction(prev => ({ ...prev, hits: newHits }));
        }
    };

    // --- ADDED: The missing cancel function for the "Change Move" button ---
    const handleCancelLocalAction = () => {
        setLocalAction(null);
        // We call the main onCancelAction in case a single-target move was queued
        onCancelAction();
    };
    const handleViewChange = (newView) => {
        if (view !== newView) {
            onCancelAction();
            setView(newView);
        }
    };

    const isMoveDisabled = (move) => {
        if (move.pp === 0) return true;
        if (pokemon.volatileStatuses?.includes('Taunt') && move.damage_class === 'status') return true;
        if (pokemon.volatileStatuses?.includes('Encore') && move.name !== pokemon.encoredMove) return true;
        if (pokemon.lockedMove && move.name !== pokemon.lockedMove) return true;
        return false;
    };

    const handleToggleStatusEvent = (flag, isChecked) => {
        const currentAction = queuedAction || { type: 'FIGHT', move: null, pokemon };
        onUpdateAction({ ...currentAction, [flag]: isChecked });
    };

    const handleToggleEffect = (e) => {
        const isChecked = e.target.checked;
        if (queuedAction?.type === 'FIGHT' || queuedAction?.type === 'TRANSFORM') {
            onUpdateAction({ ...queuedAction, applyEffect: isChecked });
        }
    };

    const canUseBag = pokemon && pokemon.originalTrainerId;
    const currentTeam = battleState.teams.find(t => t.id === teamId);
    const benched = currentTeam.pokemon.filter(p =>
        !battleState.activePokemonIndices[currentTeam.id === 'players' ? 'players' : 'opponent'].includes(currentTeam.pokemon.indexOf(p)) &&
        !p.fainted &&
        p.originalTrainerId === pokemon.originalTrainerId
    );
    const isTrapped = pokemon.volatileStatuses?.some(s => s.name === 'Trapped') && pokemon.heldItem?.id !== 'shed-shell';

    const renderTransformChoice = () => {
        if (!showTransformChoice || availableTransforms.length === 0) return null;
        return (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                <h3 className="text-2xl font-bold text-yellow-300 mb-4">Choose a Form</h3>
                <div className="flex gap-4">
                    {availableTransforms.map(form => (
                        <button key={form.formName} onClick={() => handleSelectTransform(form)} className="bg-purple-600 hover:bg-purple-700 p-2 rounded flex flex-col items-center text-center text-white font-semibold">
                            <img src={form.data.sprite} alt={form.formName} className="h-24 w-24" />
                            <span className="mt-1 text-lg truncate">{form.formName}</span>
                        </button>
                    ))}
                </div>
                <button onClick={() => setShowTransformChoice(false)} className="mt-6 bg-gray-600 px-4 py-2 rounded">Cancel</button>
            </div>
        );
    };
    const availableTransforms = (pokemon.forms || []).filter(form => {
        if (form.changeMethod !== 'BATTLE') return false;
        if (form.triggerMove && pokemon.speciesName === 'rayquaza') {
            return pokemon.moves.some(m => m.name.toLowerCase() === form.triggerMove.toLowerCase());
        }
        if (form.triggerItem && pokemon.heldItem?.id) {
            return form.triggerItem.toLowerCase().replace(/\s/g, '-') === pokemon.heldItem.id;
        }
        return false;
    });
    const handleSelectTransform = (form) => {
        onActionReady({
            ...queuedAction,
            type: 'TRANSFORM',
            form,
        });
        setShowTransformChoice(false);
    };
    const canTransform = availableTransforms.length > 0;
    const renderContent = () => {
        switch (view) {
            case 'POKEMON':
                if (isTrapped) return <p className="text-yellow-400 italic text-center my-auto">Cannot switch out while trapped!</p>;
                return benched.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto h-full pr-2">
                        {benched.map(p => (
                            <button key={p.id} onClick={() => onUpdateAction({ type: 'SWITCH', newPokemonId: p.id, pokemon })} className={`bg-gray-700 hover:bg-gray-600 p-2 rounded flex flex-col items-center text-center ${queuedAction?.type === 'SWITCH' && queuedAction?.targetId === p.id ? 'ring-2 ring-yellow-300' : ''}`}>
                                <img src={p.sprite} alt={p.name} className="h-20 w-20" />
                                <span className="text-sm font-semibold truncate">{p.name}</span>
                            </button>
                        ))}
                    </div>
                ) : <p className="text-gray-400 italic text-center my-auto">No Pokémon to switch to.</p>;
            case 'BAG':
                return <p className="text-gray-400 italic text-center my-auto">Using items from this panel is under development.</p>;
            // Inside renderContent function in ActionControlPanel.jsx

            case 'FIGHT':
            default:
                if (pokemon.chargingMove) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4">
                            <h3 className="text-2xl font-bold text-yellow-400">Charging Move!</h3>
                            <p className="text-lg capitalize">
                                {pokemon.name} is charging <span className="font-semibold">{pokemon.chargingMove.name}</span>.
                            </p>
                        </div>
                    );
                }
                if (queuedAction) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4">
                            <h3 className="text-2xl font-bold text-green-400">Action Confirmed!</h3>
                            <p className="text-lg capitalize">
                                {pokemon.name} will use <span className="font-semibold">{queuedAction.move.name}</span>.
                            </p>
                            <button onClick={onCancelAction} className="mt-4 bg-red-600 hover:bg-red-700 px-4 py-2 rounded">
                                Cancel Action
                            </button>
                        </div>
                    );
                }

                if (localAction) {
                    const selectedMove = localAction.move;
                    const moveId = selectedMove.name.toLowerCase().replace(/ /g, '-');
                    const moveHitData = MULTI_HIT_MOVES.get(moveId);
                    const showMultiHitControl = !!moveHitData;
                    const opponentTeam = battleState.teams.find(t => t.id !== teamId);
                    const validTargets = opponentTeam?.pokemon.filter(p => p && !p.fainted) || [];

                    return (
                        <div className="h-full flex flex-col p-2 space-y-3">
                            <div className="flex justify-between items-center flex-shrink-0">
                                <h3 className="text-xl font-bold text-yellow-300 capitalize">{selectedMove.name}</h3>
                                <button onClick={handleCancelLocalAction} className="text-sm bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded">Change Move</button>
                            </div>

                            <div className="flex-grow overflow-y-auto pr-3 space-y-3">
                                {showMultiHitControl && (
                                    <div className="p-3 border border-gray-700 rounded-lg bg-gray-800/50 space-y-2">
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-bold text-white">Number of Hits:</label>
                                            <input type="number" min={moveHitData[0]} max={moveHitData[1]} value={localAction.hits?.length || moveHitData[0]} onChange={(e) => handleNumberOfHitsChange(parseInt(e.target.value, 10))} className="w-16 bg-gray-700 border-gray-600 rounded text-center" />
                                            <span className="text-xs text-gray-400">({moveHitData[0]}-{moveHitData[1]} hits)</span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                            {localAction.hits?.map((hit, index) => (
                                                <div key={index} className="flex flex-col p-1 bg-gray-900/50 rounded">
                                                    <label className="text-xs text-gray-400 mb-1">Hit {index + 1}</label>
                                                    <select value={hit.targetId} onChange={(e) => handleHitTargetChange(index, e.target.value)} className="bg-gray-700 border border-gray-600 rounded p-1 text-sm">
                                                        <option value="">- Target -</option>
                                                        {validTargets.map(target => (<option key={target.id} value={target.id}>{target.name}</option>))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex-shrink-0 text-center pt-2">
                                {showMultiHitControl ? (
                                    <button onClick={handleConfirmMultiHitMove} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg w-full">Confirm Move</button>
                                ) : (
                                    <p className="text-gray-400 italic">Please select target(s) on the battlefield.</p>
                                )}
                            </div>
                        </div>
                    );
                }
        };
        return (
            <div className="grid grid-cols-2 gap-2 h-full">
                {pokemon.moves.map(move => {
                    const disabled = isMoveDisabled(move);
                    const typeColor = TYPE_COLORS[move.type] || 'bg-gray-500';
                    return (
                        <button key={move.name} onClick={() => handleSelectMove(move)} disabled={disabled} className={`${typeColor} p-2 rounded capitalize font-semibold shadow-md text-lg flex flex-col justify-center items-center disabled:bg-gray-600`}>
                            <span>{move.name}</span>
                            <span className="text-xs opacity-80">{move.pp}/{move.maxPp} PP</span>
                        </button>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="bg-gray-900 rounded-lg p-4 flex gap-4 h-full">
            <div className="w-2/3">{renderContent()}</div>
            <div className="w-1/3 flex flex-col gap-2">
                <button onClick={() => setView('FIGHT')} disabled={view === 'FIGHT'} className="bg-red-600 hover:bg-red-700 font-bold p-3 rounded-lg text-lg disabled:bg-red-800 flex-1">FIGHT</button>
                <button onClick={() => setView('POKEMON')} disabled={view === 'POKEMON'} className="bg-green-600 hover:bg-green-700 font-bold p-3 rounded-lg text-lg disabled:bg-gray-600 flex-1">POKéMON</button>
                <button onClick={() => setView('BAG')} disabled={view === 'BAG'} className="bg-blue-600 hover:bg-blue-700 font-bold p-3 rounded-lg text-lg disabled:bg-gray-600 flex-1">BAG</button>
            </div>
        </div>
    );
};

export default ActionControlPanel;