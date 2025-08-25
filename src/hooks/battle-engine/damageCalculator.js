import { TYPE_CHART, GUARANTEED_CRIT_MOVES } from '../../config/gameData';
import { abilityEffects } from './abilityEffects';
import * as itemEffectsManager from './itemEffects';
import { getEffectiveAbility, getStatModifier, isWeatherActive } from './battleUtils';
import { calculateStatChange } from './stateModifiers';


const { itemEffects } = itemEffectsManager;

export const calculateDamage = (attacker, defender, move, isCritical, currentBattleState, newLog) => {

    if (move.type === 'internal') {
        // This is a special, simplified calculation ONLY for confusion damage.
        const level = attacker.level;
        const attack = attacker.stats.attack * getStatModifier(attacker.stat_stages.attack);
        const defense = attacker.stats.defense * getStatModifier(attacker.stat_stages.defense);
        const power = move.power; // This will be 40

        // Using a simplified version of the main damage formula
        const damage = Math.floor(Math.floor(Math.floor(2 * level / 5 + 2) * power * attack / defense) / 50) + 2;

        // This calculation intentionally bypasses all standard modifiers:
        // - STAB
        // - Items (e.g., Life Orb)
        // - Abilities (e.g., Technician)
        // - Critical Hits
        // - Type Effectiveness & Immunities (Wonder Guard)
        // - Burn status reduction

        return { damage: Math.max(1, damage), effectiveness: 1, isCritical: false, move: move }; // Return early
    }

    const weather = currentBattleState.field.weather;
    const weatherIsActive = isWeatherActive(currentBattleState);
    if (weatherIsActive && currentBattleState.field.weather === 'sandstorm') {
        if (defender.types.includes('rock') && isSpecial) {
            details.defense *= 1.5;
        }
    }
    if (move.damage_class.name !== 'status' && weatherIsActive) {
        if (weather === 'harsh-sunshine' && move.type === 'water') {
            newLog.push({ type: 'text', text: "The Water-type attack evaporated in the harsh sunlight!" });
            return { damage: 0, effectiveness: 0, move: move };
        }
        if (weather === 'heavy-rain' && move.type === 'fire') {
            newLog.push({ type: 'text', text: "The Fire-type attack was extinguished by the heavy rain!" });
            return { damage: 0, effectiveness: 0, move: move };
        }
    }
    const defenderAbilityId = getEffectiveAbility(defender, currentBattleState)?.id;
    const attackerAbilityId = getEffectiveAbility(attacker, currentBattleState)?.id;
    const isImmuneToCrits = abilityEffects[defenderAbilityId]?.onCritImmunity?.(defender, move, attackerAbilityId);
    const isSpecial = move.damage_class.name === 'special';
    const moveForCalc = { ...move, isSpecial };
    const statChanger = (target, stat, change) => {
        const { updatedTarget, newLog: statLog } = calculateStatChange(target, stat, change, currentBattleState);
        Object.assign(target, updatedTarget);
        newLog.push(...statLog);
    };
    if (GUARANTEED_CRIT_MOVES.has(move.id)) {
        isCritical = true;
    }
    if (abilityEffects[defenderAbilityId]?.onCheckImmunity?.(moveForCalc, defender, attackerAbilityId, newLog, statChanger, currentBattleState)) {
        return { damage: 0, effectiveness: 0, move: moveForCalc };
    }

    if (abilityEffects[attackerAbilityId]?.onModifyMove) {
        abilityEffects[attackerAbilityId].onModifyMove(moveForCalc, attacker, currentBattleState);
    }
    let finalIsCritical = isCritical;
    if (GUARANTEED_CRIT_MOVES.has(move.id)) {
        finalIsCritical = true;
    }
    if (isImmuneToCrits) {
        finalIsCritical = false;
    }
    let initialEffectiveness = 1;
    defender.types.forEach(type => { initialEffectiveness *= TYPE_CHART[move.type]?.[type] ?? 1; });
    const isIdentified = defender.volatileStatuses.includes('Identified');

    if (initialEffectiveness === 0 && isIdentified && defender.types.includes('ghost')) {
        if (move.type === 'normal' || move.type === 'fighting') {
            newLog.push({ type: 'text', text: `${defender.name} was identified!` });
            initialEffectiveness = 1;
            defender.types.forEach(type => {
                if (type !== 'ghost') {
                    initialEffectiveness *= TYPE_CHART[move.type]?.[type] ?? 1;
                }
            });
        }
    }

    if (defenderAbilityId === 'wonder-guard' && initialEffectiveness <= 1) {
        newLog.push({ type: 'text', text: `${defender.name}'s Wonder Guard protected it!` });
        return { damage: 0, effectiveness: 0, move: moveForCalc };
    }

    if (move.power === null || move.power === 0) {
        return { damage: 0, effectiveness: 1, move: moveForCalc };
    }
    const attackStageKey = isSpecial ? 'special-attack' : 'attack';
    let defenseStageKey;
    let defenseBaseStat;

    if (currentBattleState.field.wonderRoomTurns > 0) {
        defenseStageKey = isSpecial ? 'defense' : 'special-defense';
        defenseBaseStat = isSpecial ? defender.stats?.defense ?? 1 : defender.stats?.['special-defense'] ?? 1;
    } else {
        defenseStageKey = isSpecial ? 'special-defense' : 'defense';
        defenseBaseStat = isSpecial ? defender.stats?.['special-defense'] ?? 1 : defender.stats?.defense ?? 1;
    }

    let attackStage = attacker.stat_stages[attackStageKey];
    let defenseStage = defender.stat_stages[defenseStageKey];

    if (isCritical) {
        if (attackStage < 0) {
            attackStage = 0;
        }
        if (defenseStage > 0) {
            defenseStage = 0;
        }
    }

    if (defenderAbilityId === 'unaware') attackStage = 0;
    if (attackerAbilityId === 'unaware') defenseStage = 0;

    let details = {
        power: moveForCalc.power,
        attack: (isSpecial ? attacker.stats['special-attack'] : attacker.stats.attack),
        defense: defenseBaseStat,
        finalMultiplier: 1.0,
        stabMultiplier: attacker.types.includes(moveForCalc.type) ? 1.5 : 1.0,
        critMultiplier: isCritical ? (attackerAbilityId === 'sniper' ? 2.25 : 1.5) : 1.0,
        effectiveness: initialEffectiveness,
    };
    details.attack *= getStatModifier(attackStage);
    details.defense *= getStatModifier(defenseStage);
    const allPokemonOnField = currentBattleState.teams.flatMap(t => t.pokemon.filter((p, i) => currentBattleState.activePokemonIndices[t.id]?.includes(i) && p && !p.fainted));

    allPokemonOnField.forEach(p => {
        const abilityId = getEffectiveAbility(p, currentBattleState)?.id;
        if (p.id !== attacker.id && abilityId === 'tablets-of-ruin' && !isSpecial) {
            details.attack *= 0.75;
        }
        if (p.id !== attacker.id && abilityId === 'vessel-of-ruin' && isSpecial) {
            details.attack *= 0.75;
        }
        if (p.id !== defender.id && abilityId === 'sword-of-ruin' && !isSpecial) {
            details.defense *= 0.75;
        }
        if (p.id !== defender.id && abilityId === 'beads-of-ruin' && isSpecial) {
            details.defense *= 0.75;
        }
    });
    if (attacker.boosterBoost) {
        if ((isSpecial && attacker.boosterBoost.stat === 'special-attack') || (!isSpecial && attacker.boosterBoost.stat === 'attack')) {
            details.attack *= attacker.boosterBoost.multiplier;
        }
    }
    if (defender.boosterBoost) {
        if ((isSpecial && defender.boosterBoost.stat === 'special-defense') || (!isSpecial && defender.boosterBoost.stat === 'defense')) {
            details.defense *= defender.boosterBoost.multiplier;
        }
    }

    if (attackerAbilityId && abilityEffects[attackerAbilityId]) {
        const attackerAbility = abilityEffects[attackerAbilityId];

        if (attackerAbility.onModifyStat) {
            details.attack = attackerAbility.onModifyStat(attackStageKey, details.attack, attacker);
        }
        if (attackerAbility.onModifyDamage) {
            attackerAbility.onModifyDamage(details, attacker, moveForCalc);
        }
    }

    // Apply defender's ability effects
    if (defenderAbilityId && abilityEffects[defenderAbilityId]) {
        const defenderAbility = abilityEffects[defenderAbilityId];
        if (defenderAbility.onModifyStat) {
            details.defense = defenderAbility.onModifyStat(defenseStageKey, details.defense, defender, attacker);
        }
        if (defenderAbility.onModifyDamage) {
            defenderAbility.onModifyDamage(details, defender, moveForCalc, attackerAbilityId);
        }
        // This handles Shell Armor / Battle Armor
        if (defenderAbility.onCritImmunity?.(defender, moveForCalc, attackerAbilityId)) {
            details.critMultiplier = 1.0;
            isCritical = false; // Also ensure the final log reflects this
        }
    }
    details.finalMultiplier *= details.stabMultiplier * details.critMultiplier * details.effectiveness;
    if (details.effectiveness === 0) {
        return { damage: 0, effectiveness: 0, move: moveForCalc };
    }
    if (currentBattleState.field.magicRoomTurns === 0) {
        if (!attacker.volatileStatuses.includes('Embargo')) {
            const attackerItemId = attacker.heldItem?.id;
            if (itemEffects[attackerItemId]?.onModifyMove) {
                itemEffects[attackerItemId].onModifyMove(details, attacker);
            }
            if (itemEffects[attackerItemId]?.onModifyStat) {
                details.attack = itemEffects[attackerItemId].onModifyStat(attackStageKey, details.attack, attacker);
            }
            if (itemEffects[attackerItemId]?.onModifyDamage) {
                itemEffects[attackerItemId].onModifyDamage(details, attacker, moveForCalc);
            }
        }

        if (!defender.volatileStatuses.includes('Embargo')) {
            const defenderItemId = defender.heldItem?.id;
            if (itemEffects[defenderItemId]?.onModifyStat) {
                details.defense = itemEffects[defenderItemId].onModifyStat(defenseStageKey, details.defense, defender);
            }
            if (itemEffects[defenderItemId]?.onModifyDamage) {
                itemEffects[defenderItemId].onModifyDamage(details, defender, moveForCalc);
            }
            if (itemEffects['super-effective-berry']?.onModifyDamage) {
                itemEffects['super-effective-berry'].onModifyDamage(details, defender, moveForCalc);
            }
        }
    }
    let baseDamage = Math.floor(((((2 * attacker.level / 5 + 2) * details.power * (details.attack / details.defense)) / 50) + 2));
    let finalDamage = Math.floor(baseDamage * details.finalMultiplier);
    const isBurned = attacker.status === 'Burned' && !isSpecial && attackerAbilityId !== 'guts';
    console.log(`[Damage Calc] Attacker: ${attacker.name}, Move: ${move.name}, Move Damage Class: ${move.damage_class.name}, Status: ${attacker.status}, Is Burned & Physical?: ${isBurned}, Final Damage: ${finalDamage}`);

    if (attacker.status === 'Burned' && !isSpecial && attackerAbilityId !== 'guts') {
        finalDamage = Math.floor(finalDamage / 2);
    }

    return { damage: Math.max(1, finalDamage), effectiveness: details.effectiveness, isCritical: finalIsCritical, move: moveForCalc };
};