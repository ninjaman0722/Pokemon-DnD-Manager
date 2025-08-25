// src/hooks/battle-engine/turnPreviewCalculator.js
import { calculateDamage } from './damageCalculator';
import { calculateHitChance, calculateCritStage } from '../../utils/api';
import { CRIT_CHANCE_PERCENTAGES, HIGH_CRIT_RATE_MOVES, UNMISSABLE_MOVES, API_AILMENT_TO_STATUS_MAP } from '../../config/gameData';
import { getEffectiveAbility, calculateTurnOrderSpeed, checkMoveBlockingAbilities } from './battleUtils';
import { runPreMoveChecks } from './preMoveChecks';
import { getContactAbilities, getEffectChances, getEndOfTurnChances, getTurnOrderChances } from './chanceGatherers';

export const calculateTurnPreview = (baseBattleState, queuedActions, dmOverrides = {}) => {
    const allCurrentActions = [];
    const allActivePokemon = baseBattleState.teams.flatMap(t =>
        t.pokemon.filter((p, i) => baseBattleState.activePokemonIndices[t.id]?.includes(i) && p && !p.fainted)
    );
    allActivePokemon.forEach(p => {
        if (queuedActions[p.id]) { allCurrentActions.push(queuedActions[p.id]); }
        else if (p.chargingMove) { allCurrentActions.push({ type: 'FIGHT', pokemon: p, move: p.chargingMove, targetIds: [p.chargingMove.originalTargetId], hits: [{ targetId: p.chargingMove.originalTargetId }] }); }
        else if (p.lockedMove) {
            const move = p.moves.find(m => m.id === p.lockedMove.id);
            if (move && move.pp > 0) {
                const opponentTeam = baseBattleState.teams.find(t => t.id !== p.teamId);
                const validTarget = opponentTeam?.pokemon.find((op, i) => baseBattleState.activePokemonIndices[opponentTeam.id]?.includes(i) && op && !op.fainted);
                if (validTarget) { allCurrentActions.push({ type: 'FIGHT', pokemon: p, move, targetIds: [validTarget.id], hits: [{ targetId: validTarget.id }] }); }
            }
        }
    });

    const chanceQueue = [];
    allActivePokemon.forEach(p => getTurnOrderChances(p, chanceQueue));

    const sortedActions = allCurrentActions.sort((a, b) => {
        let priorityA = (a.type === 'SWITCH' || a.type === 'ITEM') ? 10 : (a.move?.priority || 0);
        let priorityB = (b.type === 'SWITCH' || b.type === 'ITEM') ? 10 : (b.move?.priority || 0);
        if (priorityA !== priorityB) return priorityB - priorityA;
        const aClaw = dmOverrides[`willActivateQuickClaw_${a.pokemon.id}`];
        const bClaw = dmOverrides[`willActivateQuickClaw_${b.pokemon.id}`];
        if (aClaw && !bClaw) return -1;
        if (bClaw && !aClaw) return 1;
        const speedA = calculateTurnOrderSpeed(a.pokemon, baseBattleState);
        const speedB = calculateTurnOrderSpeed(b.pokemon, baseBattleState);
        return baseBattleState.field.trickRoomTurns > 0 ? speedA - speedB : speedB - speedA;
    });

    let stateCopy = JSON.parse(JSON.stringify(baseBattleState));
    stateCopy.dm = dmOverrides;
    const preCalculatedData = { moveActions: [], chanceEvents: chanceQueue };
    const allActivePokemonInCopy = stateCopy.teams.flatMap(t =>
        t.pokemon.filter((p, i) => stateCopy.activePokemonIndices[t.id]?.includes(i) && p && !p.fainted)
    );

    for (const action of sortedActions) {
        let actorInSim = allActivePokemonInCopy.find(p => p.id === action.pokemon.id);
        if (!actorInSim || actorInSim.fainted) continue;

        const canMove = !runPreMoveChecks(actorInSim, stateCopy, preCalculatedData.chanceEvents);

        if (action.type === 'FIGHT') {
            const move = action.move;
            const attacker = baseBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.pokemon.id);
            const actionData = { id: action.pokemon.id, attacker, move, resolutionType: 'SINGLE', targetResolutions: [] };
            const protector = checkMoveBlockingAbilities(action, actorInSim, stateCopy);
            const targetsInSim = action.targetIds.map(id => allActivePokemonInCopy.find(p => p.id === id)).filter(Boolean);
            targetsInSim.forEach(targetInSim => {
                const target = baseBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === targetInSim.id);
                let expectedDamage = 0;
                let resolutionText = '';
                const isCritical = !!dmOverrides[`isCritical_${move.id}_hit1_on_${targetInSim.id}`];
                if (protector) {
                    expectedDamage = 0;
                    resolutionText = `(Blocked by ${protector.name}!)`;
                } else {
                    const { damage } = calculateDamage(actorInSim, targetInSim, move, isCritical, stateCopy, []);
                    expectedDamage = damage;
                }
                const hitChance = calculateHitChance(attacker, target, move, baseBattleState);
                const showHitToggle = !UNMISSABLE_MOVES.has(move.id) && move.accuracy !== null;
                const hitKey = `willHit_${move.id}_hit1_on_${target.id}`;
                const willHit = dmOverrides[hitKey];

                let chances = [];
                if (canMove && showHitToggle) {
                    const isStatusMove = move.damage_class.name === 'status' && move.meta?.category?.name === 'ailment';
                    let hitLabel = `Hit? (${hitChance}%)`;
                    if (isStatusMove) {
                        const effectName = API_AILMENT_TO_STATUS_MAP[move.meta.ailment.name]?.toLowerCase() || 'effect';
                        hitLabel = `Apply ${effectName}? (${hitChance}%)`;
                    }
                    chances.push({ key: hitKey, label: hitLabel });

                    if (willHit) {
                        const critStage = calculateCritStage(attacker, move, HIGH_CRIT_RATE_MOVES);
                        const critChancePercent = CRIT_CHANCE_PERCENTAGES[critStage] || '0%';
                        if (critStage < 3 && !isStatusMove) {
                            chances.push({ key: `isCritical_${move.id}_hit1_on_${target.id}`, label: `Crit? (${critChancePercent})` });
                        }
                        getEffectChances(actorInSim, targetInSim, move, preCalculatedData.chanceEvents);
                        getContactAbilities(actorInSim, targetInSim, move, preCalculatedData.chanceEvents);
                    }
                }
                actionData.targetResolutions.push({ target, expectedDamage, chances });
            });
            preCalculatedData.moveActions.push(actionData);

            if (dmOverrides[`willHit_${move.id}_hit1_on_${targetsInSim[0]?.id}`]) {
                if (move.damage_class.name === 'status' && move.meta?.category?.name === 'ailment') {
                    const statusToApply = API_AILMENT_TO_STATUS_MAP[move.meta.ailment.name];
                    if (statusToApply && targetsInSim[0].status === 'None') { targetsInSim[0].status = statusToApply; }
                } else {
                    const effectKey = `willApplyEffect_${move.id}_on_${targetsInSim[0]?.id}`;
                    if (dmOverrides[effectKey]) {
                        const statusToApply = API_AILMENT_TO_STATUS_MAP[move.meta.ailment.name];
                        if (statusToApply && targetsInSim[0].status === 'None') { targetsInSim[0].status = statusToApply; }
                    }
                }
            }
        }
    }

    for (const pokemon of allActivePokemonInCopy) {
        getEndOfTurnChances(pokemon, stateCopy, preCalculatedData.chanceEvents);
    }

    return { sortedActions, preCalculatedData };
};