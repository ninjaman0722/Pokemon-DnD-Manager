import React, { useState, useEffect, useCallback } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
import { doc, addDoc, updateDoc, deleteDoc, collection, getDoc } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';
import { fetchPokemonData, fetchMoveData, calculateStat, getSprite } from '../../utils/api';
import { MAX_PARTY_SIZE, ALL_STATUS_CONDITIONS, TYPE_COLORS, POKEBALLS } from '../../config/gameData';
import AutocompleteInput from '../common/AutocompleteInput';
import PokemonEditorModal from './PokemonEditorModal'; // Ensure this import is here
import InventoryView from './InventoryView';
import CustomContentManager from '../custom-content/CustomContentManager';
import ScenarioManager from './ScenarioManager';
import { officialFormsData } from '../../config/officialFormsData';
import AddPokemonModal from './AddPokemonModal'; // Correct
import BattleSetup from './BattleSetup';

const TrainerManager = () => {
    const { state, dispatch, selectedCampaign } = useManagerContext();
    const { trainers, selectedTrainerId, combinedPokemonList, combinedItemList, customPokemon, customMoves, user, selectedCampaignId } = state;
    const [mainView, setMainView] = useState('TRAINERS');
    const [rosterView, setRosterView] = useState('ROSTER');
    const [healingPokemon, setHealingPokemon] = useState(null);
    const [newTrainerName, setNewTrainerName] = useState('');
    const [pokemonToAdd, setPokemonToAdd] = useState('');
    const [finalPokemonToAdd, setFinalPokemonToAdd] = useState('');
    const [editingPokemon, setEditingPokemon] = useState(null);
    const [ppRestoreState, setPpRestoreState] = useState(null);
    const [memberProfiles, setMemberProfiles] = useState([]);
    const [currentBoxIndex, setCurrentBoxIndex] = useState(0);
    const [isAddPokemonModalOpen, setIsAddPokemonModalOpen] = useState(false);
    const selectedTrainer = trainers.find(t => t.id === selectedTrainerId);
    const trainersCollectionPath = `campaigns/${selectedCampaignId}/trainers`;
    const [heldPokemon, setHeldPokemon] = useState(null);
    const [isOrganizeMode, setIsOrganizeMode] = useState(false);
    const [scenarioToEdit, setScenarioToEdit] = useState(null);

    useEffect(() => { setRosterView('ROSTER'); }, [selectedTrainerId]);
    useEffect(() => {
        const fetchMemberProfiles = async () => {
            if (!selectedCampaign?.members || selectedCampaign.members.length === 0) {
                setMemberProfiles([]);
                return;
            }
            // Fetch the user document for each member ID
            const profilePromises = selectedCampaign.members.map(memberId =>
                getDoc(doc(db, "users", memberId))
            );
            const profileSnapshots = await Promise.all(profilePromises);
            const profiles = profileSnapshots.map(snap => ({ id: snap.id, ...snap.data() }));
            setMemberProfiles(profiles);
        };

        fetchMemberProfiles();
    }, [selectedCampaign]);
    const handleAddBox = async () => {
        if (!selectedTrainer) return;
        const newBox = { id: crypto.randomUUID(), name: `Box ${selectedTrainer.boxes.length + 1}`, pokemon: [] };
        const newBoxes = [...selectedTrainer.boxes, newBox];

        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        await updateDoc(trainerDocRef, { boxes: newBoxes });
        setCurrentBoxIndex(newBoxes.length - 1); // Switch to the newly created box
    };

    const handleDeleteBox = async (boxIndexToDelete) => {
        if (!selectedTrainer || selectedTrainer.boxes.length <= 1) {
            dispatch({ type: 'SET_ERROR', payload: "You cannot delete the last box." });
            return;
        }
        if (selectedTrainer.boxes[boxIndexToDelete].pokemon.length > 0) {
            if (!window.confirm("This box contains Pokémon. Are you sure you want to delete it? The Pokémon will be lost.")) {
                return;
            }
        }
        const newBoxes = selectedTrainer.boxes.filter((_, index) => index !== boxIndexToDelete);
        setCurrentBoxIndex(Math.max(0, boxIndexToDelete - 1)); // Move selection to previous box

        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        await updateDoc(trainerDocRef, { boxes: newBoxes });
    };

    const handleRenameBox = async (newName) => {
        if (!selectedTrainer) return;
        const newBoxes = [...selectedTrainer.boxes];
        newBoxes[currentBoxIndex].name = newName;

        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        await updateDoc(trainerDocRef, { boxes: newBoxes });
    };
    const handleAssignUser = async (trainerId, userId) => {
        // If "Unassigned" is chosen, userId will be 'null'
        const newUserId = userId === 'null' ? null : userId;

        const trainerDocRef = doc(db, trainersCollectionPath, trainerId);
        try {
            await updateDoc(trainerDocRef, { userId: newUserId });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to assign user: ${error.message}` });
        }
    };
    const defaultPokemonState = {
        transformed: false,
        stat_stages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 },
        volatileStatuses: [],
        status: 'None'
    };
    const calculateAndSetFinalStats = (pokemonData) => {
        // Ensure there are baseStats to calculate from
        if (!pokemonData.baseStats) return pokemonData;

        const stats = {
            hp: calculateStat(pokemonData.baseStats.hp, pokemonData.level, true),
            attack: calculateStat(pokemonData.baseStats.attack, pokemonData.level),
            defense: calculateStat(pokemonData.baseStats.defense, pokemonData.level),
            'special-attack': calculateStat(pokemonData.baseStats['special-attack'], pokemonData.level),
            'special-defense': calculateStat(pokemonData.baseStats['special-defense'], pokemonData.level),
            speed: calculateStat(pokemonData.baseStats.speed, pokemonData.level),
        };

        // Return the full pokemon object with the new stats, maxHp, and currentHp
        return {
            ...pokemonData,
            stats: stats,
            maxHp: stats.hp,
            currentHp: stats.hp,
        };
    };
    const handleAddNewPokemon = useCallback(async (pokemonName, level, destination) => {
        if (!selectedTrainerId || !pokemonName.trim() || !user?.uid) return;

        dispatch({ type: 'SET_LOADING', payload: `Fetching ${pokemonName}...` });

        try {
            // --- THIS IS THE NEW LOGIC ---
            // Determine the correct level based on trainer category
            const isPartyMember = selectedTrainer.category === 'partyMembers';
            const finalLevel = isPartyMember ? selectedCampaign.partyLevel : level;
            // --- END NEW LOGIC ---

            const customMatch = customPokemon.find(p => p.name.toLowerCase() === pokemonName.toLowerCase());
            let initialPokemonData;
            if (customMatch) {
                const moveNames = customMatch.moves || [];
                const moves = await Promise.all(
                    moveNames.map(moveName => fetchMoveData(moveName, customMoves))
                );
                initialPokemonData = {
                    ...defaultPokemonState,
                    ...customMatch,
                    id: crypto.randomUUID(),
                    level: finalLevel,
                    moves: moves.map(m => ({ ...m, pp: m.pp, maxPp: m.pp })),
                    forms: customMatch.forms || [],
                }

            } else {
                // Pass the finalLevel to the fetch function
                const basePokemonData = await fetchPokemonData(pokemonName, finalLevel, '', customMoves);
                initialPokemonData = { ...defaultPokemonState, ...basePokemonData, forms: officialFormsData[basePokemonData.speciesName] || [] };
            }
            const finalPokemonData = calculateAndSetFinalStats(initialPokemonData);

            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainerId);

            if (destination.type === 'roster') {
                if ((selectedTrainer.roster?.length ?? 0) < MAX_PARTY_SIZE) {
                    const newRoster = [...(selectedTrainer.roster || []), finalPokemonData];
                    await updateDoc(trainerDocRef, { roster: newRoster });
                } else {
                    const newBoxes = structuredClone(selectedTrainer.boxes);
                    newBoxes[0].pokemon.push(finalPokemonData);
                    await updateDoc(trainerDocRef, { boxes: newBoxes });
                }
            } else if (destination.type === 'box') {
                const newBoxes = structuredClone(selectedTrainer.boxes);
                const boxIndex = newBoxes.findIndex(b => b.id === destination.boxId);
                if (boxIndex > -1) {
                    newBoxes[boxIndex].pokemon.push(finalPokemonData);
                    await updateDoc(trainerDocRef, { boxes: newBoxes });
                }
            }
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: error.message });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    }, [selectedTrainerId, selectedTrainer, selectedCampaign, user?.uid, dispatch, trainersCollectionPath, customPokemon, customMoves]);

    const handleSetFinalPokemon = async (pokemonName) => {
        if (!selectedTrainerId || !pokemonName.trim() || !user?.uid || !selectedCampaignId) return;
        dispatch({ type: 'SET_LOADING', payload: `Fetching ${pokemonName}...` });
        try {
            const data = await fetchPokemonData(pokemonName, 70, '', customMoves);

            // --- THIS IS THE FIX ---
            const finalData = calculateAndSetFinalStats(data);
            // --- END FIX ---

            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainerId);
            await updateDoc(trainerDocRef, { finalPokemon: finalData });
        } catch (error) { dispatch({ type: 'SET_ERROR', payload: error.message }); } finally { dispatch({ type: 'SET_LOADING', payload: null }); setFinalPokemonToAdd(''); }
    };

    const handleAddTrainer = async () => {
        // This guard clause is already correct from our last change
        if (!newTrainerName.trim() || !user?.uid || !selectedCampaignId) return;
        dispatch({ type: 'SET_LOADING', payload: 'Adding Trainer...' });
        try {
            // --- THIS IS THE CHANGE ---
            // Add a 'userId' field to the new trainer object, initially null.
            // This allows us to assign this trainer to a user later.
            const newTrainer = {
                name: newTrainerName,
                roster: [],
                boxes: [{ id: crypto.randomUUID(), name: 'Box 1', pokemon: [] }],
                category: 'partyMembers',
                finalPokemon: null,
                bag: {},
                userId: null,
                overridePermissions: {}
            };
            // --- END CHANGE ---

            const docRef = await addDoc(collection(db, trainersCollectionPath), newTrainer);
            dispatch({ type: 'SELECT_TRAINER', payload: docRef.id });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to add trainer: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
            setNewTrainerName('');
        }
    };
    const handleRemoveFinalPokemon = async () => {
        if (!selectedTrainerId || !user?.uid || !selectedCampaignId) return;
        try {
            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainerId);
            await updateDoc(trainerDocRef, { finalPokemon: null });
        }
        catch (error) { dispatch({ type: 'SET_ERROR', payload: error.message }); }
    };
    const handleRemovePokemon = async (pokemonIdToRemove) => {
        if (!selectedTrainerId || !user?.uid || !selectedCampaignId) return;
        try {
            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainerId);
            const newRoster = selectedTrainer.roster.filter(p => p.id !== pokemonIdToRemove);
            await updateDoc(trainerDocRef, { roster: newRoster });
        }
        catch (error) { dispatch({ type: 'SET_ERROR', payload: `Failed to remove Pokémon: ${error.message}` }); }
    };
    const handleRemovePokemonFromBox = async (pokemonIdToRemove) => {
        if (!selectedTrainer) return;

        if (!window.confirm("Are you sure you want to release this Pokémon permanently?")) {
            return;
        }

        // Create a deep copy of the boxes array to modify
        const newBoxes = structuredClone(selectedTrainer.boxes);

        // Find the current box
        const boxToUpdate = newBoxes[currentBoxIndex];
        if (!boxToUpdate) return;

        // Filter out the Pokémon to be removed
        boxToUpdate.pokemon = boxToUpdate.pokemon.filter(p => p.id !== pokemonIdToRemove);

        // Update the document in Firestore
        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        try {
            await updateDoc(trainerDocRef, { boxes: newBoxes });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to remove Pokémon from box: ${error.message}` });
        }
    };
    const handleCardClick = (pokemon, location, isHeld, index, boxId = null) => {
        // The destination now uses the correct index passed from the map function.
        const destination = { type: location, index, pokemon, boxId };

        if (heldPokemon || isOrganizeMode) {
            handleSlotClick(destination);
        } else {
            setEditingPokemon({ pokemon, location });
        }
    };
    const handleSlotClick = async (destination) => {
        // If we're not holding a Pokémon and we clicked on a slot that has one, we "pick it up".
        if (!heldPokemon && destination.pokemon) {
            // This is the crucial part. The state must be an object containing both
            // the Pokémon's data and its origin information.
            setHeldPokemon({ pokemon: destination.pokemon, origin: destination });
            return;
        }

        // If we are holding a Pokémon, this click is an attempt to "drop" it.
        if (heldPokemon) {
            // If clicking the same spot, cancel the move (drop it back).
            if (heldPokemon.origin.type === destination.type && heldPokemon.origin.index === destination.index && heldPokemon.origin.boxId === destination.boxId) {
                setHeldPokemon(null);
                return;
            }

            // Prevent dropping into a full party unless it's a swap.
            if (destination.type === 'roster' && !destination.pokemon && selectedTrainer.roster.length >= MAX_PARTY_SIZE) {
                dispatch({ type: 'SET_ERROR', payload: "Party is full. You must swap with a party member." });
                return;
            }

            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
            let newRoster = [...selectedTrainer.roster];
            let newBoxes = structuredClone(selectedTrainer.boxes); // Deep copy

            // --- Step A: Remove Pokémon from its origin ---
            if (heldPokemon.origin.type === 'roster') {
                newRoster.splice(heldPokemon.origin.index, 1);
            } else {
                const originBoxIndex = newBoxes.findIndex(b => b.id === heldPokemon.origin.boxId);
                if (originBoxIndex !== -1) {
                    newBoxes[originBoxIndex].pokemon.splice(heldPokemon.origin.index, 1);
                }
            }

            // --- Step B: Handle the destination (Swap or Drop) ---
            const pokemonToDrop = heldPokemon.pokemon;
            const pokemonAtDestination = destination.pokemon;

            // If we are swapping, put the destination Pokémon back into the origin slot.
            // We do this first to make space for the Pokémon we are dropping.
            if (pokemonAtDestination) {
                if (heldPokemon.origin.type === 'roster') {
                    newRoster.splice(heldPokemon.origin.index, 0, pokemonAtDestination);
                } else {
                    const originBoxIndex = newBoxes.findIndex(b => b.id === heldPokemon.origin.boxId);
                    if (originBoxIndex !== -1) {
                        newBoxes[originBoxIndex].pokemon.splice(heldPokemon.origin.index, 0, pokemonAtDestination);
                    }
                }
            }

            // Now, place the held Pokémon into its new home.
            if (destination.type === 'roster') {
                newRoster.splice(destination.index, (pokemonAtDestination ? 1 : 0), pokemonToDrop);
            } else {
                const destBoxIndex = newBoxes.findIndex(b => b.id === destination.boxId);
                if (destBoxIndex !== -1) {
                    newBoxes[destBoxIndex].pokemon.splice(destination.index, (pokemonAtDestination ? 1 : 0), pokemonToDrop);
                }
            }

            // --- Step C: Update Firestore and reset state ---
            try {
                await updateDoc(trainerDocRef, { roster: newRoster, boxes: newBoxes });
                setHeldPokemon(null); // Clear the held pokemon
            } catch (error) {
                dispatch({ type: 'SET_ERROR', payload: `Move failed: ${error.message}` });
            }
        }
    };
    const handlePartyLevelChange = async (newLevel) => {
        const level = Math.max(1, Math.min(100, Number(newLevel)));
        const campaignDocRef = doc(db, 'campaigns', selectedCampaignId);
        try {
            await updateDoc(campaignDocRef, { partyLevel: level });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to update Party Level: ${error.message}` });
        }
    };
    const handleLoadScenarioForEdit = (scenarioData) => {
        setScenarioToEdit(scenarioData);
        setMainView('BATTLE_SETUP');
    };
    const handleSavePokemonEdit = async (editedPokemon, isFinal = false) => {
        if (!selectedTrainerId || !user?.uid || !selectedCampaignId) return;
        dispatch({ type: 'SET_LOADING', payload: "Saving Changes..." });
        try {
            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainerId);
            const updatePayload = isFinal ? { finalPokemon: editedPokemon } : { roster: selectedTrainer.roster.map(p => p.id === editedPokemon.id ? editedPokemon : p) };
            await updateDoc(trainerDocRef, updatePayload);
        } catch (error) { dispatch({ type: 'SET_ERROR', payload: `Failed to save Pokémon: ${error.message}` }); } finally { dispatch({ type: 'SET_LOADING', payload: null }); setEditingPokemon(null) }
    };
    const handleRemoveTrainer = async (trainerId) => {
        if (!user?.uid || !selectedCampaignId) return;
        try { await deleteDoc(doc(db, trainersCollectionPath, trainerId)); }
        catch (error) { dispatch({ type: 'SET_ERROR', payload: `Failed to remove trainer: ${error.message}` }); }
    };
    const handleCategoryChange = async (trainerId, newCategory) => {
        if (!user?.uid || !selectedCampaignId) return;
        try {
            const trainerDocRef = doc(db, trainersCollectionPath, trainerId);
            await updateDoc(trainerDocRef, { category: newCategory });
        }
        catch (error) { dispatch({ type: 'SET_ERROR', payload: `Failed to update category: ${error.message}` }); }
    };
    const handleBagUpdate = async (newBag) => {
        if (!selectedTrainerId || !user?.uid || !selectedCampaignId) return;
        try {
            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainerId);
            await updateDoc(trainerDocRef, { bag: newBag });
        }
        catch (error) { dispatch({ type: 'SET_ERROR', payload: `Failed to update bag: ${error.message}` }); }
    };
    const isItemUsable = (item, pokemon) => {
        if (!item || !pokemon) return false;
        const itemName = item.name.toLowerCase();
        if (pokemon.fainted) return itemName.includes('revive');
        switch (itemName) {
            case 'potion':
            case 'super potion':
            case 'hyper potion':
            case 'max potion':
                return pokemon.currentHp < pokemon.maxHp;
            case 'antidote':
                return pokemon.status === 'Poisoned' || pokemon.status === 'Badly Poisoned';
            case 'burn heal':
                return pokemon.status === 'Burned';
            case 'ice heal':
                return pokemon.status === 'Frozen';
            case 'awakening':
                return pokemon.status === 'Asleep';
            case 'paralyze heal':
                return pokemon.status === 'Paralyzed';
            case 'full heal':
                return pokemon.status !== 'None';
            case 'full restore':
                return pokemon.currentHp < pokemon.maxHp || pokemon.status !== 'None';
            case 'ether':
            case 'max ether':
            case 'elixir':
            case 'max elixir':
                return pokemon.moves.some(m => m.pp < m.maxPp);
            default:
                return false;
        }
    };
    const handleUseItem = async (pokemonToHeal, itemToUse) => {
        if (!isItemUsable(itemToUse, pokemonToHeal)) {
            dispatch({ type: 'SET_ERROR', payload: "This item cannot be used right now." });
            return;
        }
        dispatch({ type: 'SET_LOADING', payload: `Using ${itemToUse.name}...` });

        let healedPokemon = { ...pokemonToHeal, moves: [...pokemonToHeal.moves.map(m => ({ ...m }))] };
        const newBag = { ...selectedTrainer.bag };
        const itemKey = itemToUse.name.replace(/\s/g, '-').toLowerCase();
        const itemName = itemToUse.name.toLowerCase();

        switch (itemName) {
            case 'potion':
                healedPokemon.currentHp = Math.min(healedPokemon.maxHp, healedPokemon.currentHp + 20); break;
            case 'super potion':
                healedPokemon.currentHp = Math.min(healedPokemon.maxHp, healedPokemon.currentHp + 60); break;
            case 'hyper potion':
                healedPokemon.currentHp = Math.min(healedPokemon.maxHp, healedPokemon.currentHp + 120); break;
            case 'max potion':
                healedPokemon.currentHp = healedPokemon.maxHp; break;
            case 'revive':
                healedPokemon.fainted = false;
                healedPokemon.currentHp = Math.floor(healedPokemon.maxHp / 2); break;
            case 'max revive':
                healedPokemon.fainted = false;
                healedPokemon.currentHp = healedPokemon.maxHp; break;
            case 'antidote':
            case 'burn heal':
            case 'ice heal':
            case 'awakening':
            case 'paralyze heal':
            case 'full heal':
                healedPokemon.status = "None"; break;
            case 'full restore':
                healedPokemon.currentHp = healedPokemon.maxHp;
                healedPokemon.status = "None"; break;
            case 'ether':
            case 'max ether':
                setHealingPokemon(null);
                setPpRestoreState({ pokemon: pokemonToHeal, item: itemToUse });
                return;

            case 'elixir':
                healedPokemon.moves.forEach(move => move.pp = Math.min(move.maxPp, move.pp + 10));
                break;
            case 'max elixir':
                healedPokemon.moves.forEach(move => move.pp = move.maxPp);
                break;
            default:
                break;
        }

        if (newBag[itemKey].quantity > 1) {
            newBag[itemKey].quantity -= 1;
        } else {
            delete newBag[itemKey];
        }
        const newRoster = selectedTrainer.roster.map(p => p.id === healedPokemon.id ? healedPokemon : p);
        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        try {
            await updateDoc(trainerDocRef, { roster: newRoster, bag: newBag });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to use item: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
            setHealingPokemon(null);
        }
    };
    const handlePpRestore = async (pokemonToHeal, itemToUse, moveIndex) => {
        dispatch({ type: 'SET_LOADING', payload: `Using ${itemToUse.name}...` });

        let healedPokemon = { ...pokemonToHeal, moves: [...pokemonToHeal.moves.map(m => ({ ...m }))] };
        const itemName = itemToUse.name.toLowerCase();

        const moveToRestore = healedPokemon.moves[moveIndex];
        if (itemName === 'ether') {
            moveToRestore.pp = Math.min(moveToRestore.maxPp, moveToRestore.pp + 10);
        } else if (itemName === 'max ether') {
            moveToRestore.pp = moveToRestore.maxPp;
        }

        const newBag = { ...selectedTrainer.bag };
        const itemKey = itemToUse.name.replace(/\s/g, '-').toLowerCase();
        if (newBag[itemKey].quantity > 1) {
            newBag[itemKey].quantity -= 1;
        } else {
            delete newBag[itemKey];
        }
        const newRoster = selectedTrainer.roster.map(p => p.id === healedPokemon.id ? healedPokemon : p);
        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        try {
            await updateDoc(trainerDocRef, { roster: newRoster, bag: newBag });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to use item: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
            setPpRestoreState(null);
        }
    };
    const handleFullHeal = async (pokemonToHeal) => {
        if (!selectedTrainer) return;
        const healedPokemon = {
            ...pokemonToHeal,
            currentHp: pokemonToHeal.maxHp,
            status: "None",
            volatileStatuses: [],
            moves: pokemonToHeal.moves.map(move => ({ ...move, pp: move.maxPp })),
        };
        const newRoster = selectedTrainer.roster.map(p => p.id === pokemonToHeal.id ? healedPokemon : p);
        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        try { await updateDoc(trainerDocRef, { roster: newRoster }); }
        catch (error) { dispatch({ type: 'SET_ERROR', payload: `Failed to heal Pokémon: ${error.message}` }); }
    };
    const handleFullRestore = async () => {
        if (!selectedTrainer) return;
        dispatch({ type: 'SET_LOADING', payload: 'Healing Pokémon...' });
        const healedRoster = selectedTrainer.roster.map(pokemon => ({
            ...pokemon,
            currentHp: pokemon.maxHp,
            status: "None",
            volatileStatuses: [],
            moves: pokemon.moves.map(move => ({ ...move, pp: move.maxPp })),
        }));
        const healedFinalPokemon = selectedTrainer.finalPokemon ? {
            ...selectedTrainer.finalPokemon,
            currentHp: selectedTrainer.finalPokemon.maxHp,
            status: "None",
            volatileStatuses: [],
            moves: selectedTrainer.finalPokemon.moves.map(move => ({ ...move, pp: move.maxPp })),
        } : null;
        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        try {
            await updateDoc(trainerDocRef, { roster: healedRoster, finalPokemon: healedFinalPokemon });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to heal team: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };
    const trainerCategories = { partyMembers: "Party Members", bosses: "Bosses", badGuys: "Bad Guys", npcs: "Other NPCs" };
    const PokeballIcon = ({ pokemon }) => {
        const ball = POKEBALLS.find(b => b.name === (pokemon.pokeball || 'poke-ball'));
        if (!ball) return null;
        return (
            <div className="absolute -top-1 -left-1 bg-gray-900/50 p-0.5 rounded-full z-10" title={ball.name.replace(/-/g, ' ')}>
                <img src={ball.sprite} alt={ball.name} className="h-5 w-5" />
            </div>
        );
    };

    const HeldItemIcon = ({ item }) => {
        if (!item?.sprite) return null;
        return <div className="absolute top-1 right-1 bg-gray-500/50 p-0.5 rounded-full z-10" title={item.name}><img src={item.sprite} alt={item.name} className="h-6 w-6" /></div>;
    };
    const HealingItemModal = ({ pokemon, trainer, onUseItem, onClose }) => {
        const bag = trainer.bag || {};
        const allItems = Object.values(bag).sort((a, b) => a.name.localeCompare(b.name));

        return (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
                <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-indigo-400">Use Item on {pokemon.name}</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                    </div>
                    {allItems.length > 0 ? (
                        <ul className="space-y-2 max-h-80 overflow-y-auto pr-2">
                            {allItems.map(item => {
                                const usable = isItemUsable(item, pokemon);
                                return (
                                    <li key={item.name}>
                                        <button
                                            onClick={() => onUseItem(pokemon, item)}
                                            disabled={!usable}
                                            className="w-full p-2 rounded-md flex items-center justify-between hover:bg-indigo-600 transition-colors text-left disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div className="flex items-center gap-3">
                                                <img src={item.sprite} alt={item.name} className="w-8 h-8" />
                                                <span className="capitalize font-medium">{item.name}</span>
                                            </div>
                                            <span className="font-semibold text-gray-400">x{item.quantity}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="text-center text-gray-400 italic py-8">This trainer has no usable healing items.</p>
                    )}
                </div>
            </div>
        );
    };
    const PpRestoreModal = ({ ppRestoreState, onSelectMove, onClose }) => {
        const { pokemon, item } = ppRestoreState;
        const movesToRestore = pokemon.moves
            .map((move, index) => ({ ...move, index }))
            .filter(move => move.pp < move.maxPp);

        return (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
                <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-indigo-400">Restore PP for {pokemon.name}</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                    </div>
                    <p className="text-sm text-gray-400">Select a move to use the {item.name} on.</p>
                    <ul className="space-y-2 max-h-80 overflow-y-auto pr-2">
                        {movesToRestore.map(move => (
                            <li key={move.index}>
                                <button
                                    onClick={() => onSelectMove(pokemon, item, move.index)}
                                    className="w-full p-2 rounded-md flex items-center justify-between hover:bg-indigo-600 transition-colors text-left"
                                >
                                    <span className="capitalize font-medium">{move.name}</span>
                                    <span className="font-semibold text-gray-400">{move.pp}/{move.maxPp} PP</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        );
    };
    const StatusIcon = ({ status, volatileStatuses }) => {
        const primaryStatusInfo = ALL_STATUS_CONDITIONS[status];
        return (
            <div className="absolute top-1 left-1 flex flex-col gap-1 z-10">
                {primaryStatusInfo && status !== 'None' && (
                    <div className={`text-white text-xs font-bold ${primaryStatusInfo.color} px-1.5 py-0.5 rounded-full`}>
                        {primaryStatusInfo.short}
                    </div>
                )}
                {volatileStatuses?.map(vs => {
                    const vsInfo = ALL_STATUS_CONDITIONS[vs];
                    return vsInfo ? <div key={vs} className={`text-white text-xs font-bold ${vsInfo.color} px-1.5 py-0.5 rounded-full`}>{vsInfo.short}</div> : null;
                })}
            </div>
        );
    };

    return (
        <div className="p-4 md:p-8">
            {/* Find where you render the views and pass the new props */}
            {editingPokemon && (
                <PokemonEditorModal
                    pokemon={editingPokemon.pokemon}
                    pokemonLocation={editingPokemon.location}
                    trainerCategory={selectedTrainer.category}
                    partyLevel={selectedCampaign?.partyLevel}
                    onSave={(p) => handleSavePokemonEdit(p, editingPokemon.isFinal)}
                    onClose={() => setEditingPokemon(null)}
                    dispatch={dispatch}
                    itemList={combinedItemList}
                />
            )}
            {isAddPokemonModalOpen && (
                <AddPokemonModal
                    trainer={selectedTrainer}
                    onClose={() => setIsAddPokemonModalOpen(false)}
                    onAdd={handleAddNewPokemon}
                    pokemonList={combinedPokemonList}
                    dispatch={dispatch}
                />
            )}
            {healingPokemon && <HealingItemModal pokemon={healingPokemon} trainer={selectedTrainer} onUseItem={handleUseItem} onClose={() => setHealingPokemon(null)} />}
            {ppRestoreState && <PpRestoreModal ppRestoreState={ppRestoreState} onSelectMove={handlePpRestore} onClose={() => setPpRestoreState(null)} />}
            <h1 className="text-4xl font-bold text-indigo-400 mb-2">Pokémon DnD Manager</h1>
            <div className="flex space-x-2 border-b-2 border-gray-700 mb-4">
                {['TRAINERS', 'CUSTOM_CONTENT', 'SCENARIOS'].map(viewName => (
                    <button key={viewName} onClick={() => setMainView(viewName)} className={`px-4 py-2 font-semibold text-lg ${mainView === viewName ? 'border-b-4 border-indigo-500 text-white' : 'text-gray-400'}`}>{viewName.replace('_', ' ')}</button>
                ))}
            </div>
            {mainView === 'TRAINERS' && (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            {Object.entries(trainerCategories).map(([key, title]) => (
                                <div key={key} className="bg-gray-800 p-4 rounded-lg shadow-lg">
                                    <div className="flex justify-between items-center mb-3 border-b border-gray-700 pb-2">
                                        <h3 className="text-xl font-semibold text-indigo-300">{title}</h3>

                                        {/* Conditionally render the Party Level input ONLY for the Party Members category */}
                                        {key === 'partyMembers' && (
                                            <div className="flex items-center gap-2">
                                                <label className="text-sm font-medium text-yellow-400 whitespace-nowrap">Party Level:</label>
                                                <input
                                                    type="number"
                                                    value={selectedCampaign?.partyLevel || 5}
                                                    onChange={(e) => handlePartyLevelChange(e.target.value)}
                                                    className="bg-gray-900 p-1 rounded-md border border-gray-600 w-20 text-center"
                                                    min="1"
                                                    max="100"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-2 min-h-[60px]">
                                        {trainers.filter(t => t.category === key).map((trainer) => (
                                            <div key={trainer.id} onClick={() => dispatch({ type: 'SELECT_TRAINER', payload: trainer.id })} className={`p-3 rounded-md transition flex justify-between items-center cursor-pointer ${selectedTrainerId === trainer.id ? 'bg-indigo-600 ring-2 ring-indigo-400' : 'bg-gray-700 hover:bg-gray-600'}`}>
                                                <span className="font-semibold">{trainer.name}</span>
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={trainer.userId || 'null'}
                                                        onChange={(e) => handleAssignUser(trainer.id, e.target.value)}
                                                        onClick={(e) => e.stopPropagation()} // Prevents selecting the trainer
                                                        className="bg-gray-900 text-xs rounded border border-gray-600 p-1"
                                                    >
                                                        <option value="null">-- Unassigned --</option>
                                                        {memberProfiles.map(profile => (
                                                            <option key={profile.id} value={profile.id}>
                                                                {profile.displayName}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveTrainer(trainer.id); }} className="text-red-400 hover:text-red-200 font-bold px-2 rounded-full">✕</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                                <h2 className="text-2xl font-semibold mb-4 border-b border-gray-600 pb-2">Create New Trainer</h2>
                                <form onSubmit={(e) => { e.preventDefault(); handleAddTrainer(); }} className="flex space-x-2">
                                    <input type="text" value={newTrainerName} onChange={e => setNewTrainerName(e.target.value)} placeholder="New Trainer Name" className="flex-grow bg-gray-900 p-2 rounded-md border border-gray-600" />
                                    <button type="submit" className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md font-semibold text-lg">+</button>
                                </form>
                            </div>
                        </div>
                        <div className="lg:col-span-1">
                            <div className="bg-gray-800 p-6 rounded-lg shadow-lg sticky top-8">
                                {selectedTrainer ? (
                                    <>
                                        <div className="flex justify-between items-center mb-2">
                                            <h2 className="text-2xl font-semibold capitalize">{selectedTrainer?.name || 'Select a Trainer'}</h2>
                                        </div>
                                        <div className="flex border-b border-gray-600 mb-4">
                                            <button onClick={() => setRosterView('ROSTER')} className={`px-3 py-1 font-semibold ${rosterView === 'ROSTER' ? 'border-b-2 border-indigo-400 text-white' : 'text-gray-400'}`}>Roster</button>
                                            <button onClick={() => setRosterView('BOX')} className={`px-3 py-1 font-semibold ${rosterView === 'BOX' ? 'border-b-2 border-indigo-400 text-white' : 'text-gray-400'}`}>Box</button>
                                            {selectedTrainer.category === 'partyMembers' && <button onClick={() => setRosterView('BAG')} className={`px-3 py-1 font-semibold ${rosterView === 'BAG' ? 'border-b-2 border-indigo-400 text-white' : 'text-gray-400'}`}>Bag</button>}
                                        </div>
                                        {rosterView === 'ROSTER' ? (
                                            <div>
                                                <div className="flex items-end justify-between mb-4 gap-4">
                                                    <div className="flex-grow">
                                                        <label className="block text-sm font-medium text-gray-400 mb-1">Category</label>
                                                        <select value={selectedTrainer.category} onChange={(e) => handleCategoryChange(selectedTrainer.id, e.target.value)} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600">{Object.entries(trainerCategories).map(([key, title]) => (<option key={key} value={key}>{title}</option>))}</select>
                                                    </div>
                                                    {/* The Restore All button is now here, smaller and next to the dropdown */}
                                                    <button onClick={handleFullRestore} className="bg-green-700 hover:bg-green-600 text-white font-semibold py-2 px-3 rounded-md text-sm whitespace-nowrap">
                                                        Restore All
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {[...Array(MAX_PARTY_SIZE)].map((_, index) => {
                                                        const pokemon = selectedTrainer.roster[index];
                                                        const destination = { type: 'roster', index, pokemon };
                                                        const isHeld = heldPokemon?.pokemon.id === pokemon?.id;

                                                        return pokemon ? (
                                                            // This is YOUR detailed Pokémon card, now integrated with the new system
                                                            <div
                                                                key={pokemon.id}
                                                                onClick={() => handleCardClick(pokemon, 'roster', isHeld, index)}
                                                                className={`m-1 relative group text-center p-2 rounded-md flex flex-col justify-between transition-all duration-200 ${isHeld ? 'opacity-30 ring-2 ring-yellow-400' : 'bg-gray-700 hover:bg-gray-600'} ${pokemon.fainted ? 'opacity-50' : ''} ${isOrganizeMode ? 'cursor-grab' : 'cursor-pointer'}`}
                                                            >
                                                                {/* Your detailed card content remains, but the "Move to Box" button is removed */}
                                                                {pokemon.fainted && (<div className="absolute inset-0 flex items-center justify-center z-20"><span className="text-red-500 font-bold text-lg transform -rotate-12 bg-black/50 px-2 py-1 rounded">FAINTED</span></div>)}
                                                                <div className="flex items-start justify-between"><PokeballIcon pokemon={pokemon} /><StatusIcon status={pokemon.status} volatileStatuses={pokemon.volatileStatuses} /></div>
                                                                <HeldItemIcon item={pokemon.heldItem} />
                                                                <div><img src={getSprite(pokemon)} alt={pokemon.name} className="mx-auto h-16 w-16" /><p className="text-sm font-semibold truncate mt-1">{pokemon.name}</p><p className="text-xs font-mono text-yellow-300">HP: {pokemon.currentHp} / {pokemon.maxHp}</p></div>
                                                                <div className="flex flex-wrap justify-center gap-1 mt-1">{pokemon.types?.map(type => <span key={type} className={`px-1.5 py-0.5 text-xs rounded-full uppercase font-bold ${TYPE_COLORS[type]}`}>{type}</span>)}</div>
                                                                <div className="text-left text-xs mt-2 space-y-1">{(pokemon.moves || []).map(move => (<div key={move.name} className="flex justify-between items-center"><span className="truncate" title={move.name}>{move.name}</span><span className="font-mono text-gray-400">{move.pp}/{move.maxPp}</span></div>))}</div>

                                                                {/* The hover menu now only contains actions other than moving */}
                                                                <div className="absolute bottom-1 right-1 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                                                                    <button title="Use Item" onClick={(e) => { e.stopPropagation(); setHealingPokemon(pokemon) }} className="bg-blue-600 text-white rounded-full h-6 w-6 flex items-center justify-center shadow-md hover:bg-blue-500 transition-colors">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" /></svg>
                                                                    </button>
                                                                    <button title="Full Heal" onClick={(e) => { e.stopPropagation(); handleFullHeal(pokemon) }} className="bg-green-600 text-white rounded-full h-6 w-6 flex items-center justify-center shadow-md hover:bg-green-500 transition-colors text-lg font-bold leading-none pb-0.5">+</button>
                                                                    <button title="Remove Pokémon" onClick={(e) => { e.stopPropagation(); handleRemovePokemon(pokemon.id) }} className="bg-red-600 text-white rounded-full h-6 w-6 flex items-center justify-center shadow-md hover:bg-red-500 transition-colors text-xl font-bold leading-none pb-0.5">-</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            // This renders the empty, clickable drop slots
                                                            <div key={`empty-roster-${index}`} onClick={() => handleSlotClick({ type: 'roster', index, pokemon: null })} className="m-1 bg-gray-800/50 rounded-md w-23 h-[17rem] flex items-center justify-center cursor-pointer hover:bg-gray-700/50 border-2 border-dashed border-gray-600">
                                                                {heldPokemon && <span className="text-gray-500">Drop Here</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {selectedTrainer.category === 'bosses' && (
                                                    <div className="mt-6 pt-4 border-t-2 border-dashed border-red-500">
                                                        <h3 className="text-lg font-bold text-red-400 mb-2 text-center">Final Pokémon</h3>
                                                        {selectedTrainer.finalPokemon ? (
                                                            <div onClick={() => setEditingPokemon({ pokemon: selectedTrainer.finalPokemon, isFinal: true })} className="relative group text-center p-2 bg-gray-700 rounded-md cursor-pointer hover:bg-gray-600 flex flex-col justify-between">
                                                                <StatusIcon status={selectedTrainer.finalPokemon.status} volatileStatuses={selectedTrainer.finalPokemon.volatileStatuses} />
                                                                <HeldItemIcon item={selectedTrainer.finalPokemon.heldItem} />
                                                                <div>
                                                                    <img src={getSprite(selectedTrainer.finalPokemon)} alt={selectedTrainer.finalPokemon.name} className="mx-auto h-16 w-16" />
                                                                    <p className="text-sm font-semibold truncate mt-1">{selectedTrainer.finalPokemon.name}</p>
                                                                </div>
                                                                <div className="flex flex-wrap justify-center gap-1 mt-1">{selectedTrainer.finalPokemon.types?.map(type => <span key={type} className={`px-1.5 py-0.5 text-xs rounded-full uppercase font-bold ${TYPE_COLORS[type]}`}>{type}</span>)}</div>
                                                                <button onClick={(e) => { e.stopPropagation(); handleRemoveFinalPokemon() }} className="absolute -bottom-1 -right-1 bg-red-600 text-white rounded-full h-5 w-5 text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">-</button>
                                                            </div>
                                                        ) : (
                                                            <form onSubmit={(e) => { e.preventDefault(); handleSetFinalPokemon(finalPokemonToAdd); }} className="flex space-x-2">
                                                                <AutocompleteInput value={finalPokemonToAdd} onChange={setFinalPokemonToAdd} onSelect={handleSetFinalPokemon} placeholder="Set Final Pokémon" sourceList={combinedPokemonList} />
                                                                <button type="submit" disabled={!finalPokemonToAdd} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed">Set</button>
                                                            </form>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : rosterView === 'BAG' ? (
                                            <InventoryView trainer={selectedTrainer} itemList={combinedItemList} onBagUpdate={handleBagUpdate} dispatch={dispatch} />
                                        ) : rosterView === 'BOX' ? (
                                            <div>
                                                {/* --- Box Navigation and Management --- */}
                                                <div className="flex items-center justify-between gap-2 mb-3 bg-gray-900 p-2 rounded-md">
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => setCurrentBoxIndex(i => Math.max(0, i - 1))} className="px-2 py-1 bg-indigo-600 rounded hover:bg-indigo-700">←</button>

                                                        {/* The dropdown is now an input for renaming */}
                                                        <input
                                                            type="text"
                                                            value={selectedTrainer.boxes?.[currentBoxIndex]?.name || ''}
                                                            onChange={e => handleRenameBox(e.target.value)}
                                                            className="bg-gray-700 p-1 rounded-md border border-gray-600 text-sm text-center w-32"
                                                        />

                                                        <button onClick={() => setCurrentBoxIndex(i => Math.min(selectedTrainer.boxes.length - 1, i + 1))} className="px-2 py-1 bg-indigo-600 rounded hover:bg-indigo-700">→</button>
                                                    </div>

                                                    {/* The old, separate input is now gone, leaving only the add/delete buttons */}
                                                    <div className="flex gap-2">
                                                        <button onClick={handleAddBox} className="text-sm bg-green-600 px-2 py-1 rounded hover:bg-green-700">+</button>
                                                        <button onClick={() => handleDeleteBox(currentBoxIndex)} className="text-sm bg-red-600 px-2 py-1 rounded hover:bg-red-700">-</button>
                                                    </div>
                                                </div>

                                                {/* --- Pokémon Grid --- */}
                                                <h3 className="text-lg font-semibold text-gray-300 mb-2">
                                                    {selectedTrainer.boxes?.[currentBoxIndex]?.name} ({selectedTrainer.boxes?.[currentBoxIndex]?.pokemon.length || 0})
                                                </h3>
                                                <div className="grid grid-cols-6 gap-1">
                                                    {[...Array(30)].map((_, index) => {
                                                        const currentBox = selectedTrainer.boxes?.[currentBoxIndex];
                                                        const pokemon = currentBox?.pokemon[index];
                                                        // We create a destination object for both existing Pokémon and empty slots
                                                        const destination = { type: 'box', boxId: currentBox?.id, index, pokemon };
                                                        const isHeld = heldPokemon?.pokemon.id === pokemon?.id;

                                                        return pokemon ? (
                                                            // This is the card for an existing Pokémon in the box
                                                            <div
                                                                key={pokemon.id}
                                                                onClick={() => handleCardClick(pokemon, 'box', isHeld, index, currentBox?.id)}
                                                                className={`m-1 relative group flex items-center justify-center rounded-md w-12 h-12 transition-colors ${isHeld ? 'opacity-30 ring-2 ring-yellow-400' : 'bg-gray-700/50 hover:bg-gray-600/50'} ${isOrganizeMode ? 'cursor-grab' : 'cursor-pointer'}`}
                                                            >
                                                                <img src={getSprite(pokemon)} alt={pokemon.name} className="h-15 w-15 pointer-events-none" />
                                                                <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                                                                    <button
                                                                        title="Remove Pokémon"
                                                                        onClick={(e) => { e.stopPropagation(); handleRemovePokemonFromBox(pokemon.id); }}
                                                                        className="bg-red-600 text-white rounded-full h-4 w-4 flex items-center justify-center shadow-md hover:bg-red-500 transition-colors m-0.5"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-1.009.246-1.855.85-2.433 1.623A2.004 2.004 0 0 0 2 7.558V14.5a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 18 14.5V7.558c0-.422-.128-.826-.367-1.165A2.738 2.738 0 0 0 15.19 5.8C14.61 5.029 13.763 4.42 12.753 4.193V3.75A2.75 2.75 0 0 0 10 1h-1.25ZM10 2.5h-1.25a1.25 1.25 0 0 0-1.25 1.25v.452c.26.04.514.103.762.188a2.5 2.5 0 0 1 1.476 0c.248-.085.502-.148.762-.188V3.75A1.25 1.25 0 0 0 10 2.5ZM9.25 7.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Zm-3 0a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 6.25 7.5Zm6 0a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" /></svg>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            // This renders the empty, clickable drop slots
                                                            <div
                                                                key={`empty-box-${index}`}
                                                                onClick={() => handleSlotClick(destination)}
                                                                className="m-1 bg-gray-800/50 rounded-md w-12 h-12 flex items-center justify-center cursor-pointer hover:bg-gray-700/50 border-2 border-dashed border-gray-600"
                                                            >
                                                                {heldPokemon && <span className="text-gray-500 text-xs text-center">Drop Here</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : ( // <-- This is the final 'else' for the Bag view
                                            <InventoryView trainer={selectedTrainer} itemList={combinedItemList} onBagUpdate={handleBagUpdate} dispatch={dispatch} />
                                        )}
                                        <div className="flex gap-2 mt-6 pt-4 border-t border-gray-700">
                                            <button
                                                onClick={() => setIsOrganizeMode(prev => !prev)}
                                                title="Toggle Organize Mode"
                                                className={`flex-1 font-bold py-2 px-3 rounded-md text-sm text-white transition-colors ${isOrganizeMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-500'}`}
                                            >
                                                Organize
                                            </button>
                                            <button onClick={() => setIsAddPokemonModalOpen(true)} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-md text-sm">
                                                Add Pokémon
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-gray-400 italic">Select a trainer to manage their roster.</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-center mt-8"><button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'BATTLE_SETUP' })} disabled={trainers.length < 1} className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-md transition w-full md:w-auto disabled:bg-gray-600 disabled:cursor-not-allowed">Proceed to Battle Setup</button></div>
                </>
            )}
            {mainView === 'BATTLE_SETUP' && (
                <BattleSetup
                    state={state}
                    dispatch={dispatch}
                    initialScenario={scenarioToEdit}
                    onLoadComplete={() => setScenarioToEdit(null)}
                />
            )}
            {mainView === 'CUSTOM_CONTENT' && <CustomContentManager />}
            {mainView === 'SCENARIOS' && <ScenarioManager onEditScenario={handleLoadScenarioForEdit} />}
        </div>
    );
}

export default TrainerManager;