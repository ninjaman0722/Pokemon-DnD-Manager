import React, { useState, useEffect, useMemo } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';
import { useBattleEngine } from '../../hooks/useBattleEngine';
import TeamSidebar from './TeamSidebar';
import BattlePokemonCard from './BattlePokemonCard';
import TurnOrderDisplay from './TurnOrderDisplay';
import MasterControlPanel from './MasterControlPanel';
import ActionControlPanel from './ActionControlPanel';
import BattleLog from './BattleLog';
import PokemonStatEditorModal from './PokemonStatEditorModal';
import HazardDisplay from './HazardDisplay';
import TargetingBanner from './TargetingBanner';
import TurnResolutionModal from './TurnResolutionModal';

const BattleScreen = ({ battleState, battleId, allTrainers }) => {
    const [queuedActions, setQueuedActions] = useState({});
    const [activePanelPokemonId, setActivePanelPokemonId] = useState(null);
    const [isAiEnabled, setIsAiEnabled] = useState(false);
    const [turnOrder, setTurnOrder] = useState([]);
    const [editingPokemonStats, setEditingPokemonStats] = useState(null);
    const [isCompactView, setIsCompactView] = useState(true);
    const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
    const [resolutionData, setResolutionData] = useState([]);

    const {
        isProcessingTurn,
        handlePrepareTurn,
        handleConfirmAndExecuteTurn, // This function will be new
        handleSwitchIn,
        handleStartOfBattle,
    } = useBattleEngine(
        battleState, battleId, allTrainers, queuedActions, setQueuedActions, setTurnOrder,
        // Pass the new state setters to the hook
        setIsResolutionModalOpen, setResolutionData
    );
    useEffect(() => {
        // When the component first loads, if the phase is START_OF_BATTLE, run the handler.
        if (battleState && battleState.phase === 'START_OF_BATTLE') {
            handleStartOfBattle();
        }
    }, [battleState?.phase]);
    const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);
    const { teams, log, activePokemonIndices, phase, replacementInfo, field } = battleState;
    const [playerTeam, opponentTeam] = teams;

    const getActivePokemon = (team, indices) => {
        // Add a guard clause to prevent this error from ever happening again
        if (!indices) return [];
        return indices.map(i => team.pokemon[i]).filter(p => p && !p.fainted);
    };

    // The key for the player's active indices is 'players'.
    const playerIndices = activePokemonIndices.players || [];

    // The key for the opponent's indices is their actual team ID (e.g., 'wild').
    const opponentKey = opponentTeam?.id;
    const opponentIndices = (opponentKey && activePokemonIndices[opponentKey]) ? activePokemonIndices[opponentKey] : [];

    // Now we use these safe variables to get the active Pokémon.
    const playerActivePokemon = getActivePokemon(playerTeam, playerIndices);
    const opponentActivePokemon = getActivePokemon(opponentTeam, opponentIndices);

    const allActivePokemon = useMemo(() => [...playerActivePokemon, ...opponentActivePokemon], [playerActivePokemon, opponentActivePokemon]);
    if (process.env.NODE_ENV === 'development') {
        const allIds = allActivePokemon.map(p => p.id);
        if (new Set(allIds).size !== allIds.length) {
            console.error('Duplicate Pokémon IDs detected in battle:', allIds);
        }
    }
    const [targetingInfo, setTargetingInfo] = useState({ isActive: false, potential: [], selected: [], baseAction: null });
    const handleTargetSelection = (targetId) => {
        if (!targetingInfo.isActive || !targetingInfo.potential.includes(targetId)) return;
        const moveTargetType = targetingInfo.baseAction.move.target.name;

        // Define which move types should only ever have one target
        const singleTargetTypes = new Set([
            'specific-move',
            'selected-pokemon',
            'user-or-ally',
            'ally'
        ]);
        setTargetingInfo(prev => {
            // If the move is a single-target type, clicking a new target REPLACES the selection.
            if (singleTargetTypes.has(moveTargetType)) {
                // If the clicked target is already selected, deselect it. Otherwise, select it.
                const newSelection = prev.selected.includes(targetId) ? [] : [targetId];
                return { ...prev, selected: newSelection };
            } else {
                // Otherwise (for multi-target moves), toggle the selection as before.
                const newSelection = prev.selected.includes(targetId)
                    ? prev.selected.filter(id => id !== targetId)
                    : [...prev.selected, targetId];
                return { ...prev, selected: newSelection };
            }
        });
    };
    const handleConfirmTargets = () => {
        if (targetingInfo.selected.length === 0) return;
        updateQueuedAction({ // <-- CORRECTED
            ...targetingInfo.baseAction,
            targetIds: targetingInfo.selected,
            hits: targetingInfo.selected.map(id => ({ targetId: id }))
        });
        setTargetingInfo({ isActive: false, potential: [], selected: [], baseAction: null });
    };
    const handleCancelTargeting = () => {
        setTargetingInfo({ isActive: false, potential: [], selected: [], baseAction: null });
    };
    const handleEnterTargetingMode = (move, baseAction) => {
        const teamId = teams.find(t => t.pokemon.some(p => p.id === baseAction.pokemon.id))?.id;
        const targetType = move.target.name;
        const potentialOpponents = teamId === 'players' ? opponentActivePokemon : playerActivePokemon;
        const potentialAllies = teamId === 'players' ? playerActivePokemon : opponentActivePokemon;
        let potentialTargets = [];

        switch (targetType) {
            case 'specific-move': case 'selected-pokemon': case 'random-opponent': case 'all-opponents':
                potentialTargets = potentialOpponents; break;
            case 'all-other-pokemon':
                potentialTargets = allActivePokemon.filter(p => p.id !== baseAction.pokemon.id); break;
            case 'user-or-ally':
                potentialTargets = potentialAllies; break;
            case 'ally':
                potentialTargets = potentialAllies.filter(p => p.id !== baseAction.pokemon.id); break;
        default:
            updateQueuedAction({ 
                ...baseAction, 
                targetIds: [baseAction.pokemon.id],
                hits: [{ targetId: baseAction.pokemon.id }] 
            }); 
            return;
    }
        setTargetingInfo({ isActive: true, potential: potentialTargets.map(p => p.id), selected: [], baseAction });
    };
    useEffect(() => {
        if (!allActivePokemon.some(p => p.id === activePanelPokemonId) && playerActivePokemon.length > 0) {
            setActivePanelPokemonId(playerActivePokemon[0].id);
        }
    }, [allActivePokemon, activePanelPokemonId, playerActivePokemon]);

    const selectedPokemonForPanel = allActivePokemon.find(p => p.id === activePanelPokemonId);

    const handleTurnChange = async (newTurn) => {
        if (newTurn > 0) await updateDoc(battleDocRef, { turn: newTurn });
    };
    const handleFieldChange = async (newField) => {
        await updateDoc(battleDocRef, { field: newField });
    };
    const handleHazardChange = async (side, hazardKey, newLayerCount) => {
        const newHazards = { ...field.hazards };
        if (newLayerCount === 0) {
            delete newHazards[side][hazardKey];
        } else {
            newHazards[side] = { ...newHazards[side], [hazardKey]: newLayerCount };
        }
        await updateDoc(battleDocRef, { 'field.hazards': newHazards });
    };
    const updateQueuedAction = (action) => {
        setQueuedActions(prev => ({ ...prev, [action.pokemon.id]: action }));
    };
    const cancelAction = (pokemonId) => {
        setQueuedActions(prev => {
            const { [pokemonId]: _, ...rest } = prev;
            return rest;
        });
    };
    const handleDirectPokemonUpdate = async (updatedPokemon) => {
        const newTeams = JSON.parse(JSON.stringify(teams));
        const team = newTeams.find(t => t.pokemon.some(p => p.id === updatedPokemon.id));
        if (!team) return;
        const pokemonIndex = team.pokemon.findIndex(p => p.id === updatedPokemon.id);
        if (pokemonIndex === -1) return;
        team.pokemon[pokemonIndex] = updatedPokemon;
        await updateDoc(battleDocRef, { teams: newTeams });
    };
    const handleClearLog = async () => {
        await updateDoc(battleDocRef, { log: [] });
    };

    const controllablePokemon = [...playerActivePokemon, ...(opponentTeam.name !== 'Wild Pokémon' || !isAiEnabled ? opponentActivePokemon : [])];
    const allActionsQueued = controllablePokemon.every(p =>
        queuedActions[p.id] || p.chargingMove || p.lockedMove
    );

    const handleConfirmResolution = (dmOverrides) => {
        setIsResolutionModalOpen(false);
        handleConfirmAndExecuteTurn(dmOverrides); // Call the final execution function
    };
    const renderControlArea = () => {
        const actionPanelContent = () => {
            if (phase === 'REPLACEMENT' && replacementInfo) {
                // --- ADD LOG #1 ---
                console.log('[UI Log] Received replacementInfo:', replacementInfo);

                const { teamIndex, slotIndex, originalTrainerId } = replacementInfo;
                const team = teams[teamIndex];
                const teamKey = teamIndex === 0 ? 'players' : opponentKey;
                const activeIndicesForTeam = activePokemonIndices[teamKey] || [];
                const faintedPokemon = team.pokemon[activeIndicesForTeam[slotIndex]];
                
                // --- REPLACE THE 'availableReplacements' LINE WITH THIS BLOCK ---
                console.log(`[UI Log] Filtering for Pokémon with trainer ID: "${originalTrainerId}"`);
                const availableReplacements = team.pokemon.filter((p, i) => {
                    if (!p || p.fainted || activeIndicesForTeam.includes(i)) {
                        return false; // Skip fainted or active Pokémon
                    }
                    
                    const trainerIdMatch = p.originalTrainerId === originalTrainerId;
                    console.log(`[UI Log] Checking benched Pokémon "${p.name}": Its trainer ID is "${p.originalTrainerId}". Does it match? ${trainerIdMatch}`);
                    
                    return trainerIdMatch;
                });
                console.log('[UI Log] Final list of available replacements:', availableReplacements);
                // --- END REPLACEMENT ---

                if (!faintedPokemon) {
                    return <div>Error: Could not find the fainted Pokémon's data.</div>;
                }
                return (
                    <div className="bg-gray-900 rounded-lg p-4 flex flex-col justify-between h-full">
                        <p className="text-lg">Choose a replacement for {faintedPokemon.name}:</p>
                        <div className="grid grid-cols-3 gap-2">
                            {availableReplacements.map(p => (
                                <button key={p.id} onClick={() => handleSwitchIn(teamIndex, slotIndex, p.id)} className="bg-gray-700 hover:bg-gray-600 p-2 rounded flex flex-col items-center">
                                    <img src={p.isShiny ? (p.shinySprite || p.sprite) : p.sprite} alt={p.name} className="h-16 w-16" />
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            }
            if (targetingInfo.isActive) {
                return (
                    <div className="bg-gray-800 rounded-lg p-4 h-full flex flex-col items-center justify-center text-center gap-4">
                        <h2 className="text-xl font-bold text-yellow-400">Select Target(s) for {targetingInfo.baseAction.move.name}</h2>
                        <div>
                            <button onClick={handleConfirmTargets} disabled={targetingInfo.selected.length === 0} className="bg-green-600 hover:bg-green-700 font-bold py-2 px-6 rounded-lg text-lg disabled:bg-gray-600 disabled:cursor-not-allowed mx-2">Confirm Targets</button>
                            <button onClick={handleCancelTargeting} className="bg-red-600 hover:bg-red-700 font-bold py-2 px-6 rounded-lg text-lg mx-2">Cancel</button>
                        </div>
                    </div>
                );
            }
            if (selectedPokemonForPanel) {
                return (
                    <ActionControlPanel
                        pokemon={selectedPokemonForPanel}
                        battleState={battleState}
                        allTrainers={allTrainers}
                        queuedAction={queuedActions[selectedPokemonForPanel.id]}
                        onActionReady={updateQueuedAction}
                        onCancelAction={() => cancelAction(selectedPokemonForPanel.id)}
                        onEnterTargetingMode={handleEnterTargetingMode}
                    />
                );
            }
            return <div className="..."><p>Select a Pokémon to act.</p></div>;
        };

        const masterControlPanel = (
            <MasterControlPanel
                allActivePokemon={allActivePokemon}
                activePanelPokemonId={activePanelPokemonId}
                queuedActions={queuedActions}
                isAiEnabled={isAiEnabled}
                isCompactView={isCompactView}
                allActionsQueued={allActionsQueued}
                phase={phase}
                turn={battleState.turn}
                field={field}
                isProcessingTurn={isProcessingTurn}
                onToggleCompactView={() => setIsCompactView(!isCompactView)}
                onPokemonSelect={setActivePanelPokemonId}
                onAiToggle={(e) => setIsAiEnabled(e.target.checked)}
                onExecuteTurn={handlePrepareTurn}
                dmOverrides={{}} // Pass a dummy or remove if MasterControlPanel is fully reverted
                onDmOverrideChange={() => { }} // Pass a dummy or remove
                onTurnChange={handleTurnChange}
                onFieldChange={handleFieldChange}
                onHazardChange={handleHazardChange}
                playerTeamId={playerTeam.id} // Pass player's actual team ID
                opponentTeamId={opponentKey} // Pass opponent's actual team ID
                targetingInfo={{ isActive: false }} // Pass a dummy object as it's no longer used here
            />
        );
        if (isCompactView) {
            return (
                <div className="grid grid-cols-2 gap-2 h-full">
                    <div className="h-full">{actionPanelContent()}</div>
                    <div className="h-full">{masterControlPanel}</div>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-2 grid-rows-2 gap-2 h-full">
                <div className="col-span-2 row-span-1">
                    <BattleLog log={log} onClearLog={handleClearLog} />
                </div>
                <div className="h-full">{actionPanelContent()}</div>
                <div className="h-full">{masterControlPanel}</div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-800 text-white p-2 sm:p-4 flex flex-col font-sans h-screen">
            <TurnResolutionModal
                isOpen={isResolutionModalOpen}
                turnData={resolutionData}
                onConfirm={handleConfirmResolution}
                onCancel={() => setIsResolutionModalOpen(false)}
                battleState={battleState}
                queuedActions={queuedActions}
            />
            {editingPokemonStats && <PokemonStatEditorModal pokemon={editingPokemonStats} onSave={handleDirectPokemonUpdate} onClose={() => setEditingPokemonStats(null)} />}
            <TurnOrderDisplay turnOrder={turnOrder} turn={battleState.turn} />
            <div className="h-2/3 flex flex-col justify-between relative bg-gray-700 rounded-lg p-4 bg-no-repeat bg-cover bg-center">
                <HazardDisplay side="player" hazards={field.hazards?.players} />
                <HazardDisplay side="opponent" hazards={field.hazards?.[opponentKey]} />
                <TeamSidebar team={opponentTeam} side="right" />
                <TeamSidebar team={playerTeam} side="left" />
                <TargetingBanner
                    targetingInfo={targetingInfo}
                    onConfirm={handleConfirmTargets}
                    onCancel={handleCancelTargeting}
                />
                <div className="flex justify-center items-end h-1/2 space-x-4">
                    {opponentActivePokemon.map(p => <BattlePokemonCard
                        key={p.id}
                        pokemon={p}
                        isPlayerSide={false}
                        // NEW LOGIC: If targeting is active, select the target. Otherwise, edit stats.
                        onClick={() => targetingInfo.isActive ? handleTargetSelection(p.id) : setEditingPokemonStats(p)}
                        // NEW PROP: Add visual feedback for targeting
                        isSelected={targetingInfo.selected.includes(p.id)}
                        isSelectable={targetingInfo.isActive && targetingInfo.potential.includes(p.id)}
                    />)}
                </div>
                <div className="flex justify-center items-end h-1/2 space-x-4">
                    {playerActivePokemon.map(p => <BattlePokemonCard
                        key={p.id}
                        pokemon={p}
                        isPlayerSide={true}
                        onClick={() => targetingInfo.isActive ? handleTargetSelection(p.id) : setEditingPokemonStats(p)}
                        isSelected={targetingInfo.selected.includes(p.id)}
                        isSelectable={targetingInfo.isActive && targetingInfo.potential.includes(p.id)}
                    />)}
                </div>
                {battleState.gameOver && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><h1 className="text-6xl font-bold text-yellow-400 drop-shadow-lg">GAME OVER</h1></div>}
            </div>
            <div className="h-1/3 mt-2">
                {renderControlArea()}
            </div>
        </div>
    );
};

export default BattleScreen;