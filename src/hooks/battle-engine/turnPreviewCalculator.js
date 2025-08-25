// src/hooks/battle-engine/turnPreviewCalculator.js
import { calculateDamage } from './damageCalculator';
import { calculateHitChance, calculateCritStage } from '../../utils/api';
import { CRIT_CHANCE_PERCENTAGES, HIGH_CRIT_RATE_MOVES, UNMISSABLE_MOVES, API_AILMENT_TO_STATUS_MAP, NON_VOLATILE_STATUSES, VOLATILE_STATUSES } from '../../config/gameData';
import { getEffectiveAbility, calculateTurnOrderSpeed, checkMoveBlockingAbilities } from './battleUtils';
import { runPreMoveChecks } from './preMoveChecks';
import { getContactAbilities, getEffectChances, getEndOfTurnChances, getTurnOrderChances } from './chanceGatherers';
import { abilityEffects } from './abilityEffects';

export const calculateTurnPreview = (baseBattleState, queuedActions, dmOverrides = {}) => {
    // --- 1. INITIALIZATION ---
    const simulatedState = JSON.parse(JSON.stringify(baseBattleState));
    simulatedState.dm = dmOverrides;
    const chanceEvents = [];
    const previewActions = [];
    const allActingPokemon = baseBattleState.teams.flatMap(t => t.pokemon.filter(p => queuedActions[p.id]));
    allActingPokemon.forEach(p => getTurnOrderChances(p, chanceEvents));

    // Initial turn order sort
    let turnOrder = Object.values(queuedActions).sort((a, b) => {
        let priorityA = (a.type === 'SWITCH' || a.type === 'ITEM') ? 10 : (a.move?.priority || 0);
        let priorityB = (b.type === 'SWITCH' || b.type === 'ITEM') ? 10 : (b.move?.priority || 0);
        if (dmOverrides[`willActivateQuickClaw_${a.pokemon.id}`]) priorityA += 100;
        if (dmOverrides[`willActivateQuickClaw_${b.pokemon.id}`]) priorityB += 100;
        if (priorityA !== priorityB) return priorityB - priorityA;
        const speedA = calculateTurnOrderSpeed(a.pokemon, baseBattleState);
        const speedB = calculateTurnOrderSpeed(b.pokemon, baseBattleState);
        return baseBattleState.field.trickRoomTurns > 0 ? speedA - speedB : speedB - speedA;
    });

    // --- 3. MAIN SIMULATION LOOP ---
    // We use a standard 'for' loop to allow for dynamic re-sorting of the 'turnOrder' array.
    for (let i = 0; i < turnOrder.length; i++) {
        const action = turnOrder[i];
        const actorInSim = simulatedState.teams.flatMap(t => t.pokemon).find(p => p.id === action.pokemon.id);
        if (!actorInSim || actorInSim.fainted) continue;
        runPreMoveChecks(actorInSim, simulatedState, chanceEvents);
        // A. SIMULATE PRE-MOVE IMMOBILIZATION
        if (dmOverrides[`isFullyParalyzed_${actorInSim.id}`] || dmOverrides[`isImmobilizedByLove_${actorInSim.id}`]) {
            previewActions.push({ ...action, targetResolutions: [], resolutionText: '(Immobilized!)' });
            continue;
        }
        if (actorInSim.status === 'Asleep' && !dmOverrides[`willWakeUp_${actorInSim.id}`]) {
            previewActions.push({ ...action, targetResolutions: [], resolutionText: '(Asleep!)' });
            continue;
        }
        if (actorInSim.status === 'Frozen' && !dmOverrides[`willThaw_${actorInSim.id}`]) {
            previewActions.push({ ...action, targetResolutions: [], resolutionText: '(Frozen!)' });
            continue;
        }
        if (actorInSim.volatileStatuses.some(s => (s.name || s) === 'Confused')) {
            if (dmOverrides[`willSnapOutOfConfusion_${actorInSim.id}`]) {
                actorInSim.volatileStatuses = actorInSim.volatileStatuses.filter(s => (s.name || s) !== 'Confused');
            } else if (dmOverrides[`willHurtSelfInConfusion_${actorInSim.id}`]) {
                const confusionMove = { power: 40, damage_class: { name: 'physical' }, type: 'internal' };
                const { damage } = calculateDamage(actorInSim, actorInSim, confusionMove, false, simulatedState, []);
                actorInSim.currentHp = Math.max(0, actorInSim.currentHp - damage);
                if (actorInSim.currentHp === 0) actorInSim.fainted = true;
                previewActions.push({ ...action, targetResolutions: [], resolutionText: `(Hit self for ${damage} damage!)` });
                continue;
            }
        }

        // B. SIMULATE ACTION-BLOCKING ABILITIES
        const protector = checkMoveBlockingAbilities(action, actorInSim, simulatedState);
        if (protector) {
            previewActions.push({ ...action, targetResolutions: [], resolutionText: `(Blocked by ${protector.name}!)` });
            continue;
        }

        // C. GATHER CHANCES & SIMULATE OUTCOME
        if (action.type === 'FIGHT') {
            const move = action.move;
            const actionPreview = { ...action, targetResolutions: [] };
            for (const hit of action.hits) {
                const targetInSim = simulatedState.teams.flatMap(t => t.pokemon).find(p => p.id === hit.targetId);
                if (!targetInSim || targetInSim.fainted) continue;

                const chancesForThisHit = [];
                const hitKey = `willHit_${move.id}_hit1_on_${targetInSim.id}`;
                if (!UNMISSABLE_MOVES.has(move.id) && move.accuracy !== null) {
                    chancesForThisHit.push({ key: hitKey, label: `Hit? (${calculateHitChance(actorInSim, targetInSim, move, simulatedState)}%)` });
                }
                const willHit = dmOverrides[hitKey] ?? true;
                if (willHit) {
                    const critStage = calculateCritStage(actorInSim, move, HIGH_CRIT_RATE_MOVES);
                    if (critStage < 3) {
                        chancesForThisHit.push({ key: `isCritical_${move.id}_hit1_on_${targetInSim.id}`, label: `Crit? (${CRIT_CHANCE_PERCENTAGES[critStage]})`, dependsOn: hitKey });
                    }
                    getEffectChances(actorInSim, targetInSim, move, chanceEvents, hitKey);
                    getContactAbilities(actorInSim, targetInSim, move, chanceEvents, hitKey);
                }
                const isCritical = dmOverrides[`isCritical_${move.id}_hit1_on_${targetInSim.id}`];
                const { damage: expectedDamage } = calculateDamage(actorInSim, targetInSim, move, isCritical, simulatedState, []);
                if (willHit) {
                    let finalExpectedDamage = expectedDamage;
                    const targetAbilityId = getEffectiveAbility(targetInSim, simulatedState)?.id;
                    const actorAbilityId = getEffectiveAbility(actorInSim, simulatedState)?.id;

                    // This dynamically calls the target's ability logic (for Anger Point, Shell, etc.)
                    if (abilityEffects[targetAbilityId]?.onTakeDamage) {
                        finalExpectedDamage = abilityEffects[targetAbilityId].onTakeDamage(
                            finalExpectedDamage,
                            targetInSim,
                            move,
                            simulatedState,
                            [], // Dummy log for the preview
                            actorAbilityId,
                            isCritical
                        );
                    }

                    // Apply the final, potentially ability-modified damage to the simulated target
                    targetInSim.currentHp = Math.max(0, targetInSim.currentHp - finalExpectedDamage);
                    targetInSim.currentHp = Math.max(0, targetInSim.currentHp - finalExpectedDamage);
                    if (targetInSim.currentHp === 0) targetInSim.fainted = true;

                    // --- MODIFICATION #2: Simulate the application of status effects ---
                    const effectKey = `willApplyEffect_${move.id}_on_${targetInSim.id}`;
                    if (dmOverrides[effectKey] && !targetInSim.fainted) {
                        const ailment = move.meta?.ailment?.name;
                        const statusToApply = API_AILMENT_TO_STATUS_MAP[ailment];

                        if (statusToApply) {
                            // Check if it's a primary status
                            if (NON_VOLATILE_STATUSES.includes(statusToApply) && targetInSim.status === 'None') {
                                const isImmune =
                                    (statusToApply === 'Paralyzed' && targetInSim.types.includes('electric')) ||
                                    (statusToApply === 'Burned' && targetInSim.types.includes('fire')) ||
                                    (statusToApply === 'Frozen' && targetInSim.types.includes('ice')) ||
                                    ((statusToApply === 'Poisoned' || statusToApply === 'Badly Poisoned') && (targetInSim.types.includes('poison') || targetInSim.types.includes('steel')));
                                if (!isImmune) {
                                    targetInSim.status = statusToApply;
                                }
                            }
                            // Check if it's a volatile status
                            else if (VOLATILE_STATUSES.includes(statusToApply) && !targetInSim.volatileStatuses.some(s => (s.name || s) === statusToApply)) {
                                targetInSim.volatileStatuses.push(statusToApply);
                            }
                        }
                    }
                    // --- END REPLACEMENT ---
                }

                actionPreview.targetResolutions.push({ target: targetInSim, expectedDamage, chances: chancesForThisHit });
            }
            previewActions.push(actionPreview);
        } else {
            previewActions.push(action);
        }

        // --- E. DYNAMICALLY RE-SORT TURN ORDER IF SPEEDS CHANGED ---
        const remainingActions = turnOrder.slice(i + 1);
        if (remainingActions.length > 0) {
            const reSortedRemaining = remainingActions.sort((a, b) => {
                let priorityA = (a.type === 'SWITCH' || a.type === 'ITEM') ? 10 : (a.move?.priority || 0);
                let priorityB = (b.type === 'SWITCH' || b.type === 'ITEM') ? 10 : (b.move?.priority || 0);
                if (priorityA !== priorityB) return priorityB - priorityA;

                // Get the updated Pokémon from the SIMULATED state for speed calculation
                const pokemonA_inSim = simulatedState.teams.flatMap(t => t.pokemon).find(p => p.id === a.pokemon.id);
                const pokemonB_inSim = simulatedState.teams.flatMap(t => t.pokemon).find(p => p.id === b.pokemon.id);

                const speedA = calculateTurnOrderSpeed(pokemonA_inSim, simulatedState);
                const speedB = calculateTurnOrderSpeed(pokemonB_inSim, simulatedState);
                return simulatedState.field.trickRoomTurns > 0 ? speedA - speedB : speedB - speedA;
            });
            // Re-combine the turn order array for the next iteration of the loop.
            turnOrder = [...turnOrder.slice(0, i + 1), ...reSortedRemaining];
        }
    }

    // --- 4. POST-TURN CHANCE GATHERING ---
    const allActivePokemonInSim = simulatedState.teams.flatMap(t => t.pokemon.filter((p, i) => simulatedState.activePokemonIndices[t.id]?.includes(i) && p && !p.fainted));
    allActivePokemonInSim.forEach(p => getEndOfTurnChances(p, simulatedState, chanceEvents));

    return { previewActions, chanceEvents, turnOrder };
};