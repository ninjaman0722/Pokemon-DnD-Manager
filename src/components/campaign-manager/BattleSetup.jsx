import React, { useState, useEffect } from 'react';
import { doc, addDoc, serverTimestamp, collection, writeBatch } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';
import { MAX_PARTY_SIZE } from '../../config/gameData';
import { calculateStat, fetchPokemonData } from '../../utils/api';
import PokemonEditorModal from './PokemonEditorModal';
import SaveScenarioModal from './SaveScenarioModal';

import Stepper from './setup/Stepper';
import Step1_Settings from './setup/Step1_Settings';
import Step2_PlayerTeam from './setup/Step2_PlayerTeam';
import Step3_OpponentTeam from './setup/Step3_OpponentTeam';
import Step4_Review from './setup/Step4_Review';

const BattleSetup = ({ state, dispatch, initialScenario, onLoadComplete }) => {
    const { trainers = [], combinedPokemonList = [], itemList = [], customPokemon = [], customMoves = [] } = state;

    const [currentStep, setCurrentStep] = useState(1);
    const selectedCampaign = state.campaigns.find(c => c.id === state.selectedCampaignId);

    // Settings State
    const [battleType, setBattleType] = useState('TRAINER');
    const [pokemonPerTrainer, setPokemonPerTrainer] = useState(6);
    const [numTrainers, setNumTrainers] = useState(1);
    const [numOpponentTrainers, setNumOpponentTrainers] = useState(1); // <-- New
    const [fieldSettings, setFieldSettings] = useState({
        weather: 'None',
        terrain: 'None',
        trickRoom: false,
        playerHazards: {},
        opponentHazards: {}
    });
    // Team State
    const [playerTrainerIds, setPlayerTrainerIds] = useState([]);
    const [playerTeam, setPlayerTeam] = useState([]);
    const [opponentTrainerIds, setOpponentTrainerIds] = useState([]); // <-- Changed
    const [opponentTeam, setOpponentTeam] = useState([]);

    // Utility State
    const [wildPokemonToAdd, setWildPokemonToAdd] = useState('');
    const [editingPokemon, setEditingPokemon] = useState(null);
    const [editingWildPokemon, setEditingWildPokemon] = useState(null);
    const [generatedBattle, setGeneratedBattle] = useState(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

    // Derived Constants
    const partyMembers = trainers.filter(t => t.category === 'partyMembers');
    const opponents = trainers.filter(t => t.category !== 'partyMembers');
    const selectedPlayerTrainers = trainers.filter(t => playerTrainerIds.includes(t.id));
    const selectedOpponentTrainers = trainers.filter(t => opponentTrainerIds.includes(t.id)); // <-- Changed

    // MODIFIED: A more robust way to derive the ordered teams.
    const rosterOrderMap = new Map();
    trainers.forEach(trainer => {
        trainer.roster.forEach((pokemon, index) => {
            rosterOrderMap.set(pokemon.id, index);
        });
    });

    // Create the ordered team by SORTING the existing `playerTeam` state.
    // This preserves the `originalTrainerId` added during selection.
    const orderedPlayerTeam = [...playerTeam].sort((a, b) => {
        const trainerAIndex = playerTrainerIds.indexOf(a.originalTrainerId);
        const trainerBIndex = playerTrainerIds.indexOf(b.originalTrainerId);
        if (trainerAIndex !== trainerBIndex) {
            return trainerAIndex - trainerBIndex;
        }
        return rosterOrderMap.get(a.id) - rosterOrderMap.get(b.id);
    });

    // Do the same for the opponent team.
    const orderedOpponentTeam = [...opponentTeam].sort((a, b) => {
        const trainerAIndex = opponentTrainerIds.indexOf(a.originalTrainerId);
        const trainerBIndex = opponentTrainerIds.indexOf(b.originalTrainerId);
        if (trainerAIndex !== trainerBIndex) {
            return trainerAIndex - trainerBIndex;
        }
        return rosterOrderMap.get(a.id) - rosterOrderMap.get(b.id);
    });

    // For Wild battles, selection order is the only order, so we use the state variable.
    const finalOpponentTeam = battleType === 'WILD' ? opponentTeam : orderedOpponentTeam;


    const handleFieldSettingChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFieldSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const onHazardChange = (side, hazard, isChecked) => {
        setFieldSettings(prev => {
            // Create a full copy of the previous state to modify
            const newState = { ...prev };

            if (side === 'player') {
                const newPlayerHazards = { ...prev.playerHazards };
                if (isChecked) {
                    newPlayerHazards[hazard] = true;
                } else {
                    delete newPlayerHazards[hazard];
                }
                // Update the playerHazards property on our new state object
                newState.playerHazards = newPlayerHazards;

            } else if (side === 'opponent') {
                const newOpponentHazards = { ...prev.opponentHazards };
                if (isChecked) {
                    newOpponentHazards[hazard] = true;
                } else {
                    delete newOpponentHazards[hazard];
                }
                // Update the opponentHazards property on our new state object
                newState.opponentHazards = newOpponentHazards;
            }

            // Return the complete, updated state object
            return newState;
        });
    };

    // Helper to format the field state for saving
    const getFormattedFieldState = (playerTeamId, opponentTeamId) => {
        const formattedHazards = (hazardObj) => {
            const result = {};
            for (const hazard in hazardObj) {
                const key = hazard.toLowerCase().replace(' ', '-');
                result[key] = hazard.includes('Spikes') ? 1 : true; // Default to 1 layer for spikes
            }
            return result;
        };

        return {
            weather: fieldSettings.weather !== 'None' ? fieldSettings.weather.toLowerCase().replace(' ', '-') : 'none',
            weatherTurns: fieldSettings.weather !== 'None' ? 5 : 0,
            terrain: fieldSettings.terrain !== 'None' ? fieldSettings.terrain.toLowerCase().replace(' ', '-') : 'none',
            terrainTurns: fieldSettings.terrain !== 'None' ? 5 : 0,
            trickRoomTurns: fieldSettings.trickRoom ? 5 : 0,
            magicRoomTurns: 0,
            gravityTurns: 0,
            wonderRoomTurns: 0,
            hazards: {
                [playerTeamId]: formattedHazards(fieldSettings.playerHazards),
                [opponentTeamId]: formattedHazards(fieldSettings.opponentHazards)
            }
        };
    };

    // All logic functions (useEffect, handleSaveScenario, startBattle, etc.) remain here...
    useEffect(() => {
        if (initialScenario) {
            setPlayerTrainerIds(initialScenario.teams.player.trainerIds);
            setPlayerTeam(initialScenario.teams.player.pokemon);
            // Handle single or multiple opponent IDs from saved scenarios
            const oppIds = Array.isArray(initialScenario.teams.opponent.trainerIds)
                ? initialScenario.teams.opponent.trainerIds
                : (initialScenario.teams.opponent.trainerId ? [initialScenario.teams.opponent.trainerId] : []);
            setOpponentTrainerIds(oppIds);
            setOpponentTeam(initialScenario.teams.opponent.pokemon);
            onLoadComplete();
            setCurrentStep(4);
        }
    }, [initialScenario, onLoadComplete]);

    useEffect(() => {
        if (battleType === 'BOSS') { setNumTrainers(6); setPokemonPerTrainer(1); }
        setOpponentTeam([]);
        setOpponentTrainerIds([]);
    }, [battleType, numOpponentTrainers]);

    useEffect(() => {
        setPlayerTeam([]);
        setPlayerTrainerIds([]);
    }, [numTrainers, pokemonPerTrainer]);

    const handleSaveScenario = async (scenarioName) => {
        dispatch({ type: 'SET_LOADING', payload: 'Saving scenario...' });
        const resetPokemon = (p) => ({ ...p, currentHp: p.maxHp, fainted: false });
        const freshPlayerTeam = orderedPlayerTeam.map(p => addCalculatedStats(structuredClone(p)));
        let freshOpponentTeam = finalOpponentTeam.map(p => addCalculatedStats(structuredClone(p)));


        // FIX: Get the single boss trainer from the selected trainers array
        const opponentTrainer = battleType === 'BOSS' ? selectedOpponentTrainers[0] : null;
        if (opponentTrainer && opponentTrainer.finalPokemon) {
            const freshFinalPokemon = resetPokemon(scalePokemonToLevel(opponentTrainer.finalPokemon, selectedCampaign.partyLevel));
            freshOpponentTeam = [...freshOpponentTeam, freshFinalPokemon];
        }
        const scenarioObject = {
            name: scenarioName,
            createdAt: serverTimestamp(),
            level: selectedCampaign.partyLevel,
            fieldState: getFormattedFieldState('players', 'opponents'),
            teams: {
                player: { trainerIds: playerTrainerIds, pokemon: freshPlayerTeam },
                // FIX: Save trainerIds array instead of single trainerId
                opponent: { trainerIds: opponentTrainerIds, pokemon: freshOpponentTeam }
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
        if (!pokemon || !pokemon.baseStats || level === undefined) return pokemon;
        const newMaxHp = calculateStat(pokemon.baseStats.hp, level, true, pokemon.name);
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
    const toggleOpponentTrainerSelection = (trainerId) => {
        const newIds = opponentTrainerIds.includes(trainerId)
            ? opponentTrainerIds.filter(id => id !== trainerId)
            : [...opponentTrainerIds, trainerId];
        if (newIds.length > numOpponentTrainers) {
            dispatch({ type: "SET_ERROR", payload: `You can only select up to ${numOpponentTrainers} opponent(s).` });
            return;
        }
        setOpponentTrainerIds(newIds);
        setOpponentTeam([]);
    };
    const togglePlayerPokemonSelection = (pokemon) => {
        const isCurrentlySelected = playerTeam.some(p => p.id === pokemon.id);

        if (isCurrentlySelected) {
            setPlayerTeam(current => current.filter(p => p.id !== pokemon.id));
        } else {
            // Validation
            const teamCount = playerTeam.filter(p => p.originalTrainerId === pokemon.originalTrainerId).length;
            if (teamCount >= pokemonPerTrainer) {
                dispatch({ type: "SET_ERROR", payload: `${pokemon.originalTrainer} can only bring ${pokemonPerTrainer} Pokémon.` });
                return;
            }
            // Create a new, clean, scaled object to store in state
            const partyLevel = selectedCampaign.partyLevel || 50;
            const newPokemon = { ...structuredClone(pokemon), ...scalePokemonToLevel(pokemon, partyLevel) };
            setPlayerTeam(current => [...current, newPokemon]);
        }
    };

    const toggleOpponentPokemonSelection = (pokemon) => {
        const isCurrentlySelected = opponentTeam.some(p => p.id === pokemon.id);

        if (isCurrentlySelected) {
            setOpponentTeam(current => current.filter(p => p.id !== pokemon.id));
        } else {
            // Validation
            if (opponentTeam.length >= MAX_PARTY_SIZE) return;
            // Create a new, clean, scaled object
            const partyLevel = selectedCampaign.partyLevel || 50;
            const newPokemon = { ...structuredClone(pokemon), ...scalePokemonToLevel(pokemon, partyLevel) };
            setOpponentTeam(current => [...current, newPokemon]);
        }
    };

    const handleWildPokemonSelect = async (pokemonName) => {
        dispatch({ type: 'SET_LOADING', payload: `Fetching ${pokemonName}...` });
        try {
            const partyLevel = selectedCampaign.partyLevel || selectedCampaign.defaultPermissions?.partyLevel || 50;
            let pokemonData;
            const customMatch = customPokemon.find(p => p.name.toLowerCase() === pokemonName.toLowerCase());
            if (customMatch) {
                pokemonData = { ...customMatch, level: partyLevel };
            } else {
                pokemonData = await fetchPokemonData(pokemonName, partyLevel, '', customMoves);
            }
            pokemonData.id = `${pokemonName.toLowerCase()}-wild-${crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 7)}`;
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

    const removeUndefinedValues = (obj) => {
        if (typeof obj !== 'object' || obj === null) { return obj; }
        if (Array.isArray(obj)) { return obj.map(removeUndefinedValues).filter(v => v !== undefined); }
        const newObj = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                if (value !== undefined) {
                    const sanitizedValue = removeUndefinedValues(value);
                    if (sanitizedValue !== undefined) { newObj[key] = sanitizedValue; }
                }
            }
        }
        return newObj;
    };

    const addCalculatedStats = (pokemon) => {
        if (!pokemon || !pokemon.baseStats) return pokemon;
        const level = pokemon.level || selectedCampaign.partyLevel || selectedCampaign.defaultPermissions?.partyLevel || 50;
        const calculatedStats = {
            hp: calculateStat(pokemon.baseStats.hp, pokemon.level, true, pokemon.name),
            attack: calculateStat(pokemon.baseStats.attack, pokemon.level),
            defense: calculateStat(pokemon.baseStats.defense, pokemon.level),
            'special-attack': calculateStat(pokemon.baseStats['special-attack'], pokemon.level),
            'special-defense': calculateStat(pokemon.baseStats['special-defense'], pokemon.level),
            speed: calculateStat(pokemon.baseStats.speed, pokemon.level),
        };
        return { ...pokemon, level: level, stats: calculatedStats, maxHp: calculatedStats.hp, currentHp: calculatedStats.hp, fainted: false, stat_stages: pokemon.stat_stages || { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 }, switchInEffectsResolved: false };
    };

    const startBattle = async () => {
        console.log('%c[BattleSetup] startBattle called. Final fieldSettings state:', 'color: lightgreen; font-weight: bold;', fieldSettings);
        if (!state.user?.uid) { dispatch({ type: 'SET_ERROR', payload: 'User not authenticated. Please log in again.' }); return; }
        dispatch({ type: 'SET_LOADING', payload: 'Creating battle...' });
        const generateSuffix = () => crypto?.randomUUID?.().slice(0, 8) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

        // Use structuredClone to create deep copies, preventing shared object references.
        const freshPlayerTeam = orderedPlayerTeam.map(p => addCalculatedStats(structuredClone(p)));
        let freshOpponentTeam = finalOpponentTeam.map(p => addCalculatedStats(structuredClone(p)));

        const opponentTrainer = battleType === 'BOSS' ? selectedOpponentTrainers[0] : null;
        if (opponentTrainer?.finalPokemon) {
            const freshFinalPokemon = addCalculatedStats(scalePokemonToLevel(opponentTrainer.finalPokemon, selectedCampaign.partyLevel));
            freshOpponentTeam = [...freshOpponentTeam, freshFinalPokemon];
        }

        // Validate uniqueness across all teams as a safeguard
        const allPokemon = [...freshPlayerTeam, ...freshOpponentTeam];
        const idSet = new Set();
        allPokemon.forEach(p => {
            if (idSet.has(p.id)) {
                console.warn(`Duplicate ID detected: ${p.id}. Regenerating...`);
                p.id = `${p.id}-dup-${generateSuffix()}`;
            }
            idSet.add(p.id);
        });
        if (freshPlayerTeam.length === 0 || freshOpponentTeam.length === 0) { dispatch({ type: 'SET_ERROR', payload: 'Both teams must have Pokémon.' }); return; }
        const battleId = `battle-${crypto.randomUUID()}`;
        const playerTeamId = 'players';
        const opponentTeamId = selectedOpponentTrainers.map(t => t.id).join('-') || 'wild';
        const opponentName = selectedOpponentTrainers.map(t => t.name).join(' & ') || 'Wild Pokémon';


        const battleState = {
            id: battleId,
            teams: [
                { id: playerTeamId, name: selectedPlayerTrainers.map(t => t.name).join(' & '), pokemon: freshPlayerTeam, trainerIds: playerTrainerIds },
                { id: opponentTeamId, name: opponentName, pokemon: freshOpponentTeam, trainerIds: opponentTrainerIds } // <-- trainerIds added
            ],
            log: [{ type: 'text', text: 'A battle is starting!' }],
            turn: 1,
            phase: 'START_OF_BATTLE',
            gameOver: false,
            field: getFormattedFieldState(playerTeamId, opponentTeamId),
            startOfBattleAbilitiesResolved: false,
            activePokemonIndices: (() => {
                const playerActiveIndices = [];
                playerTrainerIds.forEach(trainerId => {
                    const firstPokemonForTrainer = freshPlayerTeam.find(p => p.originalTrainerId === trainerId);
                    if (firstPokemonForTrainer) {
                        const index = freshPlayerTeam.findIndex(p => p.id === firstPokemonForTrainer.id);
                        if (index !== -1) playerActiveIndices.push(index);
                    }
                });

                const opponentActiveIndices = [];
                if (battleType === 'WILD') {
                    freshOpponentTeam.forEach((_, index) => opponentActiveIndices.push(index));
                } else {
                    opponentTrainerIds.forEach(trainerId => {
                        const firstPokemonForTrainer = freshOpponentTeam.find(p => p.originalTrainerId === trainerId);
                        if (firstPokemonForTrainer) {
                            const index = freshOpponentTeam.findIndex(p => p.id === firstPokemonForTrainer.id);
                            if (index !== -1) opponentActiveIndices.push(index);
                        }
                    });
                }

                return {
                    [playerTeamId]: playerActiveIndices,
                    [opponentTeamId]: opponentActiveIndices,
                };
            })(),
            ownerId: state.user.uid
        };
        try {
            const batch = writeBatch(db);
            const sanitizedBattleState = removeUndefinedValues(battleState);
            const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);
            batch.set(battleDocRef, sanitizedBattleState);
            const allInvolvedTrainers = [...selectedPlayerTrainers];
            if (opponentTrainer) { allInvolvedTrainers.push(opponentTrainer); }
            const uniqueTrainers = [...new Map(allInvolvedTrainers.map(t => [t.id, t])).values()];
            uniqueTrainers.forEach(trainer => {
                const publicTrainerRef = doc(db, `artifacts/${appId}/public/data/trainers`, trainer.id);
                const publicTrainerData = { id: trainer.id, name: trainer.name };
                batch.set(publicTrainerRef, publicTrainerData);
            });
            await batch.commit();
            const simulatorUrl = new URL(window.location.href);
            simulatorUrl.pathname = '/simulator';
            simulatorUrl.search = `?battleId=${battleId}`;
            setGeneratedBattle({ id: battleId, url: simulatorUrl.href });
        } catch (e) {
            console.error('Firestore write failed.', e);
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
    const handleNext = () => setCurrentStep(prev => prev + 1);
    const handleBack = () => setCurrentStep(prev => prev - 1);

    if (!selectedCampaign) { return <div className="flex items-center justify-center p-8 bg-gray-800 rounded-lg" style={{ minHeight: '20rem' }}><h2 className="text-2xl font-semibold text-gray-400">Loading Campaign Data...</h2></div> }
    if (generatedBattle) { return (<div className="p-8 text-center bg-gray-800 rounded-lg max-w-lg mx-auto"> <h2 className="text-2xl font-bold text-green-400 mb-4">Battle Created!</h2> <p className="text-gray-300 mb-2">Your battle has been saved. Use the link below to start the simulation.</p> <div className="bg-gray-900 p-4 rounded-lg my-4 flex items-center justify-between"> <code className="text-white text-lg select-all">{generatedBattle.id}</code> <button onClick={() => copyToClipboard(generatedBattle.id)} className="bg-indigo-600 text-sm px-3 py-1 rounded">Copy</button> </div> <a href={generatedBattle.url} target="_blank" rel="noopener noreferrer" className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-md transition"> Open Battle Simulator </a> <button onClick={() => setGeneratedBattle(null)} className="mt-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-md transition">Create Another Battle</button> </div>) }

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto relative">
            {isSaveModalOpen && <SaveScenarioModal onSave={handleSaveScenario} onClose={() => setIsSaveModalOpen(false)} />}
            {editingPokemon && <PokemonEditorModal pokemon={editingPokemon} onSave={handleSavePokemonEdit} onClose={() => setEditingPokemon(null)} dispatch={dispatch} itemList={itemList} />}
            {editingWildPokemon && <PokemonEditorModal pokemon={editingWildPokemon} onSave={handleAddBulkWildPokemon} onClose={() => setEditingWildPokemon(null)} dispatch={dispatch} itemList={itemList} isWildEditor={true} />}

            <h1 className="text-4xl font-bold text-indigo-400 mb-6 text-center">Battle Setup</h1>
            <div className="absolute top-4 left-4 md:top-8 md:left-8"> <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'TRAINERS' })} className="flex items-center gap-2 text-indigo-400 hover:text-indigo-200 font-semibold transition-colors"> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"> <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd" /> </svg> Back to Manager </button> </div>

            <Stepper currentStep={currentStep} setStep={setCurrentStep} />

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6 min-h-[30rem]">
                {currentStep === 1 && (
                    <Step1_Settings
                        battleType={battleType}
                        setBattleType={setBattleType}
                        numTrainers={numTrainers}
                        setNumTrainers={setNumTrainers}
                        pokemonPerTrainer={pokemonPerTrainer}
                        setPokemonPerTrainer={setPokemonPerTrainer}
                        numOpponentTrainers={numOpponentTrainers}      // Pass new prop
                        setNumOpponentTrainers={setNumOpponentTrainers} // Pass new prop
                        fieldSettings={fieldSettings}
                        onFieldSettingChange={handleFieldSettingChange}
                        onHazardChange={onHazardChange}
                    />
                )}
                {currentStep === 2 && (
                    <Step2_PlayerTeam
                        // (No changes to props here)
                        partyMembers={partyMembers}
                        numTrainers={numTrainers}
                        pokemonPerTrainer={pokemonPerTrainer}
                        playerTrainerIds={playerTrainerIds}
                        playerTeam={playerTeam}
                        togglePlayerTrainerSelection={togglePlayerTrainerSelection}
                        togglePlayerPokemonSelection={togglePlayerPokemonSelection}
                        selectedPlayerTrainers={selectedPlayerTrainers}
                    />
                )}
                {currentStep === 3 && (
                    <Step3_OpponentTeam
                        // (Props are updated for the new component)
                        battleType={battleType}
                        wildPokemonToAdd={wildPokemonToAdd}
                        setWildPokemonToAdd={setWildPokemonToAdd}
                        handleWildPokemonSelect={handleWildPokemonSelect}
                        combinedPokemonList={combinedPokemonList}
                        numOpponentTrainers={numOpponentTrainers}
                        opponents={opponents}
                        toggleOpponentTrainerSelection={toggleOpponentTrainerSelection}
                        opponentTrainerIds={opponentTrainerIds}
                        selectedOpponentTrainers={selectedOpponentTrainers}
                        toggleOpponentPokemonSelection={toggleOpponentPokemonSelection}
                        opponentTeam={opponentTeam}
                    />
                )}
                {currentStep === 4 && (
                    <Step4_Review
                        // (Props are updated for the new logic)
                        playerTeam={orderedPlayerTeam}
                        selectedPlayerTrainers={selectedPlayerTrainers}
                        opponentTeam={finalOpponentTeam}
                        battleType={battleType}
                        numTrainers={numTrainers}
                        setEditingPokemon={setEditingPokemon}
                        selectedOpponentTrainers={selectedOpponentTrainers}
                        numOpponentTrainers={numOpponentTrainers}
                    />
                )}
            </div>

            {/* --- WIZARD NAVIGATION --- */}
            <div className="text-center mt-8 flex justify-between items-center gap-4">
                <div> {currentStep > 1 && (<button onClick={handleBack} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-md transition"> Back </button>)} </div>
                {currentStep === 4 ? (
                    <div className="flex gap-4">
                        {/* MODIFIED: Use ordered teams for validation */}
                        <button onClick={() => setIsSaveModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-md transition disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={orderedPlayerTeam.length === 0 || finalOpponentTeam.length === 0}> Save Scenario </button>
                        <button onClick={startBattle} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-md transition disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={orderedPlayerTeam.length === 0 || finalOpponentTeam.length === 0}> Start Battle </button>
                    </div>
                ) : (
                    <div>
                        {/* MODIFIED: Use ordered teams for validation */}
                        <button onClick={handleNext} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-md transition disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={(currentStep === 2 && orderedPlayerTeam.length === 0) || (currentStep === 3 && finalOpponentTeam.length === 0)}> Next </button>
                    </div>
                )}
            </div>
        </div>
    );
};
export default BattleSetup;