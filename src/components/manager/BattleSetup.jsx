import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';
import { MAX_PARTY_SIZE } from '../../config/gameData';
import { calculateStat, fetchPokemonData } from '../../utils/api';
import PokemonCard from './PokemonCard';
import TeamPreviewCard from './TeamPreviewCard';
import PokemonEditorModal from './PokemonEditorModal'; // Ensure this import is here
import AutocompleteInput from '../common/AutocompleteInput';

const BattleSetup = ({ state, dispatch }) => {
    // I've left this line as is, since combinedPokemonList is what you're providing from state.
    const { trainers = [], combinedPokemonList = [], itemList = [], customPokemon = [], customMoves = [] } = state;
    const [battleType, setBattleType] = useState('TRAINER');
    const [numTrainers, setNumTrainers] = useState(1);
    const [pokemonPerTrainer, setPokemonPerTrainer] = useState(1);
    const [battleLevel, setBattleLevel] = useState(50);
    const [playerTrainerIds, setPlayerTrainerIds] = useState([]);
    const [playerTeam, setPlayerTeam] = useState([]);
    const [opponentTrainerId, setOpponentTrainerId] = useState('');
    const [opponentTeam, setOpponentTeam] = useState([]);
    const [wildPokemonToAdd, setWildPokemonToAdd] = useState('');
    const [editingPokemon, setEditingPokemon] = useState(null);
    const [editingWildPokemon, setEditingWildPokemon] = useState(null);
    const [generatedBattle, setGeneratedBattle] = useState(null);

    const partyMembers = trainers.filter(t => t.category === 'partyMembers');
    const opponents = trainers.filter(t => t.category !== 'partyMembers');
    const selectedPlayerTrainers = trainers.filter(t => playerTrainerIds.includes(t.id));
    const opponentTrainer = trainers.find(t => t.id === opponentTrainerId);


    useEffect(() => {
        if (battleType === 'BOSS') { setNumTrainers(6); setPokemonPerTrainer(1); }
        setOpponentTeam([]); setOpponentTrainerId('');
    }, [battleType]);

    useEffect(() => { setPlayerTeam([]); setPlayerTrainerIds([]); }, [numTrainers, pokemonPerTrainer]);

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
        const scaledPokemon = { ...scalePokemonToLevel(pokemon, battleLevel), originalTrainerId: pokemon.originalTrainerId };
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
        const scaledPokemon = scalePokemonToLevel(pokemon, battleLevel);
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
            if (customMatch) {
                pokemonData = { ...customMatch };
            } else {
                pokemonData = await fetchPokemonData(pokemonName, battleLevel, '', customMoves);
            }
            setEditingWildPokemon(pokemonData);
            setWildPokemonToAdd('');
        } catch (e) {
            dispatch({ type: 'SET_ERROR', payload: e.message });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    const handleAddBulkWildPokemon = (pokemon, quantity) => {
        const baseName = pokemon.name.replace(/\s\d+$/, "");
        const existingCount = opponentTeam.filter(p => p.name.startsWith(baseName)).length;
        const newPokemon = Array.from({ length: quantity }, (_, i) => ({
            ...pokemon,
            id: crypto.randomUUID(),
            name: quantity > 1 || existingCount > 0 ? `${baseName} ${existingCount + i + 1}` : baseName
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

    const startBattle = async () => {
        dispatch({ type: 'SET_LOADING', payload: 'Creating battle...' });
        const resetPokemon = (p) => ({ ...p, currentHp: p.maxHp, fainted: false });
        const freshPlayerTeam = playerTeam.map(resetPokemon);
        let freshOpponentTeam = opponentTeam.map(resetPokemon);
        if (battleType === 'BOSS' && opponentTrainer.finalPokemon) {
            const freshFinalPokemon = resetPokemon(scalePokemonToLevel(opponentTrainer.finalPokemon, battleLevel));
            freshOpponentTeam = [...freshOpponentTeam, freshFinalPokemon];
        }

        const team1Ready = freshPlayerTeam.length > 0;
        const team2Ready = freshOpponentTeam.length > 0;
        if (!team1Ready || !team2Ready) {
            dispatch({ type: 'SET_ERROR', payload: `Both teams must have Pokémon.` });
            return;
        }

        const opponentActiveCount = battleType === 'WILD' ? freshOpponentTeam.length : Math.min(freshOpponentTeam.length, numTrainers);
        const battleId = `battle-${crypto.randomUUID()}`;

        const battleState = {
            id: battleId,
            teams: [
                { id: 'players', name: selectedPlayerTrainers.map(t => t.name).join(' & '), pokemon: freshPlayerTeam, trainerIds: playerTrainerIds },
                { id: opponentTrainer?.id || 'wild', name: opponentTrainer?.name || 'Wild Pokémon', pokemon: freshOpponentTeam }
            ],
            zMoveUsed: {
                players: false,
                opponent: false
            },
            log: [{type: 'text', text: `A battle is starting!`}],
            turn: 1,
            phase: 'ACTION_SELECTION',
            gameOver: false,
            field: { 
                weather: 'none', 
                weatherTurns: 0,
                terrain: 'none',
                terrainTurns: 0,
                trickRoomTurns: 0,
                magicRoomTurns: 0,
                gravityTurns: 0,
                wonderRoomTurns: 0,
                hazards: { players: {}, opponent: {} }
            },
            startOfBattleAbilitiesResolved: false,
            activePokemonIndices: {
                players: Array.from({ length: Math.min(freshPlayerTeam.length, numTrainers) }, (_, i) => i),
                opponent: Array.from({ length: opponentActiveCount }, (_, i) => i)
            },
            userId: state.userId
        };

        try {
            const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);
            await setDoc(battleDocRef, battleState);
            const simulatorUrl = new URL(window.location.href);
            simulatorUrl.pathname = '/simulator';
            simulatorUrl.search = `?battleId=${battleId}`;

            setGeneratedBattle({
                id: battleId,
                url: simulatorUrl.href
            });
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

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    if (generatedBattle) {
        return (
            <div className="p-8 text-center bg-gray-800 rounded-lg max-w-lg mx-auto">
                <h2 className="text-2xl font-bold text-green-400 mb-4">Battle Created!</h2>
                <p className="text-gray-300 mb-2">Your battle has been saved. Use the link below to start the simulation.</p>
                <div className="bg-gray-900 p-4 rounded-lg my-4">
                    <p className="text-gray-400 text-sm">Battle ID</p>
                    <div className="flex items-center justify-between">
                        <code className="text-white text-lg select-all">{generatedBattle.id}</code>
                        <button onClick={() => copyToClipboard(generatedBattle.id)} className="bg-indigo-600 text-sm px-3 py-1 rounded">Copy</button>
                    </div>
                </div>
                <a href={generatedBattle.url} target="_blank" rel="noopener noreferrer" className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-md transition">
                    Open Battle Simulator
                </a>
                <button onClick={() => setGeneratedBattle(null)} className="mt-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-md transition">Create Another Battle</button>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8">
            {editingPokemon && <PokemonEditorModal pokemon={editingPokemon} onSave={handleSavePokemonEdit} onClose={() => setEditingPokemon(null)} dispatch={dispatch} itemList={itemList} />}
            {editingWildPokemon && <PokemonEditorModal pokemon={editingWildPokemon} onSave={handleAddBulkWildPokemon} onClose={() => setEditingWildPokemon(null)} dispatch={dispatch} itemList={itemList} isWildEditor={true} />}
            <h1 className="text-4xl font-bold text-indigo-400 mb-6">Battle Setup</h1>
            <div className="mb-8 p-4 bg-gray-800 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-3">Encounter Settings</h2>
                <div className="flex flex-wrap gap-x-6 gap-y-4">
                    <div className="flex items-center gap-2"><span>Battle Type:</span><select value={battleType} onChange={e => setBattleType(e.target.value)} className="bg-gray-700 p-2 rounded-md"><option value="TRAINER">Trainer vs Trainer</option><option value="WILD">Party vs Wild</option><option value="BOSS">Party vs Boss</option></select></div>
                    <div className="flex items-center gap-2"><span>Trainers:</span><select value={numTrainers} onChange={e => setNumTrainers(Number(e.target.value))} disabled={battleType === 'BOSS'} className="bg-gray-700 p-2 rounded-md disabled:bg-gray-600">{[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                    <div className="flex items-center gap-2"><span>Pokémon / Trainer:</span><select value={pokemonPerTrainer} onChange={e => setPokemonPerTrainer(Number(e.target.value))} disabled={battleType === 'BOSS'} className="bg-gray-700 p-2 rounded-md disabled:bg-gray-600">{[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                    <div className="flex items-center gap-2"><span>Battle Level:</span><input type="number" value={battleLevel} onChange={e => setBattleLevel(Number(e.target.value))} className="w-20 bg-gray-700 p-2 rounded-md" min="1" max="100" /></div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
                    <h2 className="text-2xl font-semibold">Player Team</h2>
                    <div><p className="mb-2 text-sm text-gray-400">1. Select {numTrainers} Party Member(s):</p><div className="flex flex-wrap gap-2">{partyMembers.map(t => (<button key={t.id} onClick={() => togglePlayerTrainerSelection(t.id)} className={`p-2 rounded-md text-sm ${playerTrainerIds.includes(t.id) ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{t.name}</button>))}</div></div>
                    {playerTrainerIds.length > 0 && <div className="space-y-4"><p className="mb-2 text-sm text-gray-400">2. Select up to {pokemonPerTrainer} Pokémon per trainer:</p><div className="space-y-3 max-h-60 overflow-y-auto pr-2">{selectedPlayerTrainers.map(trainer => (<div key={trainer.id}><h4 className="font-bold text-indigo-300">{trainer.name}'s Roster</h4><div className="grid grid-cols-3 gap-2 mt-1">{trainer.roster.map(p => (<PokemonCard key={p.id} pokemon={{ ...p, originalTrainerId: trainer.id }} onSelect={() => togglePlayerPokemonSelection({ ...p, originalTrainerId: trainer.id, originalTrainer: trainer.name })} isSelected={playerTeam.some(sel => sel.id === p.id)} />))}</div></div>))}</div></div>}
                    <div className="pt-4 border-t border-gray-700"><h3 className="text-lg font-semibold mb-2">Selected for Battle ({playerTeam.length}):</h3>
                        <div className="space-y-3">{selectedPlayerTrainers.map(trainer => {
                            const teamForTrainer = playerTeam.filter(p => p.originalTrainerId === trainer.id);
                            if (teamForTrainer.length === 0) return null;
                            return (<div key={trainer.id}><h4 className="font-bold text-indigo-300">{trainer.name}</h4><div className="grid grid-cols-3 gap-2 mt-1">{teamForTrainer.map((p, i) => (<TeamPreviewCard key={p.id} pokemon={p} onSelect={() => handleSetActivePlayerPokemon(p)} isActive={i === 0} />))}</div></div>)
                        })}</div>
                    </div>
                </div>

                <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
                    <h2 className="text-2xl font-semibold">Opponent Team</h2>
                    {battleType === 'WILD' ? (
                        <div><p className="mb-2 text-sm text-gray-400">Add Wild Pokémon:</p><AutocompleteInput value={wildPokemonToAdd} onChange={setWildPokemonToAdd} onSelect={handleWildPokemonSelect} placeholder="Search to add & edit wild Pokémon..." sourceList={combinedPokemonList} /></div>
                    ) : (
                        <div><p className="mb-2 text-sm text-gray-400">Select Opponent Trainer:</p><select value={opponentTrainerId} onChange={e => { setOpponentTrainerId(e.target.value); setOpponentTeam([]); }} className="w-full bg-gray-700 p-2 rounded-md mb-4"><option value="">Select Opponent</option>{opponents.filter(t => battleType === 'BOSS' ? t.category === 'bosses' : true).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                            {opponentTrainer && <div><p className="mb-2 text-sm text-gray-400">Select up to {MAX_PARTY_SIZE} Pokémon for the battle:</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-2">{opponentTrainer.roster.map(p => (<PokemonCard key={p.id} pokemon={p} onSelect={() => toggleOpponentPokemonSelection(p)} isSelected={opponentTeam.some(sel => sel.id === p.id)} />))}</div></div>}
                        </div>
                    )}

                    <div className="pt-4 border-t border-gray-700"><h3 className="text-lg font-semibold mb-2">Selected for Battle ({opponentTeam.length}):</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{opponentTeam.map((p, i) => (<TeamPreviewCard key={p.id} pokemon={p} onSelect={() => battleType === 'WILD' && setEditingPokemon(p)} isActive={battleType === 'WILD' || i < numTrainers} />))}</div>{battleType === 'BOSS' && opponentTrainer?.finalPokemon && <div className="mt-2"><h3 className="text-lg font-semibold text-red-400">Final Pokémon:</h3><div className="grid grid-cols-2 sm:grid-cols-3 gap-2"><TeamPreviewCard pokemon={opponentTrainer.finalPokemon} onSelect={() => { }} isActive={false} /></div></div>}</div>
                </div>
            </div>
            <div className="text-center mt-8 flex justify-center gap-4">
                <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'TRAINER_MANAGER' })} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-md transition">Back to Manager</button>
                <button onClick={startBattle} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-md transition disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={playerTeam.length === 0 || opponentTeam.length === 0}>Start Battle</button>
            </div>
        </div>
    );
};
export default BattleSetup;