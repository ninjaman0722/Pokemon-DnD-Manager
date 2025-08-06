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
        // This correctly defines 'team' for the scope of this loop iteration.
        const team = currentState.teams[teamIndex];
        
        // Use the team's actual ID as the key, which is now consistent.
        const activeIndices = currentState.activePokemonIndices[team.id];

        // Add a safety check in case indices are missing.
        if (!activeIndices) continue;

        for (let slotIndex = 0; slotIndex < activeIndices.length; slotIndex++) {
            const pokemonIndex = activeIndices[slotIndex];
            // Check if the Pokémon in this active slot has fainted.
            if (team.pokemon[pokemonIndex] && team.pokemon[pokemonIndex].fainted) {
                // Check if there are any available Pokémon on the bench to switch to.
                const hasReplacements = team.pokemon.some((p, i) => p && !p.fainted && !activeIndices.includes(i));
                if (hasReplacements) {
                    // If a replacement is needed and available, return the details.
                    return { teamIndex, slotIndex };
                }
            }
        }
    }

    // If no replacements are needed, return null.
    return null;
};

export const handlePhaseManagement = async (currentBattleState, allTrainers, newLog) => {
    if (!currentBattleState) {
        console.error("handlePhaseManagement called with undefined state.");
        return currentBattleState; // Return early to prevent the crash
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
    const teamKey = teamIndex === 0 ? 'players' : 'opponent';
    const pokemonToSwitchOut = currentBattleState.teams[teamIndex].pokemon[currentBattleState.activePokemonIndices[teamKey][slotIndex]];
    const originalTrainer = allTrainers.find(t => t.id === pokemonToSwitchOut.originalTrainerId);
    if (originalTrainer) {
        const originalPokemonData = originalTrainer.roster.find(p => p.id === pokemonToSwitchOut.id);
        // Reset the Pokémon's types to its original state.
        if (originalPokemonData) {
            pokemonToSwitchOut.types = [...originalPokemonData.types];
        }
    }
    pokemonToSwitchOut.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
    pokemonToSwitchOut.volatileStatuses = [];
    pokemonToSwitchOut.lockedMove = null;
    newLog.push({ type: 'text', text: `${pokemonToSwitchOut.name}'s stats and volatile conditions were reset.` });
    const newPokemonGlobalIndex = currentBattleState.teams[teamIndex].pokemon.findIndex(p => p.id === newPokemonId);
    const newPokemon = currentBattleState.teams[teamIndex].pokemon[newPokemonGlobalIndex];
    currentBattleState.activePokemonIndices[teamKey][slotIndex] = newPokemonGlobalIndex;
    currentBattleState.replacementInfo = null;
    newLog.push({ type: 'text', text: `${newPokemon.name} is sent out!` });
    // CORRECTED FUNCTION CALL
    runOnSwitchIn([newPokemon], currentBattleState, newLog);
    await handlePhaseManagement(currentBattleState, allTrainers, newLog);
    await updateDoc(battleDocRef, { ...currentBattleState, log: newLog });
};