// src/hooks/useBattleEngine.js

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
    // Receive state setters from BattleScreen
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

        // 1. Get all Pokémon that start on the field.
        const startingPokemon = [];
        stateCopy.teams.forEach(team => {
            const activeIndices = stateCopy.activePokemonIndices[team.id] || [];
            activeIndices.forEach(index => {
                if (team.pokemon[index]) {
                    startingPokemon.push(team.pokemon[index]);
                }
            });
        });

        // 2. Sort the starting Pokémon by speed, fastest first. This is the crucial step.
        startingPokemon.sort((a, b) => calculateTurnOrderSpeed(b, stateCopy) - calculateTurnOrderSpeed(a, stateCopy));

        // 3. Process each Pokémon's full start-of-battle sequence in that speed order.
        for (const pokemon of startingPokemon) {
            stateCopy.formChangeQueue = []; // Reset the queue for each Pokémon

            // A. Run its initial switch-in effect.
            runOnSwitchIn([pokemon], stateCopy, newLog);
            pokemon.switchInEffectsResolved = true;

            // B. If the switch-in queued a form change (like Primal Reversion), resolve it immediately.
            if (stateCopy.formChangeQueue.length > 0) {
                const change = stateCopy.formChangeQueue[0];
                const pokemonInState = stateCopy.teams.flatMap(t => t.pokemon).find(p => p.id === change.pokemon.id);
                if (pokemonInState && change.type === 'RESOLVE') {
                    resolveFormChange(pokemonInState, change.form, newLog);

                    // C. Immediately run the switch-in effect for the NEW form.
                    runOnSwitchIn([pokemonInState], stateCopy, newLog);
                }
            }
        }

        stateCopy.startOfBattleAbilitiesResolved = true;
        stateCopy.phase = 'ACTION_SELECTION';
        await updateDoc(battleDocRef, { ...stateCopy, log: newLog });
    };

    const handlePrepareTurn = async () => {
        const allCurrentActions = { ...queuedActions };
        const allActivePokemon = battleState.teams.flatMap(t =>
            t.pokemon.filter((p, i) => battleState.activePokemonIndices[t.id]?.includes(i) && p && !p.fainted)
        );

        allActivePokemon.forEach(p => {
            if (p.chargingMove) {
                allCurrentActions[p.id] = {
                    type: 'FIGHT',
                    pokemon: p,
                    move: p.chargingMove,
                    targetIds: [p.chargingMove.originalTargetId],
                    hits: [{ targetId: p.chargingMove.originalTargetId }]
                };
            } else if (p.lockedMove) {
                // Action is part of a rampage like Outrage
                const move = p.moves.find(m => m.id === p.lockedMove.id);
                if (move) {
                    // Find a valid target (first opponent is a simple default)
                    const opponentTeam = battleState.teams.find(t => t.id !== p.teamId);
                    const validTarget = opponentTeam?.pokemon.find((op, i) => battleState.activePokemonIndices[opponentTeam.id]?.includes(i) && op && !op.fainted);
                    if (validTarget) {
                        allCurrentActions.push({ type: 'FIGHT', pokemon: p, move, targetIds: [validTarget.id], hits: [{ targetId: validTarget.id }] });
                    }
                }
            }
        });
        const sortedActions = Object.values(allCurrentActions).sort((a, b) => {
            let priorityA = (a.type === 'SWITCH' || a.type === 'ITEM') ? 10 : (a.move?.priority || 0);
            let priorityB = (b.type === 'SWITCH' || b.type === 'ITEM') ? 10 : (b.move?.priority || 0);

            if (priorityA !== priorityB) return priorityB - priorityA;

            const speedA = calculateTurnOrderSpeed(a.pokemon, battleState);
            const speedB = calculateTurnOrderSpeed(b.pokemon, battleState);

            if (battleState.field.trickRoomTurns > 0) {
                return speedA - speedB;
            }
            return speedB - speedA;
        });
        setTurnOrder(sortedActions);
        const hasFightActions = sortedActions.some(action => action.type === 'FIGHT');

        if (!hasFightActions) {
            console.log("No fight actions detected. Bypassing resolution modal and executing turn.");
            handleConfirmAndExecuteTurn({}); // Pass empty overrides
            return; // End the function here.
        }
        const redirectionMap = new Map();
        const preCalculatedData = [];

        for (const action of sortedActions) {
            if (action.type === 'SWITCH') {
                const actor = action.pokemon;
                const newPokemonId = action.newPokemonId;
                // Record that the old Pokémon is being replaced by the new one.
                redirectionMap.set(actor.id, newPokemonId);
                continue; // Skip adding switch actions to the modal.
            }
            if (action.type !== 'FIGHT') continue;

            const redirectedTargetIds = action.targetIds.map(id => redirectionMap.get(id) || id);
            const redirectedHits = action.hits.map(hit => ({
                ...hit,
                targetId: redirectionMap.get(hit.targetId) || hit.targetId
            }));

            const attacker = battleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.pokemon.id);
            const move = action.move;

            // This check correctly prevents the first turn of a charging move from appearing.
            const isTwoTurnMove = TWO_TURN_MOVES.has(move.id);
            const isCharging = !attacker.volatileStatuses.includes('Charging') && !move.powerHerbBoosted;
            const isSun = battleState.field.weather === 'sunshine' || battleState.field.weather === 'harsh-sunshine';
            const isInstantInSun = (move.id === 'solar-beam' || move.id === 'solar-blade') && isSun;
            if (isTwoTurnMove && isCharging && !isInstantInSun) {
                continue;
            }

            const targets = redirectedTargetIds.map(id => battleState.teams.flatMap(t => t.pokemon).find(p => p.id === id));

            const isMultiHit = action.hits.length > 1;
            const isAOE = targets.length > 1 && !isMultiHit;
            let resolutionType = 'SINGLE';
            if (isMultiHit) resolutionType = 'MULTI_HIT';
            else if (isAOE) resolutionType = 'AOE';
            const megaForm = attacker.forms?.find(form =>
                form.changeMethod === 'BATTLE' &&
                form.triggerItem &&
                attacker.heldItem?.id === form.triggerItem
            );
            const canMegaEvolve = !!megaForm && !attacker.transformed;

            const actionData = {
                id: action.pokemon.id,
                attacker,
                move,
                resolutionType,
                canMegaEvolve,
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

            // 2. USE THE SANITIZER HERE, before the updateDoc call.
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
    // Also, add the new function to the return object of the hook
    return { isProcessingTurn, handlePrepareTurn, handleConfirmAndExecuteTurn, handleSwitchIn, handleStartOfBattle };
};