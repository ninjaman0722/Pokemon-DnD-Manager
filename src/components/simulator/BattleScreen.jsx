import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';
import { useBattleEngine } from '../../hooks/useBattleEngine';
import { officialFormsData } from '../../config/officialFormsData';
import TeamSidebar from './TeamSidebar';
import BattlePokemonCard from './BattlePokemonCard';
import TurnOrderDisplay from './TurnOrderDisplay';
import MasterControlPanel from './MasterControlPanel';
import ActionControlPanel from './ActionControlPanel';
import BattleLog from './BattleLog';
import PokemonStatEditorModal from './PokemonStatEditorModal';

// --- NEW SUB-COMPONENT FOR DISPLAYING HAZARDS ---

const BattleScreen = ({ battleState, battleId, allTrainers }) => {
    // ... (All existing state and handlers remain the same)
    const [queuedActions, setQueuedActions] = useState({});
    const [activePanelPokemonId, setActivePanelPokemonId] = useState(null);
    const [isAiEnabled, setIsAiEnabled] = useState(false);
    const [turnOrder, setTurnOrder] = useState([]);
    const [editingPokemonStats, setEditingPokemonStats] = useState(null);
    const [targetingInfo, setTargetingInfo] = useState({ isActive: false, potential: [], selected: [], baseAction: null });
    const [isCompactView, setIsCompactView] = useState(true);

    const { isProcessingTurn, handleExecuteTurn, handleSwitchIn, } = useBattleEngine(
        battleState, battleId, allTrainers, queuedActions, setQueuedActions, setTurnOrder, isAiEnabled
    );

    const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);
    const { teams, log, activePokemonIndices, phase, replacementInfo, field } = battleState;
    const [playerTeam, opponentTeam] = teams;
    const getActivePokemon = (team, indices) => indices.map(i => team.pokemon[i]).filter(p => p && !p.fainted);

    const playerActivePokemon = React.useMemo(() => 
        getActivePokemon(playerTeam, activePokemonIndices.players), 
        [playerTeam, activePokemonIndices.players]
    );

    const opponentActivePokemon = React.useMemo(() => 
        getActivePokemon(opponentTeam, activePokemonIndices.opponent), 
        [opponentTeam, activePokemonIndices.opponent]
    );
    
    const allActivePokemon = React.useMemo(() => 
        [...playerActivePokemon, ...opponentActivePokemon], 
        [playerActivePokemon, opponentActivePokemon]
    );
    useEffect(() => {
        const currentPanelPokemonIsActive = allActivePokemon.some(p => p.id === activePanelPokemonId);
        if (!currentPanelPokemonIsActive && !targetingInfo.isActive && playerActivePokemon.length > 0) {
            setActivePanelPokemonId(playerActivePokemon[0].id);
        }
    }, [allActivePokemon, targetingInfo.isActive, activePanelPokemonId, playerActivePokemon]);

    const selectedPokemonForPanel = allActivePokemon.find(p => p.id === activePanelPokemonId);
    
    const handleTurnChange = async (newTurn) => {
        if (newTurn > 0) {
            await updateDoc(battleDocRef, { turn: newTurn });
        }
    };
    
    const handleFieldChange = async (newField) => {
        await updateDoc(battleDocRef, { field: newField });
    };

    const handleHazardChange = async (side, hazardKey, newLayerCount) => {
        const newHazards = { ...field.hazards };
        if (newLayerCount === 0) {
            delete newHazards[side][hazardKey];
        } else {
            newHazards[side][hazardKey] = newLayerCount;
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

    const handleEnterTargetingMode = (move, baseAction) => {
        const targetType = move.target.name;
        const actor = baseAction.pokemon;
        if (targetType === 'user' || targetType === 'user-and-allies' || targetType === 'all-allies') {
            updateQueuedAction({ ...baseAction, targetIds: [actor.id] });
            return;
        }
        const actorTeam = teams.find(t => t.pokemon.some(p => p.id === actor.id));
        const potentialOpponents = actorTeam.id === 'players' ? opponentActivePokemon : playerActivePokemon;
        const potentialAllies = actorTeam.id === 'players' ? playerActivePokemon : opponentActivePokemon;
        let potentialTargets = [];
        switch (targetType) {
            case 'specific-move':
            case 'selected-pokemon':
            case 'random-opponent':
            case 'all-opponents':
                potentialTargets = potentialOpponents.map(p => p.id);
                break;
            case 'all-other-pokemon':
                potentialTargets = allActivePokemon.filter(p => p.id !== actor.id).map(p => p.id);
                break;
            case 'user-or-ally':
                potentialTargets = potentialAllies.map(p => p.id);
                break;
            case 'ally':
                potentialTargets = potentialAllies.filter(p => p.id !== actor.id).map(p => p.id);
                break;
            default:
                updateQueuedAction({ ...baseAction, targetIds: [] });
                return;
        }
        setTargetingInfo({ isActive: true, potential: potentialTargets, selected: [], baseAction: baseAction });
    };

    const handleTargetSelection = (targetId) => {
        if (!targetingInfo.isActive || !targetingInfo.potential.includes(targetId)) return;
        setTargetingInfo(prev => ({ ...prev, selected: prev.selected.includes(targetId) ? prev.selected.filter(id => id !== targetId) : [...prev.selected, targetId] }));
    };

    const handleConfirmTargets = () => {
        if (targetingInfo.selected.length === 0) return;
        updateQueuedAction({ ...targetingInfo.baseAction, targetIds: targetingInfo.selected });
        setTargetingInfo({ isActive: false, potential: [], selected: [], baseAction: null });
    };

    const handleCancelTargeting = () => {
        setTargetingInfo({ isActive: false, potential: [], selected: [], baseAction: null });
    };

    const handleDirectPokemonUpdate = async (updatedPokemon) => {
        const newBattleState = JSON.parse(JSON.stringify(battleState));
        const teamIndex = newBattleState.teams.findIndex(t => t.pokemon.some(p => p.id === updatedPokemon.id));
        if (teamIndex === -1) return;
        const pokemonIndex = newBattleState.teams[teamIndex].pokemon.findIndex(p => p.id === updatedPokemon.id);
        if (pokemonIndex === -1) return;
        newBattleState.teams[teamIndex].pokemon[pokemonIndex] = updatedPokemon;
        await updateDoc(battleDocRef, newBattleState);
    };

    const handleClearLog = async () => {
        await updateDoc(battleDocRef, { log: [] });
    };

    const controllablePokemon = [...playerActivePokemon, ...(opponentTeam.name !== 'Wild Pokémon' || !isAiEnabled ? opponentActivePokemon : [])];
    const allActionsQueued = controllablePokemon.every(p => queuedActions[p.id] || p.chargingMove || p.volatileStatuses.includes('Rampaging'));

    const renderControlArea = () => {
        const actionPanelContent = () => {
            if (phase === 'REPLACEMENT' && replacementInfo) {
                const { teamIndex, slotIndex } = replacementInfo;
                const team = teams[teamIndex];
                const faintedPokemon = team.pokemon[activePokemonIndices[teamIndex === 0 ? 'players' : 'opponent'][slotIndex]];
                const availableReplacements = team.pokemon.filter((p, i) => !p.fainted && !activePokemonIndices[teamIndex === 0 ? 'players' : 'opponent'].includes(i));
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
                        onUpdateAction={updateQueuedAction}
                        onCancelAction={() => cancelAction(selectedPokemonForPanel.id)}
                        onEnterTargetingMode={handleEnterTargetingMode}
                    />
                );
            }
            return <div className="bg-gray-900 rounded-lg p-4 h-full flex items-center justify-center"><p className="text-gray-400 italic">Select a Pokémon to act.</p></div>;
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
                onExecuteTurn={handleExecuteTurn}
                onTurnChange={handleTurnChange}
                onFieldChange={handleFieldChange}
                onHazardChange={handleHazardChange}
                targetingInfo={targetingInfo}
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
            {editingPokemonStats && <PokemonStatEditorModal pokemon={editingPokemonStats} onSave={handleDirectPokemonUpdate} onClose={() => setEditingPokemonStats(null)} />}
            <TurnOrderDisplay turnOrder={turnOrder} turn={battleState.turn} />
            {/* Find this div and add the HazardDisplay components inside it */}
            <div className="h-2/3 flex flex-col justify-between relative bg-gray-700 rounded-lg p-4 bg-no-repeat bg-cover bg-center">
                <TeamSidebar team={opponentTeam} side="right" />
                <TeamSidebar team={playerTeam} side="left" />
                <div className="flex justify-center items-end h-1/2 space-x-4">
                    {opponentTeam.pokemon.map((p, i) => activePokemonIndices.opponent.includes(i) &&
                        <BattlePokemonCard key={p.id} pokemon={p} isPlayerSide={false} onClick={() => targetingInfo.isActive ? handleTargetSelection(p.id) : setEditingPokemonStats(p)} isSelectable={targetingInfo.potential.includes(p.id)} isSelected={targetingInfo.selected.includes(p.id)} />
                    )}
                </div>
                <div className="flex justify-center items-end h-1/2 space-x-4">
                    {playerTeam.pokemon.map((p, i) => activePokemonIndices.players.includes(i) &&
                        <BattlePokemonCard key={p.id} pokemon={p} isPlayerSide={true} onClick={() => targetingInfo.isActive ? handleTargetSelection(p.id) : setEditingPokemonStats(p)} isSelectable={targetingInfo.potential.includes(p.id)} isSelected={targetingInfo.selected.includes(p.id)} />
                    )}
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