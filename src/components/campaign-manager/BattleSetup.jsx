import React, { useState, useEffect } from 'react';
import { doc, setDoc, addDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';
import { MAX_PARTY_SIZE } from '../../config/gameData';
import { calculateStat, fetchPokemonData } from '../../utils/api';
import PokemonCard from './PokemonCard';
import TeamPreviewCard from './TeamPreviewCard';
import PokemonEditorModal from './PokemonEditorModal';
import AutocompleteInput from '../common/AutocompleteInput';
import SaveScenarioModal from './SaveScenarioModal';

// NEW: Stepper component for visual progress
const Stepper = ({ currentStep, setStep }) => {
    const steps = ['Settings', 'Player Team', 'Opponent Team', 'Review & Launch'];

    // You can't go to a future step you haven't reached yet
    const isStepDisabled = (stepIndex) => stepIndex + 1 > currentStep;

    return (
        <div className="flex justify-center items-center border-b-2 border-gray-700 mb-8 pb-4">
            {steps.map((step, index) => (
                <React.Fragment key={step}>
                    <button
                        onClick={() => !isStepDisabled(index) && setStep(index + 1)}
                        disabled={isStepDisabled(index)}
                        className="flex items-center gap-2 disabled:cursor-not-allowed"
                    >
                        <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${currentStep === index + 1 ? 'bg-indigo-600 text-white' : 'bg-gray-600 text-gray-300'} 
                                ${!isStepDisabled(index) ? 'hover:bg-indigo-500' : 'opacity-50'}`
                            }
                        >
                            {index + 1}
                        </div>
                        <span className={`font-semibold hidden sm:inline ${currentStep === index + 1 ? 'text-white' : 'text-gray-400'}`}>
                            {step}
                        </span>
                    </button>
                    {index < steps.length - 1 && (
                        <div className="flex-auto border-t-2 border-gray-600 mx-4"></div>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};


const BattleSetup = ({ state, dispatch, initialScenario, onLoadComplete }) => {
    const { trainers = [], combinedPokemonList = [], itemList = [], customPokemon = [], customMoves = [] } = state;

    // NEW: State to manage the current step of the wizard
    const [currentStep, setCurrentStep] = useState(1);
    const selectedCampaign = state.campaigns.find(c => c.id === state.selectedCampaignId);
    const [battleType, setBattleType] = useState('TRAINER');
    const [numTrainers, setNumTrainers] = useState(1);
    const [pokemonPerTrainer, setPokemonPerTrainer] = useState(6);
    const [playerTrainerIds, setPlayerTrainerIds] = useState([]);
    const [playerTeam, setPlayerTeam] = useState([]);
    const [opponentTrainerId, setOpponentTrainerId] = useState('');
    const [opponentTeam, setOpponentTeam] = useState([]);
    const [wildPokemonToAdd, setWildPokemonToAdd] = useState('');
    const [editingPokemon, setEditingPokemon] = useState(null);
    const [editingWildPokemon, setEditingWildPokemon] = useState(null);
    const [generatedBattle, setGeneratedBattle] = useState(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

    const partyMembers = trainers.filter(t => t.category === 'partyMembers');
    const opponents = trainers.filter(t => t.category !== 'partyMembers');
    const selectedPlayerTrainers = trainers.filter(t => playerTrainerIds.includes(t.id));
    const opponentTrainer = trainers.find(t => t.id === opponentTrainerId);

    // (No changes needed to the logic functions)
    useEffect(() => {
        if (initialScenario) {
            setPlayerTrainerIds(initialScenario.teams.player.trainerIds);
            setPlayerTeam(initialScenario.teams.player.pokemon);
            setOpponentTrainerId(initialScenario.teams.opponent.trainerId);
            setOpponentTeam(initialScenario.teams.opponent.pokemon);
            onLoadComplete();
            setCurrentStep(4); // Jump to the review step when loading a scenario
        }
    }, [initialScenario, onLoadComplete]);

    useEffect(() => {
        if (battleType === 'BOSS') { setNumTrainers(6); setPokemonPerTrainer(1); }
        setOpponentTeam([]); setOpponentTrainerId('');
    }, [battleType]);

    useEffect(() => { setPlayerTeam([]); setPlayerTrainerIds([]); }, [numTrainers, pokemonPerTrainer]);

    const handleSaveScenario = async (scenarioName) => {
        dispatch({ type: 'SET_LOADING', payload: 'Saving scenario...' });
        const resetPokemon = (p) => ({ ...p, currentHp: p.maxHp, fainted: false });
        const freshPlayerTeam = playerTeam.map(resetPokemon);
        let freshOpponentTeam = opponentTeam.map(resetPokemon);
        if (battleType === 'BOSS' && opponentTrainer.finalPokemon) {
            const freshFinalPokemon = resetPokemon(scalePokemonToLevel(opponentTrainer.finalPokemon, selectedCampaign.partyLevel));
            freshOpponentTeam = [...freshOpponentTeam, freshFinalPokemon];
        }
        const scenarioObject = {
            name: scenarioName,
            createdAt: serverTimestamp(),
            level: selectedCampaign.partyLevel,
            fieldState: { weather: 'none', terrain: 'none', hazards: { playerSide: {}, opponentSide: {} } },
            teams: {
                player: { trainerIds: playerTrainerIds, pokemon: freshPlayerTeam },
                opponent: { trainerId: opponentTrainerId || null, pokemon: freshOpponentTeam }
            }
        };
        try {
            const scenariosCollectionRef = collection(db, 'campaigns', state.selectedCampaignId, 'scenarios');
            await addDoc(scenariosCollectionRef, scenarioObject);
        } catch (e) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to save scenario: ${e.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    const scalePokemonToLevel = (pokemon, level) => {
        if (!pokemon || !pokemon.baseStats) return null;
        const newMaxHp = calculateStat(pokemon.baseStats.hp, level, true);
        return { ...pokemon, level, maxHp: newMaxHp, currentHp: newMaxHp };
    };

    const togglePlayerTrainerSelection = (trainerId) => {
        const newIds = playerTrainerIds.includes(trainerId) ? playerTrainerIds.filter(id => id !== trainerId) : [...playerTrainerIds, trainerId];
        if (newIds.length > numTrainers) {
            dispatch({ type: "SET_ERROR", payload: `You can only select up to ${numTrainers} trainer(s) for this format.` });
            return;
        }
        setPlayerTrainerIds(newIds);
        setPlayerTeam([]);
    };

    const togglePlayerPokemonSelection = (pokemon) => {
        const scaledPokemon = { ...scalePokemonToLevel(pokemon, selectedCampaign.partyLevel), originalTrainerId: pokemon.originalTrainerId };
        if (playerTeam.some(p => p.id === pokemon.id)) {
            setPlayerTeam(currentTeam => currentTeam.filter(p => p.id !== pokemon.id));
        } else {
            const playerTeamCount = playerTeam.filter(p => p.originalTrainerId === pokemon.originalTrainerId).length;
            if (playerTeamCount >= pokemonPerTrainer) {
                dispatch({ type: "SET_ERROR", payload: `${pokemon.originalTrainer} can only bring ${pokemonPerTrainer} Pokémon.` });
                return;
            }
            if (playerTeam.length >= MAX_PARTY_SIZE * numTrainers) {
                dispatch({ type: "SET_ERROR", payload: `The total party size cannot exceed ${MAX_PARTY_SIZE * numTrainers}.` });
                return;
            }
            setPlayerTeam(currentTeam => [...currentTeam, scaledPokemon]);
        }
    };

    const toggleOpponentPokemonSelection = (pokemon) => {
        const scaledPokemon = scalePokemonToLevel(pokemon, selectedCampaign.partyLevel);
        setOpponentTeam(currentTeam => {
            if (currentTeam.some(p => p.id === scaledPokemon.id)) { return currentTeam.filter(p => p.id !== scaledPokemon.id); }
            if (currentTeam.length < MAX_PARTY_SIZE) { return [...currentTeam, scaledPokemon]; }
            return currentTeam;
        });
    };

    const handleWildPokemonSelect = async (pokemonName) => {
        dispatch({ type: 'SET_LOADING', payload: `Fetching ${pokemonName}...` });
        try {
            let pokemonData;
            const customMatch = customPokemon.find(p => p.name.toLowerCase() === pokemonName.toLowerCase());
            if (customMatch) { pokemonData = { ...customMatch }; }
            else { pokemonData = await fetchPokemonData(pokemonName, selectedCampaign.partyLevel, '', customMoves); }
            setEditingWildPokemon(pokemonData);
            setWildPokemonToAdd('');
        } catch (e) { dispatch({ type: 'SET_ERROR', payload: e.message }); }
        finally { dispatch({ type: 'SET_LOADING', payload: null }); }
    };

    const handleAddBulkWildPokemon = (pokemon, quantity) => {
        const baseName = pokemon.name.replace(/\s\d+$/, "");
        const existingCount = opponentTeam.filter(p => p.name.startsWith(baseName)).length;
        const newPokemon = Array.from({ length: quantity }, (_, i) => ({
            ...pokemon, id: crypto.randomUUID(), name: quantity > 1 || existingCount > 0 ? `${baseName} ${existingCount + i + 1}` : baseName
        }));
        setOpponentTeam(currentTeam => [...currentTeam, ...newPokemon]);
    };

    const handleSetActivePlayerPokemon = (pokemonToActivate) => {
        const teamForTrainer = playerTeam.filter(p => p.originalTrainerId === pokemonToActivate.originalTrainerId);
        const otherTeams = playerTeam.filter(p => p.originalTrainerId !== pokemonToActivate.originalTrainerId);
        const reorderedTeamForTrainer = [pokemonToActivate, ...teamForTrainer.filter(p => p.id !== pokemonToActivate.id)];
        const finalTeam = [...otherTeams, ...reorderedTeamForTrainer];
        finalTeam.sort((a, b) => playerTrainerIds.indexOf(a.originalTrainerId) - playerTrainerIds.indexOf(b.originalTrainerId));
        setPlayerTeam(finalTeam);
    };
    const handleSetActiveOpponentPokemon = (pokemonToActivate) => {
        // This only applies to non-wild battles where team order matters.
        if (battleType === 'WILD') return;

        // Reorder the opponentTeam array to make the selected pokemon active (at the front)
        const reorderedTeam = [
            pokemonToActivate,
            ...opponentTeam.filter(p => p.id !== pokemonToActivate.id)
        ];
        setOpponentTeam(reorderedTeam);
    };
    const startBattle = async () => {
        dispatch({ type: 'SET_LOADING', payload: 'Creating battle...' });
        const resetPokemon = (p) => ({ ...p, currentHp: p.maxHp, fainted: false });
        const freshPlayerTeam = playerTeam.map(resetPokemon);
        let freshOpponentTeam = opponentTeam.map(resetPokemon);
        if (battleType === 'BOSS' && opponentTrainer.finalPokemon) {
            const freshFinalPokemon = resetPokemon(scalePokemonToLevel(opponentTrainer.finalPokemon, selectedCampaign.partyLevel));
            freshOpponentTeam = [...freshOpponentTeam, freshFinalPokemon];
        }
        if (freshPlayerTeam.length === 0 || freshOpponentTeam.length === 0) {
            dispatch({ type: 'SET_ERROR', payload: `Both teams must have Pokémon.` }); return;
        }
        const opponentActiveCount = battleType === 'WILD' ? freshOpponentTeam.length : Math.min(freshOpponentTeam.length, numTrainers);
        const battleId = `battle-${crypto.randomUUID()}`;
        const battleState = {
            id: battleId,
            teams: [
                { id: 'players', name: selectedPlayerTrainers.map(t => t.name).join(' & '), pokemon: freshPlayerTeam, trainerIds: playerTrainerIds },
                { id: opponentTrainer?.id || 'wild', name: opponentTrainer?.name || 'Wild Pokémon', pokemon: freshOpponentTeam }
            ],
            log: [{ type: 'text', text: `A battle is starting!` }], turn: 1, phase: 'ACTION_SELECTION', gameOver: false,
            field: { weather: 'none', weatherTurns: 0, terrain: 'none', terrainTurns: 0, trickRoomTurns: 0, magicRoomTurns: 0, gravityTurns: 0, wonderRoomTurns: 0, hazards: { players: {}, opponent: {} } },
            startOfBattleAbilitiesResolved: false,
            activePokemonIndices: {
                players: Array.from({ length: Math.min(freshPlayerTeam.length, numTrainers) }, (_, i) => i),
                opponent: Array.from({ length: opponentActiveCount }, (_, i) => i)
            },
            ownerId: state.user?.uid
        };
        try {
            const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);
            await setDoc(battleDocRef, battleState);
            const simulatorUrl = new URL(window.location.href);
            simulatorUrl.pathname = '/simulator';
            simulatorUrl.search = `?battleId=${battleId}`;
            setGeneratedBattle({ id: battleId, url: simulatorUrl.href });
        } catch (e) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to create battle: ${e.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    const handleSavePokemonEdit = (editedPokemon) => {
        setOpponentTeam(currentTeam => currentTeam.map(p => p.id === editedPokemon.id ? editedPokemon : p));
        setEditingPokemon(null);
    };

    const copyToClipboard = (text) => { navigator.clipboard.writeText(text); };

    // NEW: Wizard navigation handlers
    const handleNext = () => setCurrentStep(prev => prev + 1);
    const handleBack = () => setCurrentStep(prev => prev - 1);

    if (!selectedCampaign) {
        return (
            <div className="flex items-center justify-center p-8 bg-gray-800 rounded-lg" style={{ minHeight: '20rem' }}>
                <h2 className="text-2xl font-semibold text-gray-400">Loading Campaign Data...</h2>
            </div>
        )
    }

    if (generatedBattle) {
        return (
            <div className="p-8 text-center bg-gray-800 rounded-lg max-w-lg mx-auto">
                <h2 className="text-2xl font-bold text-green-400 mb-4">Battle Created!</h2>
                <p className="text-gray-300 mb-2">Your battle has been saved. Use the link below to start the simulation.</p>
                <div className="bg-gray-900 p-4 rounded-lg my-4 flex items-center justify-between">
                    <code className="text-white text-lg select-all">{generatedBattle.id}</code>
                    <button onClick={() => copyToClipboard(generatedBattle.id)} className="bg-indigo-600 text-sm px-3 py-1 rounded">Copy</button>
                </div>
                <a href={generatedBattle.url} target="_blank" rel="noopener noreferrer" className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-md transition">
                    Open Battle Simulator
                </a>
                <button onClick={() => setGeneratedBattle(null)} className="mt-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-md transition">Create Another Battle</button>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto relative">
            {isSaveModalOpen && <SaveScenarioModal onSave={handleSaveScenario} onClose={() => setIsSaveModalOpen(false)} />}
            {editingPokemon && <PokemonEditorModal pokemon={editingPokemon} onSave={handleSavePokemonEdit} onClose={() => setEditingPokemon(null)} dispatch={dispatch} itemList={itemList} />}
            {editingWildPokemon && <PokemonEditorModal pokemon={editingWildPokemon} onSave={handleAddBulkWildPokemon} onClose={() => setEditingWildPokemon(null)} dispatch={dispatch} itemList={itemList} isWildEditor={true} />}

            <h1 className="text-4xl font-bold text-indigo-400 mb-6 text-center">Battle Setup</h1>
            <div className="absolute top-4 left-4 md:top-8 md:left-8">
                <button
                    onClick={() => dispatch({ type: 'SET_VIEW', payload: 'TRAINERS' })}
                    className="flex items-center gap-2 text-indigo-400 hover:text-indigo-200 font-semibold transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd" />
                    </svg>
                    Back to Manager
                </button>
            </div>

            <Stepper currentStep={currentStep} setStep={setCurrentStep} />

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6 min-h-[30rem]">
                {/* --- STEP 1: SETTINGS --- */}
                {currentStep === 1 && (
                    <div>
                        <h2 className="text-2xl font-semibold mb-4 text-indigo-300">Encounter Settings</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                            <div><label className="block text-sm font-medium mb-1 text-gray-400">Battle Type</label><select value={battleType} onChange={e => setBattleType(e.target.value)} className="bg-gray-700 p-2 rounded-md w-full"><option value="TRAINER">Party vs Trainer</option><option value="WILD">Party vs Wild</option><option value="BOSS">Party vs Boss</option></select></div>
                            <div><label className="block text-sm font-medium mb-1 text-gray-400">Player Trainers</label><select value={numTrainers} onChange={e => setNumTrainers(Number(e.target.value))} disabled={battleType === 'BOSS'} className="bg-gray-700 p-2 rounded-md w-full disabled:bg-gray-600">{[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                            <div><label className="block text-sm font-medium mb-1 text-gray-400">Pokémon per Trainer</label><select value={pokemonPerTrainer} onChange={e => setPokemonPerTrainer(Number(e.target.value))} disabled={battleType === 'BOSS'} className="bg-gray-700 p-2 rounded-md w-full disabled:bg-gray-600">{[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                        </div>
                    </div>
                )}

                {/* --- STEP 2: PLAYER TEAM --- */}
                {currentStep === 2 && (
                    <div>
                        <h2 className="text-2xl font-semibold text-indigo-300">Player Team Selection</h2>
                        <div className="my-4"><p className="mb-2 text-sm text-gray-400">1. Select {numTrainers} Party Member(s):</p><div className="flex flex-wrap gap-2">{partyMembers.map(t => (<button key={t.id} onClick={() => togglePlayerTrainerSelection(t.id)} className={`p-2 rounded-md text-sm ${playerTrainerIds.includes(t.id) ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{t.name}</button>))}</div></div>
                        {playerTrainerIds.length > 0 && <div className="space-y-4"><p className="mb-2 text-sm text-gray-400">2. Select up to {pokemonPerTrainer} Pokémon per trainer:</p><div className="space-y-3 max-h-80 overflow-y-auto pr-2">{selectedPlayerTrainers.map(trainer => (<div key={trainer.id}><h4 className="font-bold text-indigo-300">{trainer.name}'s Roster</h4><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-1">{trainer.roster.map(p => (<PokemonCard key={p.id} pokemon={{ ...p, originalTrainerId: trainer.id }} onSelect={() => togglePlayerPokemonSelection({ ...p, originalTrainerId: trainer.id, originalTrainer: trainer.name })} isSelected={playerTeam.some(sel => sel.id === p.id)} />))}</div></div>))}</div></div>}
                    </div>
                )}

                {/* --- STEP 3: OPPONENT TEAM --- */}
                {currentStep === 3 && (
                    <div>
                        <h2 className="text-2xl font-semibold text-indigo-300">Opponent Team Selection</h2>
                        <div className="my-4">
                            {battleType === 'WILD' ? (
                                <div><p className="mb-2 text-sm text-gray-400">Add Wild Pokémon:</p><AutocompleteInput value={wildPokemonToAdd} onChange={setWildPokemonToAdd} onSelect={handleWildPokemonSelect} placeholder="Search to add & edit wild Pokémon..." sourceList={combinedPokemonList} /></div>
                            ) : (
                                <div><p className="mb-2 text-sm text-gray-400">1. Select Opponent Trainer:</p><select value={opponentTrainerId} onChange={e => { setOpponentTrainerId(e.target.value); setOpponentTeam([]); }} className="w-full bg-gray-700 p-2 rounded-md mb-4"><option value="">Select Opponent</option>{opponents.filter(t => battleType === 'BOSS' ? t.category === 'bosses' : true).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                                    {opponentTrainer && <div><p className="mb-2 text-sm text-gray-400">2. Select up to {MAX_PARTY_SIZE} Pokémon for the battle:</p><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-80 overflow-y-auto pr-2">{opponentTrainer.roster.map(p => (<PokemonCard key={p.id} pokemon={p} onSelect={() => toggleOpponentPokemonSelection(p)} isSelected={opponentTeam.some(sel => sel.id === p.id)} />))}</div></div>}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- STEP 4: REVIEW & LAUNCH --- */}
                {currentStep === 4 && (
                    <div>
                        <h2 className="text-2xl font-semibold text-indigo-300 mb-4">Review & Launch</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Player Team Review */}
                            <div>
                                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">Player Team <span className="text-gray-400">({playerTeam.length})</span>
                                    {playerTeam.length > 0 ? <span className="text-green-400 text-sm font-bold">✓ READY</span> : <span className="text-red-400 text-sm font-bold">✗ INCOMPLETE</span>}
                                </h3>
                                <div className="space-y-3 p-2 bg-gray-900/50 rounded-lg max-h-96 overflow-y-auto">{selectedPlayerTrainers.map(trainer => {
                                    const teamForTrainer = playerTeam.filter(p => p.originalTrainerId === trainer.id);
                                    if (teamForTrainer.length === 0) return null;
                                    return (<div key={trainer.id}><h4 className="font-bold text-indigo-300">{trainer.name}</h4><div className="grid grid-cols-2 gap-2 mt-1">{teamForTrainer.map((p, i) => (<TeamPreviewCard key={p.id} pokemon={p} onSelect={() => handleSetActivePlayerPokemon(p)} isActive={i === 0} />))}</div></div>)
                                })}</div>
                            </div>
                            {/* Opponent Team Review */}
                            <div>
                                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">Opponent Team <span className="text-gray-400">({opponentTeam.length})</span>
                                    {opponentTeam.length > 0 ? <span className="text-green-400 text-sm font-bold">✓ READY</span> : <span className="text-red-400 text-sm font-bold">✗ INCOMPLETE</span>}
                                </h3>
                                <div className="p-2 bg-gray-900/50 rounded-lg max-h-96 overflow-y-auto">
                                    <div className="grid grid-cols-2 gap-2">{opponentTeam.map((p, i) => {
                                        // First, determine how many opponents will be active
                                        const opponentActiveCount = battleType === 'WILD'
                                            ? opponentTeam.length
                                            : Math.min(opponentTeam.length, numTrainers);

                                        return (
                                            <TeamPreviewCard
                                                key={p.id}
                                                pokemon={p}
                                                // For wild battles, clicking edits the Pokémon. Otherwise, it sets the active one.
                                                onSelect={() => battleType === 'WILD' ? setEditingPokemon(p) : handleSetActiveOpponentPokemon(p)}
                                                // A Pokémon is active if its position in the array is less than the active count.
                                                isActive={i < opponentActiveCount}
                                            />
                                        );
                                    })}</div>
                                    {battleType === 'BOSS' && opponentTrainer?.finalPokemon && <div className="mt-2"><h4 className="text-lg font-semibold text-red-400">Final Pokémon:</h4><div className="grid grid-cols-2 gap-2"><TeamPreviewCard pokemon={opponentTrainer.finalPokemon} onSelect={() => { }} isActive={false} /></div></div>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- WIZARD NAVIGATION --- */}
            <div className="text-center mt-8 flex justify-between items-center gap-4">
                {/* Back Button */}
                <div>
                    {currentStep > 1 && (
                        <button onClick={handleBack} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-md transition">
                            Back
                        </button>
                    )}
                </div>

                {/* Final Action Buttons (Step 4) */}
                {currentStep === 4 ? (
                    <div className="flex gap-4">
                        <button onClick={() => setIsSaveModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-md transition disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={playerTeam.length === 0 || opponentTeam.length === 0}>
                            Save Scenario
                        </button>
                        <button onClick={startBattle} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-md transition disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={playerTeam.length === 0 || opponentTeam.length === 0}>
                            Start Battle
                        </button>
                    </div>
                ) : (
                    // Next Button (Steps 1-3)
                    <div>
                        <button
                            onClick={handleNext}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-md transition disabled:bg-gray-600 disabled:cursor-not-allowed"
                            disabled={(currentStep === 2 && playerTeam.length === 0) || (currentStep === 3 && opponentTeam.length === 0)}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
export default BattleSetup;