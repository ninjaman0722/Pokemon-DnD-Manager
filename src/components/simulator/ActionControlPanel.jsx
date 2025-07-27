import React, { useState, useEffect } from 'react';
import { TYPE_COLORS, HIGH_CRIT_RATE_MOVES, CRIT_CHANCE_PERCENTAGES, PROTECTIVE_MOVES, Z_CRYSTAL_MAP, MULTI_HIT_MOVES } from '../../config/gameData';
import { FORM_CHANGE_METHOD } from '../../config/constants';
import { calculateCritStage, calculateHitChance } from '../../utils/api';

const ActionControlPanel = ({ pokemon, battleState, allTrainers, queuedAction, onActionReady, onCancelAction, onEnterTargetingMode }) => {
    // --- STATE AND HANDLERS NOW LIVE HERE ---
    const [view, setView] = useState('FIGHT');
    const [showTransformChoice, setShowTransformChoice] = useState(false);
    const [isZMoveMode, setIsZMoveMode] = useState(false);
    const { teams, activePokemonIndices } = battleState;
    const [playerTeam, opponentTeam] = teams;
    const getActivePokemon = (team, indices) => indices.map(i => team.pokemon[i]).filter(p => p && !p.fainted);
    const playerActivePokemon = getActivePokemon(playerTeam, activePokemonIndices.players);
    const opponentActivePokemon = getActivePokemon(opponentTeam, activePokemonIndices.opponent);
    const allActivePokemon = [...playerActivePokemon, ...opponentActivePokemon];
    const teamId = battleState.teams.find(t => t.pokemon.some(p => p.id === pokemon.id))?.id;
    const zMoveHasBeenUsed = battleState.zMoveUsed?.[teamId] || false;
    const crystalData = pokemon.heldItem ? Z_CRYSTAL_MAP[pokemon.heldItem.id] : null;

    const canUseZMove = !zMoveHasBeenUsed && crystalData &&
        ((crystalData.type && pokemon.moves.some(move => move.type === crystalData.type && move.damage_class.name !== 'status')) ||
            (crystalData.pokemon?.toLowerCase() === pokemon.speciesName?.toLowerCase()));

    // --- OTHER HANDLERS ---
    useEffect(() => {
        setView('FIGHT');
        setShowTransformChoice(false);
        setIsZMoveMode(false);
    }, [pokemon.id]);

    const handleViewChange = (newView) => {
        if (view !== newView) {
            onCancelAction();
            setIsZMoveMode(false);
            setView(newView);
        }
    };

    const handleSelectMove = (move) => {
        const moveHitData = MULTI_HIT_MOVES.get(move.name.toLowerCase());
        // This correctly defaults to the minimum number of hits.
        const defaultHits = moveHitData ? moveHitData[0] : 1;

        // Determine if the move's secondary effect should be applied by default.
        const defaultApplyEffect = (move.effects?.[0]?.chance === 100) || (move.meta?.ailment_chance === 100);

        const baseAction = {
            type: 'FIGHT',
            move,
            pokemon,
            applyEffect: defaultApplyEffect,
            isCritical: false,
            willHit: true,
            hits: Array.from({ length: defaultHits }, () => ({ targetId: '' }))
            // All other flags like willFlinch, etc., can be added here if needed.
        };
        onUpdateAction(baseAction);
        onEnterTargetingMode(move, baseAction);
    };

    // --- This function now correctly uses onActionReady ---
    const onUpdateAction = (action) => {
        onActionReady(action);
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

    const isMoveDisabled = (move) => {
        if (move.pp === 0) return true;
        if (pokemon.volatileStatuses?.includes('Taunt') && move.damage_class === 'status') return true;
        if (pokemon.volatileStatuses?.includes('Encore') && move.name !== pokemon.encoredMove) return true;
        if (pokemon.lockedMove && move.name !== pokemon.lockedMove) return true;
        return false;
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
                const selectedMove = queuedAction?.move;

                // If a move is selected, show the detailed controls panel.
                if (selectedMove) {
                    const showApplyEffectCheckbox = (selectedMove?.meta?.ailment?.name !== 'none' && selectedMove?.meta?.ailment_chance > 0) || (selectedMove?.effects?.length > 0);
                    const showCritCheckbox = selectedMove && selectedMove.power > 0;
                    const showWillHitCheckbox = selectedMove && selectedMove.accuracy !== null;
                    const attackerHoldsFlinchItem = ['kings-rock', 'razor-fang'].includes(pokemon.heldItem?.id);
                    const showFlinchCheckbox = selectedMove && selectedMove.power > 0 && attackerHoldsFlinchItem;
                    const isConfused = pokemon.volatileStatuses.includes('Confused');
                    const showConfusionOptions = isConfused && queuedAction;
                    const isInfatuated = pokemon.volatileStatuses.includes('Infatuated');
                    const showInfatuationOptions = isInfatuated && queuedAction;
                    const moveHitData = selectedMove && MULTI_HIT_MOVES.get(selectedMove.name.toLowerCase());
                    const showMultiHitControl = !!moveHitData;
                    const holdsLoadedDice = pokemon.heldItem?.id === 'loaded-dice';
                    const holdsQuickClaw = pokemon.heldItem?.id === 'quick-claw';
                    const showQuickClawCheckbox = holdsQuickClaw && queuedAction;
                    const opponentTeam = battleState.teams.find(t => t.id !== teamId);
                    const validTargets = opponentTeam?.pokemon.filter(p => p && !p.fainted) || [];

                    let hitChanceText = '';
                    if (showWillHitCheckbox && queuedAction?.targetIds?.length > 0) {
                        const primaryTarget = battleState.teams.flatMap(t => t.pokemon).find(p => p.id === queuedAction.targetIds[0]);
                        if (primaryTarget) {
                            const chance = calculateHitChance(pokemon, primaryTarget, selectedMove, battleState);
                            const fraction = chance === 100 ? "4/4" : chance >= 75 ? "3/4" : chance >= 66 ? "2/3" : chance >= 50 ? "1/2" : "<1/2";
                            hitChanceText = ` ${chance}% (${fraction})`;
                        }
                    }

                    let critChance = 'N/A';
                    if (showCritCheckbox) {
                        const critStage = calculateCritStage(pokemon, selectedMove, HIGH_CRIT_RATE_MOVES);
                        critChance = CRIT_CHANCE_PERCENTAGES[critStage] || '100%';
                    }

                    let hitRangeText = '';
                    if (moveHitData) {
                        let minHits = moveHitData[0];
                        const maxHits = moveHitData[1];
                        if (holdsLoadedDice) minHits = 4;
                        hitRangeText = `(${minHits}-${maxHits} hits)`;
                    }

                    const handleHitTargetChange = (hitIndex, targetId) => {
                        const newHits = [...(queuedAction.hits || [])];
                        if (newHits[hitIndex]) {
                            newHits[hitIndex] = { ...newHits[hitIndex], targetId };
                            onUpdateAction({ ...queuedAction, hits: newHits });
                        }
                    };

                    const handleNumberOfHitsChange = (num) => {
                        const newNumberOfHits = Math.max(1, num);
                        const currentHits = queuedAction.hits || [];
                        const newHits = [];
                        const lastTargetId = currentHits.length > 0 ? currentHits[currentHits.length - 1].targetId : (validTargets[0]?.id || '');

                        for (let i = 0; i < newNumberOfHits; i++) {
                            if (currentHits[i]) {
                                newHits.push(currentHits[i]);
                            } else {
                                newHits.push({ targetId: lastTargetId });
                            }
                        }
                        onUpdateAction({ ...queuedAction, hits: newHits.slice(0, newNumberOfHits) });
                    };

                    return (
                        <div className="h-full flex flex-col relative p-2 space-y-3 overflow-y-auto pr-3">
                            <div className="flex justify-between items-center flex-shrink-0">
                                <h3 className="text-xl font-bold text-yellow-300 capitalize">{selectedMove.name}</h3>
                                <button onClick={onCancelAction} className="text-sm bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded">Change Move</button>
                            </div>

                            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap p-2 border border-gray-700 rounded-lg">
                                {showWillHitCheckbox && <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input type="checkbox" checked={queuedAction?.willHit ?? true} onChange={(e) => handleToggleStatusEvent('willHit', e.target.checked)} className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded" />
                                    Will it hit?
                                    <span className="text-yellow-300 font-mono">{hitChanceText}</span>
                                </label>}
                                {showCritCheckbox && <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input type="checkbox" checked={queuedAction?.isCritical || false} onChange={(e) => handleToggleStatusEvent('isCritical', e.target.checked)} className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded" />
                                    Critical Hit? ({critChance})
                                </label>}
                                {showApplyEffectCheckbox && <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input type="checkbox" checked={queuedAction?.applyEffect || false} onChange={handleToggleEffect} className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded" />
                                    Apply Effect?
                                </label>}
                                {showFlinchCheckbox && <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input type="checkbox" checked={queuedAction?.willFlinch || false} onChange={(e) => handleToggleStatusEvent('willFlinch', e.target.checked)} className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded" />
                                    Will it flinch? (10%)
                                </label>}
                                {showQuickClawCheckbox && (
                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-cyan-300">
                                        <input type="checkbox" checked={queuedAction?.quickClawActivated || false} onChange={(e) => handleToggleStatusEvent('quickClawActivated', e.target.checked)} className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded" />
                                        Quick Claw? (20%)
                                    </label>
                                )}
                                {showConfusionOptions && (
                                    <>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm text-teal-300">
                                            <input type="checkbox" checked={queuedAction?.willSnapOutOfConfusion || false} onChange={(e) => handleToggleStatusEvent('willSnapOutOfConfusion', e.target.checked)} className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded" />
                                            Snap out?
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm text-teal-300">
                                            <input type="checkbox" checked={queuedAction?.willHurtSelfInConfusion || false} onChange={(e) => handleToggleStatusEvent('willHurtSelfInConfusion', e.target.checked)} className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded" />
                                            Hurt self?
                                        </label>
                                    </>
                                )}
                                {showInfatuationOptions && (
                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-pink-400">
                                        <input type="checkbox" checked={queuedAction?.isImmobilizedByLove || false} onChange={(e) => handleToggleStatusEvent('isImmobilizedByLove', e.target.checked)} className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded" />
                                        Immobilized by love?
                                    </label>
                                )}
                            </div>

                            {showMultiHitControl && queuedAction && (
                                <div className="p-3 border border-gray-700 rounded-lg bg-gray-800/50 space-y-2">
                                    <div className="flex items-center gap-3">
                                        <label className="text-sm font-bold text-white">Number of Hits:</label>
                                        <input
                                            type="number"
                                            min={holdsLoadedDice ? 4 : moveHitData[0]}
                                            max={moveHitData[1]}
                                            value={queuedAction.hits?.length || (holdsLoadedDice ? 4 : moveHitData[0])}
                                            onChange={(e) => handleNumberOfHitsChange(parseInt(e.target.value, 10))}
                                            className="w-16 bg-gray-700 border-gray-600 rounded text-center"
                                        />
                                        <span className="text-xs text-gray-400">{hitRangeText}</span>
                                        {holdsLoadedDice && <span className="text-xs font-semibold text-yellow-300">(Loaded Dice!)</span>}
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                        {queuedAction.hits?.map((hit, index) => (
                                            <div key={index} className="flex flex-col p-1 bg-gray-900/50 rounded">
                                                <label className="text-xs text-gray-400 mb-1">Hit {index + 1}</label>
                                                <select
                                                    value={hit.targetId}
                                                    onChange={(e) => handleHitTargetChange(index, e.target.value)}
                                                    className="bg-gray-700 border border-gray-600 rounded p-1 text-sm focus:ring-yellow-400 focus:border-yellow-400"
                                                >
                                                    {validTargets.map(target => (
                                                        <option key={target.id} value={target.id}>{target.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                }
                // Otherwise, show the default move selection view.
                else {
                    const showTransformButton = canTransform;
                    const showZMoveButton = canUseZMove;

                    return (
                        <div className="h-full flex flex-col relative">
                            {renderTransformChoice()}
                            <div className="grid grid-cols-2 gap-2 flex-grow">
                                {isZMoveMode ? (
                                    pokemon.moves.map((move, index) => {
                                        const canBeZMove = crystalData.type && move.type === crystalData.type && move.damage_class.name !== 'status';
                                        const handleZMoveSelect = () => {
                                            const zMoveAction = { type: 'Z_MOVE', pokemon, baseMove: move, isCritical: false, hits: [{ targetId: '' }] };
                                            onEnterTargetingMode(move, zMoveAction);
                                            setIsZMoveMode(false);
                                        };
                                        return (
                                            <button key={index} onClick={handleZMoveSelect} disabled={!canBeZMove} className="p-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-md border-b-4 border-black/20 text-lg flex flex-col justify-center items-center disabled:bg-gray-700 disabled:opacity-50">
                                                <span className="text-yellow-300">{crystalData.moveName}</span>
                                                <span className="text-xs opacity-80">(from {move.name})</span>
                                            </button>
                                        );
                                    })
                                ) : (
                                    pokemon.moves.map(move => {
                                        const disabled = isMoveDisabled(move);
                                        const typeColor = TYPE_COLORS[move.type] || 'bg-gray-500';
                                        return (
                                            <button key={move.name} onClick={() => handleSelectMove(move)} disabled={disabled} className={`${typeColor} p-2 rounded capitalize font-semibold shadow-md border-b-4 border-black/20 text-lg flex flex-col justify-center items-center disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed`}>
                                                <span>{move.name}</span>
                                                <span className="text-xs opacity-80">{move.pp}/{move.maxPp} PP</span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-auto pt-3">
                                {isZMoveMode && <button onClick={() => setIsZMoveMode(false)} className="bg-gray-600 hover:bg-gray-500 p-2 rounded w-full font-bold">Cancel Z-Move</button>}
                                {showZMoveButton && <button onClick={() => setIsZMoveMode(true)} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-md">Z-Move</button>}
                                {showTransformButton && <button onClick={() => setShowTransformChoice(true)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md">Mega Evolve!</button>}
                            </div>
                        </div>
                    );
                }
        }
    };

    return (
        <div className="bg-gray-900 rounded-lg p-4 flex gap-4 h-full">
            <div className="w-2/3">{renderContent()}</div>
            <div className="w-1/3 flex flex-col gap-2">
                <button onClick={() => handleViewChange('FIGHT')} disabled={view === 'FIGHT'} className="bg-red-600 hover:bg-red-700 font-bold p-3 rounded-lg text-lg disabled:bg-red-800 disabled:opacity-70 flex-1">FIGHT</button>
                <button onClick={() => handleViewChange('POKEMON')} disabled={view === 'POKEMON' || isTrapped} className="bg-green-600 hover:bg-green-700 font-bold p-3 rounded-lg text-lg disabled:bg-gray-600 disabled:cursor-not-allowed flex-1">POKéMON</button>
                <button onClick={() => handleViewChange('BAG')} disabled={!canUseBag || view === 'BAG'} className="bg-blue-600 hover:bg-blue-700 font-bold p-3 rounded-lg text-lg disabled:bg-gray-600 disabled:cursor-not-allowed flex-1">BAG</button>
            </div>
        </div>
    );
};

export default ActionControlPanel;