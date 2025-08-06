import { resolveChance, getEffectiveAbility } from '../battleUtils';
import { calculateDamage } from '../damageCalculator';
import { calculateStatChange } from '../stateModifiers';
import {
    UNMISSABLE_MOVES, HIGH_CRIT_RATE_MOVES, CRIT_CHANCE_PERCENTAGES, SELF_STAT_LOWERING_MOVES,
    CONSECUTIVE_TURN_MOVES, RECOIL_MOVES, DRAIN_MOVES, CONTACT_MOVES, API_AILMENT_TO_STATUS_MAP,
    CURSE_MOVE, NIGHTMARE_MOVE, REFLECT_TYPE_MOVES, LIGHT_SCREEN_TYPE_MOVES, AURORA_VEIL_MOVE,
    MOVE_TO_TERRAIN_MAP, MOVE_TO_WEATHER_MAP, WEATHER_EXTENDING_ROCKS, ENCORE_MOVE, TAUNT_MOVE,
    INFATUATION_MOVE, ABILITY_SUPPRESSING_MOVES, ABILITY_REPLACEMENT_MOVES, TWO_TURN_MOVES,
    REFLECTABLE_MOVES, BINDING_MOVES, LEECH_SEED_MOVE, CONFUSION_INDUCING_MOVES, PROTECTIVE_MOVES,
    DELAYED_DAMAGE_MOVES, EXPLOSIVE_MOVES, HEALING_MOVES, DISABLE_INDUCING_MOVES, TORMENT_INDUCING_MOVES,
    HEAL_BLOCK_INDUCING_MOVES, AQUA_RING_MOVE, INGRAIN_MOVE
} from '../../../config/gameData';
import { abilityEffects } from '../abilityEffects';
import { itemEffects } from '../itemEffects';
import { calculateCritStage } from '../../../utils/api';
import { findRedirector } from './targetRedirector';

const checkMoveUsageRestrictions = (actor, move, battleState, newLog) => {
    // Check for PP
    if (move.pp <= 0) {
        newLog.push({ type: 'text', text: `But there was no PP left for the move!` });
        return true; // Move fails
    }

    // Check for Taunt
    if (actor.volatileStatuses.includes('Taunt') && move.damage_class.name === 'status') {
        newLog.push({ type: 'text', text: `${actor.name} can't use ${move.name} after being taunted!` });
        return true; // Move fails
    }
    if (actor.disabledMove === move.id) {
        newLog.push({ type: 'text', text: `${actor.name}'s ${move.name} is disabled!` });
        return true; // Move fails
    }

    // 3. Check for Taunt (no change)
    if (actor.volatileStatuses.includes('Taunt') && move.damage_class.name === 'status') { /* ... */ }

    // 4. Check for Torment (cannot use the same move twice in a row)
    if (actor.volatileStatuses.includes('Torment') && move.id === actor.lastMoveUsed) {
        newLog.push({ type: 'text', text: `${actor.name} can't use ${move.name} twice in a row due to Torment!` });
        return true; // Move fails
    }

    // 5. Check for Heal Block
    if (actor.volatileStatuses.includes('Heal Block') && HEALING_MOVES.has(move.id)) {
        newLog.push({ type: 'text', text: `${actor.name} can't use ${move.name} due to Heal Block!` });
        return true; // Move fails
    }

    // Check for Gravity (Prevents moves like Fly, Bounce, etc.)
    const gravityRestrictedMoves = ['fly', 'bounce', 'jump-kick', 'high-jump-kick'];
    if (battleState.field.gravityTurns > 0 && gravityRestrictedMoves.includes(move.id)) {
        newLog.push({ type: 'text', text: `${actor.name} can't use ${move.name} because of gravity!` });
        return true; // Move fails
    }

    if (EXPLOSIVE_MOVES.has(move.id)) {
        const isDampActive = battleState.teams.flat().some(team =>
            team.pokemon.some(p =>
                !p.fainted && getEffectiveAbility(p, battleState)?.id === 'damp'
            )
        );
        if (isDampActive) {
            newLog.push({ type: 'text', text: `A Pokémon's Damp ability prevented the use of ${move.name}!` });
            return true; // Move fails
        }
    }
    return false; // Move does not fail
};

const checkProtection = (target, move, allQueuedActions, newLog) => {
    const targetAction = allQueuedActions[target.id];
    if (targetAction && targetAction.type === 'FIGHT' && PROTECTIVE_MOVES.has(targetAction.move.id)) {
        newLog.push({ type: 'text', text: `${target.name} protected itself!` });
        return true;
    }
    return false;
};

// This is the main function for handling a single FIGHT action.
export const handleFightAction = (action, currentBattleState, allTrainers, redirectionMap, allQueuedActions, newLog, sortedActions) => {
    const actor = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.pokemon.id);
    let move = { ...actor.moves.find(m => m.id === action.move.id) };
    if (!move.id) return;

    // Apply any redirections from switches that happened earlier in the turn.
    action.targetIds = action.targetIds.map(id => redirectionMap.get(id) || id);
    action.hits = action.hits.map(hit => ({
        ...hit,
        targetId: redirectionMap.get(hit.targetId) || hit.targetId
    }));

    const actorAbilityId = getEffectiveAbility(actor, currentBattleState)?.id;
    if (abilityEffects[actorAbilityId]?.onBeforeMove) {
        abilityEffects[actorAbilityId].onBeforeMove(actor, move, currentBattleState, newLog);
    }
    const moveId = move.id;
    if (AQUA_RING_MOVE === moveId) {
        if (actor.volatileStatuses.includes('Aqua Ring')) {
            newLog.push({ type: 'text', text: 'But it failed!' });
        } else {
            actor.volatileStatuses.push('Aqua Ring');
            newLog.push({ type: 'text', text: `${actor.name} surrounded itself with a veil of water!` });
        }
        return; // End the action
    }

    if (INGRAIN_MOVE === moveId) {
        if (actor.volatileStatuses.includes('Ingrain')) {
            newLog.push({ type: 'text', text: 'But it failed!' });
        } else {
            actor.volatileStatuses.push('Ingrain');
            newLog.push({ type: 'text', text: `${actor.name} planted its roots!` });
        }
        return; // End the action
    }
    if (DISABLE_INDUCING_MOVES.has(moveId)) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target && target.lastMoveUsed && !target.disabledMove) {
            target.disabledMove = target.lastMoveUsed; // Store the ID of the move to be disabled
            target.disableTurns = 4; // Set a counter for the duration
            const disabledMoveName = target.moves.find(m => m.id === target.lastMoveUsed)?.name || 'the last move';
            newLog.push({ type: 'text', text: `${target.name}'s ${disabledMoveName} was disabled!` });
        } else {
            newLog.push({ type: 'text', text: 'But it failed!' });
        }
        return; // End the action
    }

    if (TORMENT_INDUCING_MOVES.has(moveId)) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target && !target.volatileStatuses.includes('Torment')) {
            target.volatileStatuses.push('Torment');
            newLog.push({ type: 'text', text: `${target.name} was subjected to torment!` });
        } else {
            newLog.push({ type: 'text', text: 'But it failed!' });
        }
        return; // End the action
    }

    if (HEAL_BLOCK_INDUCING_MOVES.has(moveId)) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target && !target.volatileStatuses.includes('Heal Block')) {
            target.volatileStatuses.push('Heal Block');
            target.healBlockTurns = 5;
            newLog.push({ type: 'text', text: `${target.name} was prevented from healing!` });
        } else {
            newLog.push({ type: 'text', text: 'But it failed!' });
        }
        return; // End the action
    }
    const actorTeam = currentBattleState.teams.find(t => t.pokemon.some(p => p.id === actor.id));
    const itemId = actor.heldItem?.id;
    if (DELAYED_DAMAGE_MOVES.has(move.id)) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target) {
            // Find the target's team and current active slot
            const targetTeamIndex = currentBattleState.teams.findIndex(t => t.pokemon.some(p => p.id === target.id));
            const targetTeam = currentBattleState.teams[targetTeamIndex];
            const targetSlotIndex = currentBattleState.activePokemonIndices[targetTeam.id].findIndex(i => targetTeam.pokemon[i]?.id === target.id);

            // Calculate the damage now, but store it for later
            const { damage } = calculateDamage(actor, target, move, false, currentBattleState, []); // Use a dummy log

            if (!currentBattleState.field.futureAttacks) {
                currentBattleState.field.futureAttacks = [];
            }
            currentBattleState.field.futureAttacks.push({
                sourceName: actor.name,
                damage: damage,
                targetTeamIndex: targetTeamIndex,
                targetSlotIndex: targetSlotIndex,
                turnsLeft: 2 // Hits at the end of the turn, two turns from now
            });
            newLog.push({ type: 'text', text: `${actor.name} foresaw an attack!` });
        }
        return; // End the action here
    }
    if (moveId === 'trick-room') {
        if (currentBattleState.field.trickRoomTurns > 0) {
            currentBattleState.field.trickRoomTurns = 0;
            newLog.push({ type: 'text', text: `${actor.name} returned the twisted dimensions to normal!` });
        } else {
            currentBattleState.field.trickRoomTurns = 5;
            newLog.push({ type: 'text', text: `${actor.name} twisted the dimensions!` });
        }
        return;
    }
    if (moveId === 'magic-room') {
        if (currentBattleState.field.magicRoomTurns > 0) {
            currentBattleState.field.magicRoomTurns = 0;
            newLog.push({ type: 'text', text: 'The strange room disappeared.' });
        } else {
            currentBattleState.field.magicRoomTurns = 5;
            newLog.push({ type: 'text', text: 'It created a strange room where items cant be used!' });
        }
        return;
    }
    if (moveId === 'gravity') {
        if (currentBattleState.field.gravityTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
        else { currentBattleState.field.gravityTurns = 5; newLog.push({ type: 'text', text: 'Gravity intensified!' }); }
        return;
    }
    if (moveId === 'wonder-room') {
        if (currentBattleState.field.wonderRoomTurns > 0) {
            currentBattleState.field.wonderRoomTurns = 0;
            newLog.push({ type: 'text', text: 'The weird dimensions disappeared.' });
        } else {
            currentBattleState.field.wonderRoomTurns = 5;
            newLog.push({ type: 'text', text: 'It created a weird room where Defense and Sp. Def stats are swapped!' });
        }
        return;
    }
    if (REFLECT_TYPE_MOVES.has(moveId)) {
        if (actorTeam.reflectTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
        else { actorTeam.reflectTurns = (itemId === 'light-clay') ? 8 : 5; newLog.push({ type: 'text', text: `A wall of light protected ${actorTeam.id}'s team!` }); }
        return;
    }
    if (LIGHT_SCREEN_TYPE_MOVES.has(moveId)) {
        if (actorTeam.lightScreenTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
        else { actorTeam.lightScreenTurns = (itemId === 'light-clay') ? 8 : 5; newLog.push({ type: 'text', text: `A wall of light protected ${actorTeam.id}'s team from special attacks!` }); }
        return;
    }
    if (AURORA_VEIL_MOVE.has(moveId)) {
        if (currentBattleState.field.weather !== 'snow') { newLog.push({ type: 'text', text: 'But it failed!' }); }
        else if (actorTeam.auroraVeilTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
        else { actorTeam.auroraVeilTurns = (itemId === 'light-clay') ? 8 : 5; newLog.push({ type: 'text', text: `A shimmering veil protected ${actorTeam.id}'s team!` }); }
        return;
    }
    const terrainToSet = MOVE_TO_TERRAIN_MAP.get(moveId);
    if (terrainToSet) {
        if (currentBattleState.field.terrain !== 'none') { newLog.push({ type: 'text', text: 'But it failed!' }); }
        else { currentBattleState.field.terrain = terrainToSet; currentBattleState.field.terrainTurns = (itemId === 'terrain-extender') ? 8 : 5; newLog.push({ type: 'text', text: `The battlefield became ${terrainToSet.replace('-', ' ')}!` }); }
        return;
    }
    const weatherToSet = MOVE_TO_WEATHER_MAP.get(moveId);
    if (weatherToSet) {
        const strongWeathers = ['heavy-rain', 'harsh-sunshine', 'strong-winds'];
        // --- THIS IS THE CRITICAL CHECK ---
        if (strongWeathers.includes(currentBattleState.field.weather)) {
            newLog.push({ type: 'text', text: 'The strong weather could not be changed!' });
        } else if (currentBattleState.field.weather === weatherToSet) {
            newLog.push({ type: 'text', text: 'But it failed!' });
        } else {
            const requiredRockId = WEATHER_EXTENDING_ROCKS[weatherToSet]?.replace(/\s/g, '-');
            const duration = (itemId === requiredRockId) ? 8 : 5;
            currentBattleState.field.weather = weatherToSet;
            currentBattleState.field.weatherTurns = duration;
            let weatherMessage = `It started to ${weatherToSet}!`;
            if (weatherToSet === 'sunshine') weatherMessage = 'The sunlight turned harsh!';
            newLog.push({ type: 'text', text: weatherMessage });
        }
        return;
    }
    if (move.damage_class.name === 'status' && move.stat_changes?.length > 0) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target && !target.fainted) {
            newLog.push({ type: 'text', text: `${actor.name} used ${move.name}!` });
            move.stat_changes.forEach(sc => {
                const { updatedTarget, newLog: statLog } = calculateStatChange(target, sc.stat.name, sc.change, currentBattleState);
                // Mutate the object in the state tree directly
                Object.assign(target, updatedTarget);
                newLog.push(...statLog);
            });
        } else {
            newLog.push({ type: 'text', text: 'But it failed!' });
        }
        return; // This move is done, so skip to the next action.
    }
    if (moveId === CURSE_MOVE) {
        if (actor.types.includes('ghost')) {
            const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
            if (target && !target.volatileStatuses.some(s => (s.name || s) === 'Cursed')) {
                const hpCost = Math.floor(actor.maxHp / 2);
                actor.currentHp = Math.max(0, actor.currentHp - hpCost);
                newLog.push({ type: 'text', text: `${actor.name} cut its own HP to lay a curse!` });
                target.volatileStatuses.push('Cursed');
                newLog.push({ type: 'text', text: `${target.name} was cursed!` });
                if (actor.currentHp === 0) { actor.fainted = true; newLog.push({ type: 'text', text: `${actor.name} fainted!` }); }
            } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
        }
    }
    if (moveId === CURSE_MOVE && !actor.types.includes('ghost')) {
        newLog.push({ type: 'text', text: `${actor.name} used Curse!` });
        const changes = [{ stat: 'speed', change: -1 }, { stat: 'attack', change: 1 }, { stat: 'defense', change: 1 }];
        changes.forEach(({ stat, change }) => {
            const { updatedTarget, newLog: statLog } = calculateStatChange(actor, stat, change, currentBattleState);
            Object.assign(actor, updatedTarget);
            newLog.push(...statLog);
        });
        return;
    }
    if (moveId === NIGHTMARE_MOVE) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target && target.status === 'Asleep' && !target.volatileStatuses.some(s => (s.name || s) === 'Nightmare')) {
            target.volatileStatuses.push('Nightmare');
            newLog.push({ type: 'text', text: `${target.name} began having a nightmare!` });
        } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
        return;
    }
    if (moveId === ENCORE_MOVE) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target && target.lastMoveUsed && !target.volatileStatuses.some(s => (s.name || s) === 'Encore')) {
            target.volatileStatuses.push('Encore');
            target.encoredMove = target.lastMoveUsed;
            target.encoreTurns = 3;
            newLog.push({ type: 'text', text: `${target.name} received an encore!` });
        } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
        return;
    }
    if (moveId === TAUNT_MOVE) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target && !target.volatileStatuses.some(s => (s.name || s) === 'Taunt')) {
            target.volatileStatuses.push('Taunt');
            target.tauntTurns = 3;
            newLog.push({ type: 'text', text: `${target.name} was taunted!` });
        } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
        return;
    }
    if (moveId === INFATUATION_MOVE) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target && actor.gender !== 'Genderless' && target.gender !== 'Genderless' && actor.gender !== target.gender && !target.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
            target.volatileStatuses.push('Infatuated');
            target.infatuatedWith = actor.id;
            newLog.push({ type: 'text', text: `${target.name} fell in love with ${actor.name}!` });

            // --- NEW DESTINY KNOT LOGIC ---
            if (target.heldItem?.id === 'destiny-knot') {
                // Check if the original attacker can also be infatuated
                if (!actor.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
                    actor.volatileStatuses.push('Infatuated');
                    actor.infatuatedWith = target.id; // Infatuated with the Destiny Knot holder
                    newLog.push({ type: 'text', text: `${actor.name} fell in love with ${target.name} due to the Destiny Knot!` });
                }
            }
            // --- END NEW LOGIC ---

        } else {
            newLog.push({ type: 'text', text: 'But it failed!' });
        }
        return;
    }
    if (ABILITY_SUPPRESSING_MOVES.has(moveId)) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target) {
            if (target.heldItem?.id === 'ability-shield') {
                newLog.push({ type: 'text', text: `${target.name}'s Ability Shield protected it!` });
            } else if (['multitype', 'stance-change', 'schooling'].includes(getEffectiveAbility(target)?.id)) {
                newLog.push({ type: 'text', text: 'But it failed!' });
            } else {
                target.volatileStatuses.push('Ability Suppressed');
                newLog.push({ type: 'text', text: `${target.name}'s ability was suppressed!` });
            }
        }
        return;
    }
    const replacementAbilityInfo = ABILITY_REPLACEMENT_MOVES.get(moveId);
    if (replacementAbilityInfo) {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
        if (target) {
            if (target.heldItem?.id === 'ability-shield') {
                newLog.push({ type: 'text', text: `${target.name}'s Ability Shield protected it!` });
            } else if (['multitype', 'stance-change', 'schooling', 'trace'].includes(getEffectiveAbility(target)?.id)) {
                newLog.push({ type: 'text', text: 'But it failed!' });
            } else {
                if (!target.originalAbility) {
                    target.originalAbility = target.ability;
                }
                // The map provides the ID, we create the full ability object
                target.ability = {
                    id: replacementAbilityInfo,
                    name: replacementAbilityInfo.charAt(0).toUpperCase() + replacementAbilityInfo.slice(1)
                };
                newLog.push({ type: 'text', text: `${target.name}'s ability was changed to ${target.ability.name}!` });
            }
        }
        return;
    }

    if (TWO_TURN_MOVES.has(moveId)) {
        if (actor.volatileStatuses.includes('Charging')) {
            actor.volatileStatuses = actor.volatileStatuses.filter(s => s !== 'Charging');
            actor.chargingMove = null;
        } else if (!move.powerHerbBoosted) {
            actor.volatileStatuses.push('Charging');
            actor.chargingMove = { ...move, originalTargetId: action.targetIds[0] };
            newLog.push({ type: 'text', text: `${actor.name} began charging its move!` });
            return; // End the action here for the charging turn
        }
    }
    if (checkMoveUsageRestrictions(actor, move, currentBattleState, newLog)) {
        return; // If the move fails, end the action here.
    }
    newLog.push({ type: 'text', text: `${actor.name} used ${move.name}!` });
    let ppCost = 1;
    // Check all targets of the move.
    action.targetIds.forEach(targetId => {
        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === targetId);
        if (target && !target.fainted) {
            const targetAbilityId = getEffectiveAbility(target, currentBattleState)?.id;
            // If any target has Pressure, its onModifyPP hook will be called.
            if (abilityEffects[targetAbilityId]?.onModifyPP) {
                ppCost = abilityEffects[targetAbilityId].onModifyPP(ppCost, move, actor);
            }
        }
    });
    move.pp -= ppCost;

    let lastDamageDealt = 0;
    for (const [i, hit] of action.hits.entries()) {
        let originalTarget = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === hit.targetId);
        
        // Skip this iteration if the target is invalid (e.g., already fainted from a previous hit)
        if (!originalTarget || originalTarget.fainted) continue;

        // Determine the final target for THIS HIT after redirection
        const redirector = findRedirector(actor, originalTarget, move, { ...currentBattleState, queuedActions: allQueuedActions });
        let finalTarget = redirector || originalTarget;
        if (redirector) {
            newLog.push({ type: 'text', text: `${redirector.name} took the attack!` });
        }

        // Run all checks and effects for the finalTarget of this specific hit
        if (checkProtection(finalTarget, move, allQueuedActions, newLog)) continue;
        
        const targetAbilityId = getEffectiveAbility(finalTarget, currentBattleState)?.id;
        const immunityCheck = abilityEffects[targetAbilityId]?.onCheckImmunity;
        if (immunityCheck && immunityCheck(move, finalTarget, getEffectiveAbility(actor, currentBattleState)?.id, newLog)) continue;

        const hitFlagKey = `willHit_${move.id}_hit${i + 1}_on_${finalTarget.id}`;
        const moveWillHit = UNMISSABLE_MOVES.has(move.id) || resolveChance(hitFlagKey, currentBattleState);
        
        if (moveWillHit) {
            const attackEntry = {
                type: 'attack',
                attackerName: actor.name,
                moveName: move.name,
                defenderName: finalTarget.name,
                moveType: move.type,
                moveCategory: move.damage_class.name,
            };

            const critFlagKey = `isCritical_${move.id}_hit${i + 1}_on_${finalTarget.id}`;
            const critChanceValue = parseFloat(CRIT_CHANCE_PERCENTAGES[calculateCritStage(actor, move, HIGH_CRIT_RATE_MOVES)]);
            const isCritical = resolveChance(critChanceValue, critFlagKey, currentBattleState);

            const damageResult = calculateDamage(actor, finalTarget, move, isCritical, currentBattleState, newLog);
            let damage = damageResult.damage;
            const finalTargetAbilityId = getEffectiveAbility(finalTarget, currentBattleState)?.id;
            const finalTargetItemId = finalTarget.heldItem?.id;

            if (abilityEffects[finalTargetAbilityId]?.onTakeDamage) {
                damage = abilityEffects[finalTargetAbilityId].onTakeDamage(damage, finalTarget, move, currentBattleState, newLog, actorAbilityId);
            }
            if (itemEffects[finalTargetItemId]?.onTakeDamage) {
                damage = itemEffects[finalTargetItemId].onTakeDamage(damage, finalTarget, move, currentBattleState, newLog);
            }
            lastDamageDealt = damage;

            // Apply damage and handle on-hit effects
            const actualDamageDealt = Math.min(finalTarget.currentHp, damage);
            finalTarget.currentHp -= actualDamageDealt;
            
            if (damageResult.effectiveness === 0) attackEntry.effectivenessText = "It had no effect...";
            else if (damageResult.effectiveness > 1) attackEntry.effectivenessText = "It's super effective!";
            else if (damageResult.effectiveness < 1) attackEntry.effectivenessText = "It's not very effective...";
            attackEntry.damage = actualDamageDealt;

            // Handle contact effects
            const statChanger = (p, s, c, l, cs) => {
                const result = calculateStatChange(p, s, c, cs);
                Object.assign(p, result.updatedTarget);
                l.push(...result.newLog);
            };
            if (actualDamageDealt > 0 && CONTACT_MOVES.has(move.id)) {
                if (abilityEffects[finalTargetAbilityId]?.onDamagedByContact) {
                    abilityEffects[finalTargetAbilityId].onDamagedByContact(finalTarget, actor, newLog, statChanger, currentBattleState);
                }
                if (itemEffects[finalTarget.heldItem?.id]?.onDamagedByContact) {
                    itemEffects[finalTarget.heldItem.id].onDamagedByContact(finalTarget, actor, currentBattleState, newLog);
                }
            }

            // Handle fainting
            if (finalTarget.currentHp === 0) {
                finalTarget.fainted = true;
                attackEntry.fainted = true;
                if (abilityEffects[actorAbilityId]?.onAfterKO) {
                    abilityEffects[actorAbilityId].onAfterKO(actor, finalTarget, newLog, statChanger, currentBattleState);
                }
            }

            // Handle secondary effects (only on the first hit for multi-hit moves)
            if (i === 0 && !finalTarget.fainted) {
                // -- Trapping status --
                if (damage > 0 && BINDING_MOVES.has(move.id) && !finalTarget.volatileStatuses.some(s => s.name === 'Trapped')) {
                    const duration = actor.heldItem?.id === 'grip-claw' ? 7 : 5;
                    finalTarget.volatileStatuses.push({ name: 'Trapped', sourceId: actor.id, duration: duration });
                    newLog.push({ type: 'text', text: `${finalTarget.name} was trapped!` });
                }

                // Apply Leech Seed status
                if (moveId === LEECH_SEED_MOVE) {
                    if (finalTarget.types.includes('grass')) { newLog.push({ type: 'text', text: `It doesn't affect ${finalTarget.name}...` }); }
                    else if (finalTarget.volatileStatuses.some(s => s.name === 'Leech Seed')) { newLog.push({ type: 'text', text: `${finalTarget.name} is already seeded!` }); }
                    else {
                        finalTarget.volatileStatuses.push({ name: 'Leech Seed', sourceId: actor.id, justApplied: true });
                        newLog.push({ type: 'text', text: `${finalTarget.name} was seeded!` });
                    }
                }
                const targetTeamData = currentBattleState.teams.find(t => t.pokemon.some(p => p.id === finalTarget.id));
                const targetTeamKey = targetTeamData?.id;

                if (targetTeamKey) {
                    // Logic for Stealth Rock
                    if (moveId === 'stealth-rock') {
                        if (currentBattleState.field.hazards[targetTeamKey]['stealth-rock'] === 0) {
                            currentBattleState.field.hazards[targetTeamKey]['stealth-rock'] = 1;
                            newLog.push({ type: 'text', text: `Pointed stones floated up around the ${targetTeamKey}'s team!` });
                        } else {
                            newLog.push({ type: 'text', text: 'But it failed!' });
                        }
                    }
                    // Logic for Spikes
                    else if (moveId === 'spikes') {
                        if (currentBattleState.field.hazards[targetTeamKey]['spikes'] < 3) {
                            currentBattleState.field.hazards[targetTeamKey]['spikes']++;
                            newLog.push({ type: 'text', text: `Spikes were scattered all around the feet of the ${targetTeamKey}'s team!` });
                        } else {
                            newLog.push({ type: 'text', text: 'But it failed!' });
                        }
                    }
                    // Logic for Toxic Spikes
                    else if (moveId === 'toxic-spikes') {
                        if (currentBattleState.field.hazards[targetTeamKey]['toxic-spikes'] < 2) {
                            currentBattleState.field.hazards[targetTeamKey]['toxic-spikes']++;
                            newLog.push({ type: 'text', text: `Poisonous spikes were scattered all around the feet of the ${targetTeamKey}'s team!` });
                        } else {
                            newLog.push({ type: 'text', text: 'But it failed!' });
                        }
                    }
                    // Logic for Sticky Web
                    else if (moveId === 'sticky-web') {
                        if (currentBattleState.field.hazards[targetTeamKey]['sticky-web'] === 0) {
                            currentBattleState.field.hazards[targetTeamKey]['sticky-web'] = 1;
                            newLog.push({ type: 'text', text: `A sticky web has been laid out beneath the ${targetTeamKey}'s team!` });
                        } else {
                            newLog.push({ type: 'text', text: 'But it failed!' });
                        }
                    }
                }
                // Apply Confusion status from a damaging move
                const confusionEffectKey = `willApplyEffect_${move.id}_on_${finalTarget.id}`;
                if (damage > 0 && CONFUSION_INDUCING_MOVES.has(move.id) && resolveChance(move.meta?.ailment_chance || 30, confusionEffectKey, currentBattleState)) {
                    if (!finalTarget.volatileStatuses.some(s => (s.name || s) === 'Confused')) {
                        finalTarget.volatileStatuses.push('Confused');
                        newLog.push({ type: 'text', text: `${finalTarget.name} became confused!` });
                    }
                }

                // Apply Ailment (e.g. burn, paralysis)
                const ailment = move.meta?.ailment?.name;
                const ailmentChance = move.meta?.ailment_chance || 0;
                if (ailment && ailment !== 'none' && !damageResult.move.sheerForceBoosted) {
                    const dmFlagKey = `willApplyEffect_${move.id}_on_${finalTarget.id}`;
                    if (resolveChance(ailmentChance, dmFlagKey, currentBattleState) && finalTarget.status === 'None') {
                        const statusToApply = API_AILMENT_TO_STATUS_MAP[ailment];
                        if (statusToApply) {
                            const isImmune = (statusToApply === 'Paralyzed' && finalTarget.types.includes('electric')) || (statusToApply === 'Burned' && finalTarget.types.includes('fire')) || (statusToApply === 'Frozen' && finalTarget.types.includes('ice')) || ((statusToApply === 'Poisoned' || statusToApply === 'Badly Poisoned') && (finalTarget.types.includes('poison') || finalTarget.types.includes('steel')));
                            if (!isImmune) {
                                finalTarget.status = statusToApply;
                                newLog.push({ type: 'text', text: `${finalTarget.name} was afflicted with ${statusToApply.toLowerCase()}!` });
                            }
                        }
                    }
                }
                
                // Apply Stat Changes
                if (move.stat_changes?.length > 0 && !damageResult.move.sheerForceBoosted) {
                    const statChangeChance = move.meta?.stat_chance || 0;
                    const dmFlagKey = `willApplyStatChange_${move.id}_on_${finalTarget.id}`;
                    if (resolveChance(statChangeChance, dmFlagKey, currentBattleState) && finalTarget.heldItem?.id !== 'covert-cloak') {
                        move.stat_changes.forEach(sc => {
                            const { updatedTarget, newLog: statLog } = calculateStatChange(finalTarget, sc.stat.name, sc.change, currentBattleState);
                            Object.assign(finalTarget, updatedTarget);
                            newLog.push(...statLog);
                        });
                    }
                }

                // Apply Flinch
                const flinchFlagKey = `willFlinch_${move.id}_on_${finalTarget.id}`;
                if (resolveChance(100, flinchFlagKey, currentBattleState)) {
                    const targetHasActed = sortedActions.slice(0, sortedActions.indexOf(action)).some(a => a.pokemon.id === finalTarget.id);
                    if (!targetHasActed && !finalTarget.volatileStatuses.includes('Flinched')) {
                        finalTarget.volatileStatuses.push('Flinched');
                        newLog.push({ type: 'text', text: `${finalTarget.name} flinched!` });
                    }
                }
            }

            newLog.push(attackEntry);
            if (finalTarget.fainted) break;

        } else {
            newLog.push({ type: 'text', text: `${actor.name}'s attack missed ${finalTarget.name}!` });
            const itemIdOnMiss = actor.heldItem?.id;
            if (itemEffects[itemIdOnMiss]?.onMiss) {
                itemEffects[itemIdOnMiss].onMiss(actor, move, currentBattleState, newLog, calculateStatChange);
            }
        }
    }

    if (RECOIL_MOVES.has(move.id) && lastDamageDealt > 0 && actor.currentHp > 0 && actorAbilityId !== 'magic-guard') {
        const recoilFraction = RECOIL_MOVES.get(move.id);
        const recoilDamage = Math.max(1, Math.floor(lastDamageDealt * recoilFraction));
        actor.currentHp = Math.max(0, actor.currentHp - recoilDamage);
        newLog.push({ type: 'text', text: `${actor.name} is damaged by recoil!` });
        if (actor.currentHp === 0) {
            actor.fainted = true;
            newLog.push({ type: 'text', text: `${actor.name} fainted!` });
        }
    }

    if (DRAIN_MOVES.has(move.id) && lastDamageDealt > 0 && actor.currentHp > 0 && actor.currentHp < actor.maxHp) {
        let healFraction = DRAIN_MOVES.get(move.id);
        let healAmount = Math.max(1, Math.floor(lastDamageDealt * healFraction));
        if (actor.heldItem?.id === 'big-root') {
            healAmount = Math.floor(healAmount * 1.3);
        }
        actor.currentHp = Math.min(actor.maxHp, actor.currentHp + healAmount);
        newLog.push({ type: 'text', text: `${actor.name} drained health!` });
    }

    const selfStatChanges = SELF_STAT_LOWERING_MOVES.get(move.id);
    if (selfStatChanges) {
        let statsWereLowered = false;
        selfStatChanges.forEach(sc => {
            if (sc.change < 0) {
                statsWereLowered = true;
            }
            const { updatedTarget, newLog: statLog } = calculateStatChange(actor, sc.stat, sc.change, currentBattleState);
            Object.assign(actor, updatedTarget);
            newLog.push(...statLog);
        });

        if (statsWereLowered) {
            const actorItemId = actor.heldItem?.id;
            if (actorItemId && itemEffects[actorItemId]?.onStatLowered) {
                itemEffects[actorItemId].onStatLowered(actor, currentBattleState, newLog);
            }
        }
    }
    if (CONSECUTIVE_TURN_MOVES.has(move.id) && !actor.lockedMove) {
        actor.lockedMove = { id: move.id, turns: 2 + Math.floor(Math.random() * 2) };
    }
    if (actor.lockedMove) {
        actor.lockedMove.turns--;
        if (actor.lockedMove.turns === 0) {
            actor.lockedMove = null;
            if (!actor.fainted) {
                newLog.push({ type: 'text', text: `${actor.name} became confused due to fatigue!` });
                actor.volatileStatuses.push('Confused');
            }
        }
    }
    if (move.gemBoosted) {
        newLog.push({ type: 'text', text: `${actor.name}'s ${actor.heldItem.name} made the move stronger!` });
        actor.heldItem = null;
    }
    if (move.powerHerbBoosted) {
        actor.lastConsumedItem = actor.heldItem;
        actor.heldItem = null;
    }

    const choiceItems = ['choice-band', 'choice-specs', 'choice-scarf'];
    const actorItemId = actor.heldItem?.id;
    // If the actor used a move, is holding a choice item, and isn't already locked into a move...
    if (actorItemId && choiceItems.includes(actorItemId) && !actor.lockedMove) {
        // ...lock them into this move.
        actor.lockedMove = { id: move.id };
        newLog.push({ type: 'text', text: `${actor.name} is locked into ${move.name}!` });
    }
    actor.lastMoveUsed = move.name;
    if (actor.encoreTurns > 0) {
        actor.encoreTurns--;
        if (actor.encoreTurns === 0) {
            newLog.push({ type: 'text', text: `${actor.name}'s encore ended.` });
            actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Encore');
            actor.encoredMove = null;
        }
    }

    if (actor.tauntTurns > 0) {
        actor.tauntTurns--;
        if (actor.tauntTurns === 0) {
            newLog.push({ type: 'text', text: `${actor.name}'s taunt ended.` });
            actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Taunt');
        }
    }

    if (actor.custapBerryActivated) {
        actor.custapBerryActivated = false;
    }
};