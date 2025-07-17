import React, { useState, useEffect, useCallback } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
import { doc, addDoc, updateDoc, deleteDoc, collection, getDoc } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';
import { fetchPokemonData, fetchMoveData, calculateStat, getSprite } from '../../utils/api';
import { MAX_PARTY_SIZE, ALL_STATUS_CONDITIONS, TYPE_COLORS, POKEBALLS, FUSION_RECIPES, KEY_ITEM_RECIPES } from '../../config/gameData';
import AutocompleteInput from '../common/AutocompleteInput';
import PokemonEditorModal from './PokemonEditorModal'; // Ensure this import is here
import InventoryView from './InventoryView';
import CustomContentManager from '../custom-content/CustomContentManager';
import { officialFormsData } from '../../config/officialFormsData';
import FusionModal from './FusionModal';
import KeyItemTransformModal from './KeyItemTransformModal';

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
    const [isFusionModalOpen, setIsFusionModalOpen] = useState(false);
    const [isTransformModalOpen, setIsTransformModalOpen] = useState(false);
    const [memberProfiles, setMemberProfiles] = useState([]);

    const selectedTrainer = trainers.find(t => t.id === selectedTrainerId);
    const trainersCollectionPath = `campaigns/${selectedCampaignId}/trainers`;

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
    const handleAddPokemon = useCallback(async (pokemonName) => {
        if (!selectedTrainerId || !pokemonName.trim() || !user?.uid || !selectedCampaignId) return;
        const isRosterFull = (selectedTrainer?.roster?.length ?? 0) >= MAX_PARTY_SIZE;
        dispatch({ type: 'SET_LOADING', payload: `Fetching ${pokemonName}...` });


        try {
            let initialPokemonData; // Changed name from finalPokemonData
            const customMatch = customPokemon.find(p => p.name.toLowerCase() === pokemonName.toLowerCase());

            if (customMatch) {
                const moveNames = customMatch.moves || [];
                const moves = await Promise.all(
                    moveNames.map(moveName => fetchMoveData(moveName, customMoves))
                );
                initialPokemonData = {
                    ...defaultPokemonState,
                    ...customMatch,
                    id: crypto.randomUUID(),
                    level: 50,
                    moves: moves.map(m => ({ ...m, pp: m.pp, maxPp: m.pp })),
                    forms: customMatch.forms || [],
                };
            } else {
                // Logic for adding an official Pokémon
                const basePokemonData = await fetchPokemonData(pokemonName, 50, '', customMoves);
                const forms = officialFormsData[basePokemonData.speciesName] || [];
                // Create the initial object without stats
                initialPokemonData = {
                    ...defaultPokemonState,
                    ...basePokemonData,
                    forms: forms,
                };
            }

            // --- THIS IS THE FIX ---
            // Now, use the helper function to calculate and add the final stats
            const finalPokemonData = calculateAndSetFinalStats(initialPokemonData);
            // --- END FIX ---

            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainerId);
            if (isRosterFull) {
                // Roster is full, add to box instead
                const newBox = [...(selectedTrainer.box || []), finalPokemonData];
                await updateDoc(trainerDocRef, { box: newBox });
                // Optional: Add a non-error feedback message here if you have a system for it.
                // For now, it will just silently add to the box.
            } else {
                // Roster has space, add normally
                const newRoster = [...(selectedTrainer.roster || []), finalPokemonData];
                await updateDoc(trainerDocRef, { roster: newRoster });
            }

        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: error.message });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
            setPokemonToAdd('');
        }
    }, [selectedTrainerId, selectedTrainer, user?.uid, dispatch, trainersCollectionPath, customPokemon, customMoves]);

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
                box: [],
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
    const movePokemonToBox = async (pokemonToMove) => {
        if (!selectedTrainer) return;

        const newRoster = selectedTrainer.roster.filter(p => p.id !== pokemonToMove.id);
        const newBox = [...(selectedTrainer.box || []), pokemonToMove];

        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        try {
            await updateDoc(trainerDocRef, { roster: newRoster, box: newBox });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to move Pokémon to Box: ${error.message}` });
        }
    };

    const movePokemonToRoster = async (pokemonToMove) => {
        if (!selectedTrainer) return;

        if (selectedTrainer.roster.length >= MAX_PARTY_SIZE) {
            dispatch({ type: 'SET_ERROR', payload: `Roster is full (max ${MAX_PARTY_SIZE} Pokémon).` });
            return;
        }

        const newBox = selectedTrainer.box.filter(p => p.id !== pokemonToMove.id);
        const newRoster = [...(selectedTrainer.roster || []), pokemonToMove];

        const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
        try {
            await updateDoc(trainerDocRef, { roster: newRoster, box: newBox });
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to move Pokémon to Roster: ${error.message}` });
        }
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
    const checkCanFuse = () => {
        if (!selectedTrainer) return false;
        const roster = selectedTrainer.roster || [];
        const bag = selectedTrainer.bag || {};

        for (const baseName in FUSION_RECIPES) {
            const recipe = FUSION_RECIPES[baseName];
            const hasBase = roster.some(p => p.speciesName === baseName);
            const hasPartner = roster.some(p => Object.keys(recipe.partners).includes(p.speciesName));
            // Normalize both item names for a robust, case-insensitive check.
            const normalizedRecipeItem = recipe.item.toLowerCase().replace(/\s/g, '-');
            const hasItem = Object.values(bag).some(item => item.name.toLowerCase().replace(/\s/g, '-') === normalizedRecipeItem);

            if (hasBase && hasPartner && hasItem) {
                return true; // Found a valid fusion combination
            }
        }
        return false;
    };

    const checkCanTransform = () => {
        if (!selectedTrainer) return false;
        const roster = selectedTrainer.roster || [];
        if (roster.length === 0) return false;

        const bagItems = Object.values(selectedTrainer.bag || {});
        if (bagItems.length === 0) {
            return false;
        }

        // Create a Set of the exact item names the trainer has for efficient lookup.
        const trainerItemNames = new Set(bagItems.map(item => item.name.toLowerCase()));

        // Iterate through each transformation recipe.
        for (const recipeItemName in KEY_ITEM_RECIPES) {
            // 1. Check if the trainer has the required item by its exact name.
            if (trainerItemNames.has(recipeItemName.toLowerCase())) {
                // 2. If yes, check if they have a Pokémon that can use it.
                const recipe = KEY_ITEM_RECIPES[recipeItemName];
                const possibleTargets = Object.keys(recipe);
                const hasTargetPokemon = roster.some(p => p.speciesIdentifier && possibleTargets.includes(p.speciesIdentifier));
                if (hasTargetPokemon) {
                    return true; // Found a valid transformation!
                }
            }
        }
        return false;
    };

    const canFuse = checkCanFuse();
    const canTransform = checkCanTransform();

    const handleFusePokemon = async (baseId, partnerId, fusedFormName, requiredItem) => {
        dispatch({ type: 'SET_LOADING', payload: 'Fusing Pokémon...' });
        try {
            // 1. Fetch data for the new fused Pokémon
            const fusedPokemonData = await fetchPokemonData(fusedFormName);
            fusedPokemonData.isFused = true;
            fusedPokemonData.fusionComponents = [baseId, partnerId];

            // 2. Remove the two base Pokémon from the roster
            const newRoster = selectedTrainer.roster.filter(p => p.id !== baseId && p.id !== partnerId);
            newRoster.push(fusedPokemonData);

            // 3. THIS BLOCK IS NOW REMOVED TO PREVENT ITEM CONSUMPTION
            /*
            const newBag = { ...selectedTrainer.bag };
            const itemKey = requiredItem.replace(/\s/g, '-').toLowerCase();
            if (newBag[itemKey] && newBag[itemKey].quantity > 1) {
                newBag[itemKey].quantity -= 1;
            } else {
                delete newBag[itemKey];
            }
            */

            // 4. Update the trainer document in Firestore (without changing the bag)
            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
            await updateDoc(trainerDocRef, { roster: newRoster }); // The 'bag: newBag' part is removed

        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Fusion failed: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };
    const handleKeyItemTransform = async (pokemonId, newFormName) => {
        dispatch({ type: 'SET_LOADING', payload: 'Transforming Pokémon...' });
        try {
            // 1. Find the original Pokémon to preserve its unique data.
            const originalPokemon = selectedTrainer.roster.find(p => p.id === pokemonId);
            if (!originalPokemon) throw new Error("Original Pokémon not found for transformation.");

            // 2. Fetch the base data for the new form.
            const newFormData = await fetchPokemonData(newFormName);

            // 3. Recalculate max HP for the new form, preserving level, IVs, and EVs.
            const newMaxHp = calculateStat(
                newFormData.baseStats.hp,
                originalPokemon.level,
                true,
                originalPokemon.ivs.hp,
                originalPokemon.evs.hp
            );

            // 4. Create the new Pokémon object by merging the original with the new form's data.
            const transformedPokemon = {
                ...originalPokemon, // Preserves ID, name, level, moves, status, item, etc.

                // Overwrite form-specific data
                speciesName: newFormData.speciesName,
                speciesIdentifier: newFormData.speciesIdentifier,
                baseStats: newFormData.baseStats,
                types: newFormData.types,
                abilities: newFormData.abilities,
                forms: newFormData.forms,
                sprite: getSprite({ ...newFormData, isShiny: originalPokemon.isShiny }),

                // Update stats
                maxHp: newMaxHp,
                // Adjust current HP if it exceeds the new maximum
                currentHp: Math.min(originalPokemon.currentHp, newMaxHp),
            };

            // 5. Replace the old Pokémon with the new one in the roster.
            const newRoster = selectedTrainer.roster.map(p => p.id === pokemonId ? transformedPokemon : p);

            const trainerDocRef = doc(db, trainersCollectionPath, selectedTrainer.id);
            await updateDoc(trainerDocRef, { roster: newRoster });

        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Transformation failed: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
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
            {isFusionModalOpen && <FusionModal trainer={selectedTrainer} onFuse={handleFusePokemon} onClose={() => setIsFusionModalOpen(false)} />}
            {isTransformModalOpen && <KeyItemTransformModal trainer={selectedTrainer} onTransform={handleKeyItemTransform} onClose={() => setIsTransformModalOpen(false)} />}
            {editingPokemon && (
                <PokemonEditorModal
                    pokemon={editingPokemon.pokemon}
                    pokemonLocation={editingPokemon.location}
                    onMoveToBox={movePokemonToBox}
                    onMoveToRoster={movePokemonToRoster}
                    onSave={(p) => handleSavePokemonEdit(p, editingPokemon.isFinal)}
                    onClose={() => setEditingPokemon(null)}
                    dispatch={dispatch}
                    itemList={combinedItemList}
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
                                    <h3 className="text-xl font-semibold mb-3 text-indigo-300 border-b border-gray-700 pb-2">{title}</h3>
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
                                            <div className="flex gap-2">
                                                {/* --- CONDITIONALLY RENDERED BUTTONS --- */}
                                                {canTransform && (
                                                    <button onClick={() => setIsTransformModalOpen(true)} className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded-md text-sm">
                                                        Transform
                                                    </button>
                                                )}
                                                {canFuse && (
                                                    <button onClick={() => setIsFusionModalOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded-md text-sm">
                                                        Fuse
                                                    </button>
                                                )}
                                                <button onClick={handleFullRestore} className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md text-sm">
                                                    Restore All
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex border-b border-gray-600 mb-4">
                                            <button onClick={() => setRosterView('ROSTER')} className={`px-3 py-1 font-semibold ${rosterView === 'ROSTER' ? 'border-b-2 border-indigo-400 text-white' : 'text-gray-400'}`}>Roster</button>
                                            <button onClick={() => setRosterView('BOX')} className={`px-3 py-1 font-semibold ${rosterView === 'BOX' ? 'border-b-2 border-indigo-400 text-white' : 'text-gray-400'}`}>Box</button>
                                            {selectedTrainer.category === 'partyMembers' && <button onClick={() => setRosterView('BAG')} className={`px-3 py-1 font-semibold ${rosterView === 'BAG' ? 'border-b-2 border-indigo-400 text-white' : 'text-gray-400'}`}>Bag</button>}
                                        </div>
                                        {rosterView === 'ROSTER' ? (
                                            <div>
                                                <div className="mb-4">
                                                    <label className="block text-sm font-medium text-gray-400 mb-1">Category</label>
                                                    <select value={selectedTrainer.category} onChange={(e) => handleCategoryChange(selectedTrainer.id, e.target.value)} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600">{Object.entries(trainerCategories).map(([key, title]) => (<option key={key} value={key}>{title}</option>))}</select>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 min-h-[16rem] max-h-96 overflow-y-auto pr-1">
                                                    {selectedTrainer.roster?.map((pokemon) => (
                                                        <div key={pokemon.id} onClick={() => setEditingPokemon({ pokemon, location: 'ROSTER' })} className={`relative group text-center p-2 bg-gray-700 rounded-md cursor-pointer hover:bg-gray-600 flex flex-col justify-between transition-all duration-200 ${pokemon.fainted ? 'opacity-50' : ''}`}>
                                                            {pokemon.fainted && (<div className="absolute inset-0 flex items-center justify-center z-20"><span className="text-red-500 font-bold text-lg transform -rotate-12 bg-black/50 px-2 py-1 rounded">FAINTED</span></div>)}
                                                            <div className="flex items-start justify-between">
                                                                <PokeballIcon pokemon={pokemon} />
                                                                <StatusIcon status={pokemon.status} volatileStatuses={pokemon.volatileStatuses} />
                                                            </div>
                                                            <HeldItemIcon item={pokemon.heldItem} />
                                                            <div>
                                                                <img src={getSprite(pokemon)} alt={pokemon.name} className="mx-auto h-16 w-16" />
                                                                <p className="text-sm font-semibold truncate mt-1">{pokemon.name}</p>
                                                                <p className="text-xs font-mono text-yellow-300">HP: {pokemon.currentHp} / {pokemon.maxHp}</p>
                                                            </div>
                                                            <div className="flex flex-wrap justify-center gap-1 mt-1">{pokemon.types?.map(type => <span key={type} className={`px-1.5 py-0.5 text-xs rounded-full uppercase font-bold ${TYPE_COLORS[type]}`}>{type}</span>)}</div>
                                                            <div className="text-left text-xs mt-2 space-y-1">
                                                                {(pokemon.moves || []).map(move => (
                                                                    <div key={move.name} className="flex justify-between items-center"><span className="truncate" title={move.name}>{move.name}</span><span className="font-mono text-gray-400">{move.pp}/{move.maxPp}</span></div>
                                                                ))}
                                                            </div>
                                                            <div className="absolute bottom-1 right-1 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                                                                <button title="Move to Box" onClick={(e) => { e.stopPropagation(); movePokemonToBox(pokemon) }} className="bg-purple-600 text-white rounded-full h-6 w-6 flex items-center justify-center shadow-md hover:bg-purple-500 transition-colors">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v13A1.5 1.5 0 0 0 3.5 18h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-13ZM12.5 6a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3a.5.5 0 0 1 .5-.5Z" /></svg>
                                                                </button>
                                                                <button title="Use Item" onClick={(e) => { e.stopPropagation(); setHealingPokemon(pokemon) }} className="bg-blue-600 text-white rounded-full h-6 w-6 flex items-center justify-center shadow-md hover:bg-blue-500 transition-colors">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" /></svg>
                                                                </button>
                                                                <button title="Full Heal" onClick={(e) => { e.stopPropagation(); handleFullHeal(pokemon) }} className="bg-green-600 text-white rounded-full h-6 w-6 flex items-center justify-center shadow-md hover:bg-green-500 transition-colors text-lg font-bold leading-none pb-0.5">+</button>
                                                                <button title="Remove Pokémon" onClick={(e) => { e.stopPropagation(); handleRemovePokemon(pokemon.id) }} className="bg-red-600 text-white rounded-full h-6 w-6 flex items-center justify-center shadow-md hover:bg-red-500 transition-colors text-xl font-bold leading-none pb-0.5">-</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <form onSubmit={(e) => { e.preventDefault(); handleAddPokemon(pokemonToAdd); }} className="flex space-x-2">
                                                    <AutocompleteInput value={pokemonToAdd} onChange={setPokemonToAdd} onSelect={handleAddPokemon} placeholder="Add to Party" sourceList={combinedPokemonList} />
                                                    <button type="submit" disabled={!pokemonToAdd || (selectedTrainer.roster?.length ?? 0) >= MAX_PARTY_SIZE} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed">Add</button>
                                                </form>
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
                                                <h3 className="text-lg font-semibold text-gray-300 mb-2">Pokémon in Box ({selectedTrainer.box?.length || 0})</h3>
                                                <div className="flex flex-wrap content-start mb-4 min-h-[16rem] max-h-96 overflow-y-auto pr-1">
                                                    {selectedTrainer.box?.map((pokemon) => (
                                                        <div key={pokemon.id} onClick={() => setEditingPokemon({ pokemon, location: 'BOX' })} className="m-1 relative group flex items-center justify-center bg-gray-700/50 rounded-md w-16 h-16 cursor-pointer hover:bg-gray-600/50 transition-colors">
                                                            <img src={getSprite(pokemon)} alt={pokemon.name} className="h-12 w-12" />
                                                            {/* The button to open the full editor is now a small gear icon */}
                                                            <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : ( // <-- This is the final 'else' for the Bag view
                                            <InventoryView trainer={selectedTrainer} itemList={combinedItemList} onBagUpdate={handleBagUpdate} dispatch={dispatch} />
                                        )}
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
            {mainView === 'CUSTOM_CONTENT' && <CustomContentManager />}
            {mainView === 'SCENARIOS' && <div className="text-center p-8 bg-gray-800 rounded-lg"><h2 className="text-3xl font-bold text-indigo-400">Scenarios</h2><p className="mt-2 text-gray-400">This feature is coming soon!</p></div>}
        </div>
    );
}

export default TrainerManager;