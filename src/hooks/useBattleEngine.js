// src/hooks/useBattleEngine.js

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { executeTurn } from './battle-engine/turnExecution';
import { handleSwitchIn as executeSwitchIn, handlePhaseManagement } from './battle-engine/phaseManager';
import { saveFinalPokemonState } from './battle-engine/phaseManager';
import { calculateDamage } from './battle-engine/damageCalculator';
import { calculateHitChance, calculateCritStage } from '../utils/api';
import { CRIT_CHANCE_PERCENTAGES, HIGH_CRIT_RATE_MOVES, UNMISSABLE_MOVES } from '../config/gameData';
import { getEffectiveAbility, calculateTurnOrderSpeed } from './battle-engine/battleUtils';

export const useBattleEngine = (
    battleState, battleId, allTrainers, queuedActions, setQueuedActions, setTurnOrder,
    // Receive state setters from BattleScreen
    setIsResolutionModalOpen, setResolutionData
) => {
    const [isProcessingTurn, setIsProcessingTurn] = useState(false);
    const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);
    const handlePrepareTurn = async () => {
        const sortedActions = Object.values(queuedActions).sort((a, b) => {
            let priorityA = (a.type === 'SWITCH' || a.type === 'ITEM') ? 10 : (a.move?.priority || 0);
            let priorityB = (b.type === 'SWITCH' || b.type === 'ITEM') ? 10 : (b.move?.priority || 0);

            // This can be expanded with Prankster, Quick Claw, etc. if you add those features
            if (priorityA !== priorityB) return priorityB - priorityA;

            // Use the new, comprehensive speed calculation function
            const speedA = calculateTurnOrderSpeed(a.pokemon, battleState);
            const speedB = calculateTurnOrderSpeed(b.pokemon, battleState);

            // Account for Trick Room
            if (battleState.field.trickRoomTurns > 0) {
                return speedA - speedB;
            }
            return speedB - speedA;
        });
        setTurnOrder(sortedActions);

        const preCalculatedData = [];
        for (const action of sortedActions) {
            if (action.type !== 'FIGHT') continue;

            const attacker = battleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.pokemon.id);
            const move = action.move;
            const targets = action.targetIds.map(id => battleState.teams.flatMap(t => t.pokemon).find(p => p.id === id));

            const isMultiHit = action.hits.length > 1;
            const isAOE = targets.length > 1 && !isMultiHit;
            let resolutionType = 'SINGLE';
            if (isMultiHit) resolutionType = 'MULTI_HIT';
            else if (isAOE) resolutionType = 'AOE';

            const actionData = {
                id: action.pokemon.id,
                attacker,
                move,
                resolutionType,
                hitResolutions: [],
                targetResolutions: [],
            };

            if (resolutionType === 'MULTI_HIT') {
                action.hits.forEach((hit, index) => {
                    const target = battleState.teams.flatMap(t => t.pokemon).find(p => p.id === hit.targetId);
                    if (!target) return;

                    const { damage: expectedDamage } = calculateDamage(attacker, target, move, false, battleState, []);
                    const hitChance = calculateHitChance(attacker, target, move, battleState);
                    const critStage = calculateCritStage(attacker, move, HIGH_CRIT_RATE_MOVES);
                    const critChancePercent = CRIT_CHANCE_PERCENTAGES[critStage] || '0%';

                    // --- NEW LOGIC TO DETERMINE IF HIT TOGGLE SHOULD BE SHOWN ---
                    const attackerAbilityId = getEffectiveAbility(attacker, battleState)?.id;
                    const defenderAbilityId = getEffectiveAbility(target, battleState)?.id;
                    const isGuaranteedByEffect = (attackerAbilityId === 'no-guard' || defenderAbilityId === 'no-guard');
                    const showHitToggle = !UNMISSABLE_MOVES.has(move.id);

                    actionData.hitResolutions.push({
                        hitNumber: index + 1,
                        target,
                        expectedDamage,
                        chances: [
                            // --- UPDATED: Uses the new showHitToggle condition ---
                            ...(showHitToggle ? [{ key: `willHit_${move.id}_hit${index + 1}_on_${target.id}`, label: `Hit? (${hitChance}%)` }] : []),
                            ...(critStage < 3 ? [{ key: `isCritical_${move.id}_hit${index + 1}_on_${target.id}`, label: `Crit? (${critChancePercent})` }] : [])
                        ]
                    });
                });
            } else { // For both SINGLE and AOE moves
                targets.forEach(target => {
                    const { damage: expectedDamage } = calculateDamage(attacker, target, move, false, battleState, []);
                    const hitChance = calculateHitChance(attacker, target, move, battleState);
                    const critStage = calculateCritStage(attacker, move, HIGH_CRIT_RATE_MOVES);
                    const critChancePercent = CRIT_CHANCE_PERCENTAGES[critStage] || '0%';

                    // --- NEW LOGIC TO DETERMINE IF HIT TOGGLE SHOULD BE SHOWN ---
                    const attackerAbilityId = getEffectiveAbility(attacker, battleState)?.id;
                    const defenderAbilityId = getEffectiveAbility(target, battleState)?.id; // Use target here
                    const isGuaranteedByEffect = (attackerAbilityId === 'no-guard' || defenderAbilityId === 'no-guard');
                    const showHitToggle = !UNMISSABLE_MOVES.has(move.id);

                    actionData.targetResolutions.push({
                        target,
                        expectedDamage,
                        chances: [
                            // --- UPDATED: Uses the new showHitToggle condition ---
                            ...(showHitToggle ? [{ key: `willHit_${move.id}_hit1_on_${target.id}`, label: `Hit? (${hitChance}%)` }] : []),
                            ...(critStage < 3 ? [{ key: `isCritical_${move.id}_hit1_on_${target.id}`, label: `Crit? (${critChancePercent})` }] : [])
                        ]
                    });
                });
            }
            preCalculatedData.push(actionData);
        }
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
            await updateDoc(battleDocRef, { ...managedState, log: finalLog });

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

    return { isProcessingTurn, handlePrepareTurn, handleConfirmAndExecuteTurn, handleSwitchIn };
};