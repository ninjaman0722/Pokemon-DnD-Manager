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

const BattleScreen = ({ battleState, battleId, allTrainers }) => {
    const [queuedActions, setQueuedActions] = useState({});
    const [activePanelPokemonId, setActivePanelPokemonId] = useState(null);
    const [isAiEnabled, setIsAiEnabled] = useState(false);
    const [turnOrder, setTurnOrder] = useState([]);
    const [editingPokemonStats, setEditingPokemonStats] = useState(null);
    const [isCompactView, setIsCompactView] = useState(true);

    const { isProcessingTurn, handleExecuteTurn, handleSwitchIn } = useBattleEngine(
        battleState, battleId, allTrainers, queuedActions, setQueuedActions, setTurnOrder
    );

    const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);
    const { teams, log, activePokemonIndices, phase, replacementInfo, field } = battleState;
    const [playerTeam, opponentTeam] = teams;

    const getActivePokemon = (team, indices) => indices.map(i => team.pokemon[i]).filter(p => p && !p.fainted);

    const playerActivePokemon = useMemo(() => getActivePokemon(playerTeam, activePokemonIndices.players), [playerTeam, activePokemonIndices.players]);
    const opponentActivePokemon = useMemo(() => getActivePokemon(opponentTeam, activePokemonIndices.opponent), [opponentTeam, activePokemonIndices.opponent]);
    const allActivePokemon = useMemo(() => [...playerActivePokemon, ...opponentActivePokemon], [playerActivePokemon, opponentActivePokemon]);
    const [targetingInfo, setTargetingInfo] = useState({ isActive: false, potential: [], selected: [], baseAction: null });
    const handleTargetSelection = (targetId) => {
        if (!targetingInfo.isActive || !targetingInfo.potential.includes(targetId)) return;
        setTargetingInfo(prev => ({ ...prev, selected: prev.selected.includes(targetId) ? prev.selected.filter(id => id !== targetId) : [...prev.selected, targetId] }));
    };
    const handleConfirmTargets = () => {
        if (targetingInfo.selected.length === 0) return;
        updateQueuedAction({ // <-- CORRECTED
            ...targetingInfo.baseAction,
            targetIds: targetingInfo.selected,
            hits: targetingInfo.baseAction.hits?.map((_, i) => ({ targetId: targetingInfo.selected[i % targetingInfo.selected.length] })) || targetingInfo.selected.map(id => ({ targetId: id }))
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
            // This case handles self-targeted or field-wide moves.
            updateQueuedAction({ ...baseAction, targetIds: [baseAction.pokemon.id] }); return;
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
    const allActionsQueued = controllablePokemon.every(p => queuedActions[p.id]);

    const renderControlArea = () => {
        const actionPanelContent = () => {
            if (phase === 'REPLACEMENT' && replacementInfo) {
                // ... replacement logic ...
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
                onExecuteTurn={handleExecuteTurn}
                onTurnChange={handleTurnChange}
                onFieldChange={handleFieldChange}
                onHazardChange={handleHazardChange}
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
            {/* NOTE: Targeting Banner and complex onClick logic for cards are now removed from here */}
            {editingPokemonStats && <PokemonStatEditorModal pokemon={editingPokemonStats} onSave={handleDirectPokemonUpdate} onClose={() => setEditingPokemonStats(null)} />}
            <TurnOrderDisplay turnOrder={turnOrder} turn={battleState.turn} />
            <div className="h-2/3 flex flex-col justify-between relative bg-gray-700 rounded-lg p-4 bg-no-repeat bg-cover bg-center">
                <HazardDisplay side="player" hazards={field.hazards?.players} />
                <HazardDisplay side="opponent" hazards={field.hazards?.opponent} />
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