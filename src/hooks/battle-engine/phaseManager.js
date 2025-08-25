import { doc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { db, appId } from '../../config/firebase';
import { runOnSwitchIn } from './fieldManager';

export const saveFinalPokemonState = async (finalBattleState, allTrainers) => {
    const batch = writeBatch(db);
    const uniqueTrainerIds = [...new Set(finalBattleState.teams.flatMap(team => team.pokemon.map(p => p.originalTrainerId)))].filter(Boolean);
    if (uniqueTrainerIds.length === 0) return;
    try {
        const trainerPromises = uniqueTrainerIds.map(id => getDoc(doc(db, `artifacts/${appId}/public/data/trainers`, id)));
        const trainerDocSnaps = await Promise.all(trainerPromises);
        trainerDocSnaps.forEach(trainerDocSnap => {
            if (trainerDocSnap.exists()) {
                const currentTrainerData = trainerDocSnap.data();
                const trainerId = trainerDocSnap.id;
                let rosterWasUpdated = false;
                const newRoster = currentTrainerData.roster.map(rosterPoke => {
                    const battleVersion = finalBattleState.teams
                        .flatMap(team => team.pokemon)
                        .find(p => p.id === rosterPoke.id);
                    if (battleVersion) {
                        rosterWasUpdated = true;
                        return battleVersion;
                    }
                    return rosterPoke;
                });
                if (rosterWasUpdated) {
                    const trainerDocRef = doc(db, `artifacts/${appId}/public/data/trainers`, trainerId);
                    batch.update(trainerDocRef, { roster: newRoster });
                }
            }
        });
        await batch.commit();
    } catch (error) {
        console.error("--- State Save Process FAILED ---", error);
    }
};

export const findNextReplacement = (currentState) => {
    if (!currentState?.teams) {
        return null;
    }

    for (let teamIndex = 0; teamIndex < currentState.teams.length; teamIndex++) {
        const team = currentState.teams[teamIndex];
        const activeIndices = currentState.activePokemonIndices[team.id];

        if (!activeIndices) continue;

        for (let slotIndex = 0; slotIndex < activeIndices.length; slotIndex++) {
            const pokemonIndex = activeIndices[slotIndex];
            const faintedPokemon = team.pokemon[pokemonIndex];

            if (faintedPokemon && faintedPokemon.fainted) {
                // Check if there are valid replacements ON THIS TEAM
                const hasReplacements = team.pokemon.some((p, i) => 
                    p && !p.fainted && !activeIndices.includes(i)
                );

                if (hasReplacements) {
                    // This is the critical line. It must return all three properties.
                    return { 
                        teamIndex, 
                        slotIndex, 
                        originalTrainerId: faintedPokemon.originalTrainerId 
                    };
                }
            }
        }
    }

    return null;
};

export const handlePhaseManagement = async (currentBattleState, allTrainers, newLog) => {
    if (!currentBattleState) {
        console.error("handlePhaseManagement called with undefined state.");
        return currentBattleState; // Return early to prevent the crash
    }
    if (currentBattleState.voluntarySwitchQueue?.length > 0) {
        const switchInfo = currentBattleState.voluntarySwitchQueue.shift(); // Get the first request

        currentBattleState.phase = 'REPLACEMENT';
        currentBattleState.replacementInfo = { 
            teamIndex: switchInfo.teamIndex, 
            slotIndex: switchInfo.slotIndex,
            originalTrainerId: switchInfo.originalTrainerId // This line was missing.
        };

        // Return early to enter the replacement phase immediately.
        return currentBattleState;
    }
    const nextReplacement = findNextReplacement(currentBattleState);
    if (nextReplacement) {
        currentBattleState.phase = 'REPLACEMENT';
        currentBattleState.replacementInfo = nextReplacement;
    } else {
        const isPlayerTeamWiped = currentBattleState.teams[0].pokemon.every(p => p.fainted);
        const isOpponentTeamWiped = currentBattleState.teams[1].pokemon.every(p => p.fainted);
        if (isPlayerTeamWiped || isOpponentTeamWiped) {
            currentBattleState.phase = 'GAME_OVER';
            currentBattleState.gameOver = true;
            newLog.push({ type: 'text', text: 'The battle is over!' });
            await saveFinalPokemonState(currentBattleState, allTrainers);
        } else {
            currentBattleState.phase = 'ACTION_SELECTION';
            if (currentBattleState.turn) currentBattleState.turn += 1; else currentBattleState.turn = 1;
        }
    }
    return currentBattleState;
};

export const handleSwitchIn = async (battleState, allTrainers, teamIndex, slotIndex, newPokemonId, newLog, battleDocRef) => {
    let currentBattleState = JSON.parse(JSON.stringify(battleState));

    // --- REPLACE THE ORIGINAL teamKey LINE WITH THIS BLOCK ---
    // Get the team object using the provided teamIndex, then get its actual ID.
    const team = currentBattleState.teams[teamIndex];
    if (!team) {
        console.error("handleSwitchIn failed: Could not find team with index", teamIndex);
        return; // Prevent crash if team doesn't exist
    }
    const teamKey = team.id;
    // --- END REPLACEMENT ---
    
    // This line will now work correctly for both the player and the opponent.
    const pokemonToSwitchOut = currentBattleState.teams[teamIndex].pokemon[currentBattleState.activePokemonIndices[teamKey][slotIndex]];
    if (allTrainers && pokemonToSwitchOut) {
        const originalTrainer = allTrainers.find(t => t.id === pokemonToSwitchOut.originalTrainerId);

        // --- THIS IS THE FINAL FIX ---
        // Ensure the found trainer object actually has a roster before we try to use it.
        if (originalTrainer && originalTrainer.roster) {
            const originalPokemonData = originalTrainer.roster.find(p => p.id === pokemonToSwitchOut.id);
            // Reset the Pokémon's types to its original state.
            if (originalPokemonData) {
                pokemonToSwitchOut.types = [...originalPokemonData.types];
            }
        }
    }

    pokemonToSwitchOut.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
    pokemonToSwitchOut.volatileStatuses = [];
    pokemonToSwitchOut.lockedMove = null;
    newLog.push({ type: 'text', text: `${pokemonToSwitchOut.name}'s stats and volatile conditions were reset.` });
    const newPokemonGlobalIndex = currentBattleState.teams[teamIndex].pokemon.findIndex(p => p.id === newPokemonId);
    const newPokemon = currentBattleState.teams[teamIndex].pokemon[newPokemonGlobalIndex];
    newPokemon.justSwitchedIn = true;
    currentBattleState.activePokemonIndices[teamKey][slotIndex] = newPokemonGlobalIndex;
    currentBattleState.replacementInfo = null;
    newLog.push({ type: 'text', text: `${newPokemon.name} is sent out!` });
    // CORRECTED FUNCTION CALL
    runOnSwitchIn([newPokemon], currentBattleState, newLog);
    await handlePhaseManagement(currentBattleState, allTrainers, newLog);
    await updateDoc(battleDocRef, { ...currentBattleState, log: newLog });
};