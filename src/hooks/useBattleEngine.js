import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { executeTurn } from './battle-engine/turnExecution';
import { handleSwitchIn as executeSwitchIn, handlePhaseManagement } from './battle-engine/phaseManager';
import { saveFinalPokemonState } from './battle-engine/phaseManager';
import { calculateDamage } from './battle-engine/damageCalculator';
import { calculateHitChance, calculateCritStage } from '../utils/api';
import { CRIT_CHANCE_PERCENTAGES, HIGH_CRIT_RATE_MOVES, UNMISSABLE_MOVES, TWO_TURN_MOVES } from '../config/gameData';
import { getEffectiveAbility, calculateTurnOrderSpeed } from './battle-engine/battleUtils';
import { runOnSwitchIn } from './battle-engine/fieldManager';
import { resolveFormChange } from './battle-engine/stateModifiers';
import { runPreMoveChecks } from './battle-engine/preMoveChecks'; // We'll create this helper
import { getContactAbilities, getEffectChances } from './battle-engine/chanceGatherers'; // And these
import { getEndOfTurnChances } from './battle-engine/chanceGatherers';
import { itemEffects } from './battle-engine/itemEffects';
import { calculateTurnPreview } from './battle-engine/turnPreviewCalculator';

const removeUndefinedValues = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(removeUndefinedValues).filter(v => v !== undefined);
    }
    const newObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            if (value !== undefined) {
                const sanitizedValue = removeUndefinedValues(value);
                if (sanitizedValue !== undefined) {
                    newObj[key] = sanitizedValue;
                }
            }
        }
    }
    return newObj;
};

export const useBattleEngine = (
    battleState, battleId, allTrainers, queuedActions, setQueuedActions, setTurnOrder,
    setIsResolutionModalOpen, setResolutionData
) => {
    const [isProcessingTurn, setIsProcessingTurn] = useState(false);
    const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);

    const handleStartOfBattle = async () => {
        console.log("--- handleStartOfBattle TRIGGERED ---");
        let stateCopy = JSON.parse(JSON.stringify(battleState));
        if (stateCopy.startOfBattleAbilitiesResolved) {
            console.log("Start of battle abilities have already been resolved. Skipping.");
            return;
        }

        let newLog = [...stateCopy.log];
        const startingPokemon = [];
        stateCopy.teams.forEach(team => {
            const activeIndices = stateCopy.activePokemonIndices[team.id] || [];
            activeIndices.forEach(index => {
                if (team.pokemon[index]) {
                    startingPokemon.push(team.pokemon[index]);
                }
            });
        });

        startingPokemon.sort((a, b) => calculateTurnOrderSpeed(b, stateCopy) - calculateTurnOrderSpeed(a, stateCopy));

        for (const pokemon of startingPokemon) {
            stateCopy.formChangeQueue = [];
            runOnSwitchIn([pokemon], stateCopy, newLog);
            pokemon.switchInEffectsResolved = true;

            if (stateCopy.formChangeQueue.length > 0) {
                const change = stateCopy.formChangeQueue[0];
                const pokemonInState = stateCopy.teams.flatMap(t => t.pokemon).find(p => p.id === change.pokemon.id);
                if (pokemonInState && change.type === 'RESOLVE') {
                    resolveFormChange(pokemonInState, change.form, newLog);
                    runOnSwitchIn([pokemonInState], stateCopy, newLog);
                }
            }
        }

        stateCopy.startOfBattleAbilitiesResolved = true;
        stateCopy.phase = 'ACTION_SELECTION';
        await updateDoc(battleDocRef, { ...stateCopy, log: newLog });
    };

    const handlePrepareTurn = async () => {
        // --- MODIFIED: The function is now much simpler ---
        
        // 1. Calculate the initial state of the turn with no overrides
        const { sortedActions, preCalculatedData } = calculateTurnPreview(battleState, queuedActions, {});

        // 2. Check if we can bypass the modal
        if (preCalculatedData.moveActions.length === 0 && preCalculatedData.chanceEvents.length === 0) {
            console.log("No choices to make. Bypassing resolution modal.");
            await handleConfirmAndExecuteTurn({});
            return;
        }

        // 3. Set the initial data and open the modal
        setTurnOrder(sortedActions);
        setResolutionData(preCalculatedData);
        setIsResolutionModalOpen(true);
    };

    const handleConfirmAndExecuteTurn = async (dmOverrides) => {
        setIsProcessingTurn(true);

        let stateWithOverrides = JSON.parse(JSON.stringify(battleState));
        stateWithOverrides.dm = dmOverrides;

        const { finalBattleState, finalLog } = await executeTurn(
            stateWithOverrides,
            queuedActions,
            allTrainers
        );

        if (finalBattleState) {
            const managedState = await handlePhaseManagement(finalBattleState, allTrainers, finalLog);
            const dataToSave = removeUndefinedValues({ ...managedState, log: finalLog });
            await updateDoc(battleDocRef, dataToSave);

            if (managedState.gameOver) {
                await saveFinalPokemonState(managedState, allTrainers);
            }
        } else {
            console.error("The turn execution resulted in an undefined state.");
        }

        setQueuedActions({});
        setIsProcessingTurn(false);
    };

    const handleSwitchIn = async (teamIndex, slotIndex, newPokemonId) => {
        setIsProcessingTurn(true);
        await executeSwitchIn(battleState, allTrainers, teamIndex, slotIndex, newPokemonId, battleState.log, battleDocRef);
        setIsProcessingTurn(false);
    };

    return { isProcessingTurn, handlePrepareTurn, handleConfirmAndExecuteTurn, handleSwitchIn, handleStartOfBattle };
};