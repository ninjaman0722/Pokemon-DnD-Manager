// src/hooks/useBattleEngine.js

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { executeTurn } from './battle-engine/turnExecution';
import { handleSwitchIn as executeSwitchIn, handlePhaseManagement } from './battle-engine/phaseManager';
import { saveFinalPokemonState } from './battle-engine/phaseManager';

export const useBattleEngine = (battleState, battleId, allTrainers, queuedActions, setQueuedActions, setTurnOrder) => {
    const [isProcessingTurn, setIsProcessingTurn] = useState(false);
    const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);

    const handleExecuteTurn = async () => {
        // 1. Set processing state immediately.
        setIsProcessingTurn(true);

        // 2. Calculate the turn order and set it in the state.
        // This logic is moved here from turnExecution.js
        const sortedActions = Object.values(queuedActions).sort((a, b) => {
            let priorityA = (a.type === 'SWITCH' || a.type === 'ITEM') ? 10 : (a.move?.priority || 0);
            let priorityB = (b.type === 'SWITCH' || b.type === 'ITEM') ? 10 : (b.move?.priority || 0);
            if (priorityA !== priorityB) return priorityB - priorityA;
            // Add full speed calculation logic here if needed for UI, or simplify
            const speedA = a.pokemon.stats?.speed || 0;
            const speedB = b.pokemon.stats?.speed || 0;
            return speedB - speedA;
        });
        setTurnOrder(sortedActions);

        // 3. Pass the current state to the calculator.
        // NOTE: We no longer pass state setters like setIsProcessingTurn.
        const { finalBattleState, finalLog } = await executeTurn(
            battleState,
            queuedActions,
            allTrainers
        );

        // 4. Handle the results.
        if (finalBattleState) {
            const managedState = await handlePhaseManagement(finalBattleState, allTrainers, finalLog);

            // Update the database with the final, correct state.
            await updateDoc(battleDocRef, { ...managedState, log: finalLog });

            // If the game is over, also save the final Pokémon states.
            if (managedState.gameOver) {
                await saveFinalPokemonState(managedState, allTrainers);
            }
        } else {
            console.error("The turn execution resulted in an undefined state.");
        }

        // 5. Clean up for the next turn.
        setQueuedActions({});
        setIsProcessingTurn(false); // Set processing to false at the very end.
    };

const handleSwitchIn = async (teamIndex, slotIndex, newPokemonId) => {
    setIsProcessingTurn(true);

    // The 'executeSwitchIn' function now handles its own state management and database updates.
    // We just need to call it and pass the required arguments.
    await executeSwitchIn(
        battleState,
        allTrainers,
        teamIndex,
        slotIndex,
        newPokemonId,
        battleState.log,
        battleDocRef
    );

    // The logic that was here is now redundant and has been removed.

    setIsProcessingTurn(false);
};

    return { isProcessingTurn, handleExecuteTurn, handleSwitchIn };
};