import { TYPE_CHART } from '../../config/gameData';
import { abilityEffects } from '../../config/abilityEffects';
import * as itemEffectsManager from '../../config/itemEffects';
const { itemEffects } = itemEffectsManager;
import { getEffectiveAbility, getStatModifier } from './battleUtils';
import { calculateStatChange } from './stateModifiers';


export const getZMovePower = (basePower) => {
    if (basePower <= 55) return 100;
    if (basePower <= 65) return 120;
    if (basePower <= 75) return 140;
    if (basePower <= 85) return 160;
    if (basePower <= 95) return 175;
    if (basePower <= 100) return 180;
    if (basePower <= 110) return 185;
    if (basePower <= 125) return 190;
    if (basePower <= 130) return 195;
    return 200;
};

export const calculateDamage = (attacker, defender, move, isCritical, currentBattleState, newLog) => {
    if (attacker.name.toLowerCase().includes('clefable')) {
        console.log(`--- ENTERING DAMAGE CALC ---`);
        console.log(`Attacker: ${attacker.name}`);
        console.log(`Held Item: ${JSON.stringify(attacker.heldItem)}`);
        console.log(`--------------------------`);
    }
    const attackerAbility = getEffectiveAbility(attacker, currentBattleState)?.toLowerCase();
    const defenderAbility = getEffectiveAbility(defender, currentBattleState)?.toLowerCase();
    const isSpecial = move.damage_class.name === 'special';
    const moveForCalc = { ...move, isSpecial };

    const statChanger = (target, stat, change) => {
        const { updatedTarget, newLog: statLog } = calculateStatChange(target, stat, change, currentBattleState);
        Object.assign(target, updatedTarget);
        newLog.push(...statLog);
    };

    if (abilityEffects[defenderAbility]?.onCheckImmunity?.(moveForCalc, defender, attackerAbility, newLog, statChanger, currentBattleState)) {
        return { damage: 0, effectiveness: 0 };
    }

    if (abilityEffects[attackerAbility]?.onModifyMove) {
        abilityEffects[attackerAbility].onModifyMove(moveForCalc, attacker, currentBattleState);
    }

    let initialEffectiveness = 1;
    defender.types.forEach(type => { initialEffectiveness *= TYPE_CHART[move.type]?.[type] ?? 1; });
    const isIdentified = defender.volatileStatuses.includes('Identified');

    if (initialEffectiveness === 0 && isIdentified && defender.types.includes('ghost')) {
        // And the move is Normal or Fighting
        if (move.type === 'normal' || move.type === 'fighting') {
            newLog.push({ type: 'text', text: `${defender.name} was identified!` });
            // Recalculate effectiveness, ignoring the Ghost type's immunity
            initialEffectiveness = 1;
            defender.types.forEach(type => {
                if (type !== 'ghost') {
                    initialEffectiveness *= TYPE_CHART[move.type]?.[type] ?? 1;
                }
            });
        }
    }
    // Wonder Guard ability check
    if (defenderAbility === 'wonder-guard' && initialEffectiveness <= 1) {
        newLog.push({ type: 'text', text: `${defender.name}'s Wonder Guard protected it!` });
        return { damage: 0, effectiveness: 0 };
    }

    if (move.power === null || move.power === 0) {
        return { damage: 0, effectiveness: 1 };
    }

    const attackStageKey = isSpecial ? 'special-attack' : 'attack';
    let defenseStageKey;

    // --- Stat Stage & Unaware Logic ---
    let attackStage = isCritical ? Math.max(0, attacker.stat_stages?.[attackStageKey] ?? 0) : (attacker.stat_stages?.[attackStageKey] ?? 0);
    // Defender's Unaware ignores attacker's stat boosts
    if (defenderAbility === 'unaware') {
        attackStage = 0;
    }

    // --- Wonder Room Logic ---
    let defenseBaseStat;
    if (currentBattleState.field.wonderRoomTurns > 0) {
        defenseStageKey = isSpecial ? 'defense' : 'special-defense';
        defenseBaseStat = isSpecial ? defender.stats?.defense ?? 1 : defender.stats?.['special-defense'] ?? 1;
    } else {
        defenseStageKey = isSpecial ? 'special-defense' : 'defense';
        defenseBaseStat = isSpecial ? defender.stats?.['special-defense'] ?? 1 : defender.stats?.defense ?? 1;
    }

    // --- Stat Stage & Unaware Logic (continued) ---
    let defenseStage = isCritical ? Math.min(0, defender.stat_stages?.[defenseStageKey] ?? 0) : (defender.stat_stages?.[defenseStageKey] ?? 0);
    // Attacker's Unaware ignores defender's stat boosts
    if (attackerAbility === 'unaware') {
        defenseStage = 0;
    }

    const finalAttackStage = getStatModifier(attackStage);
    const finalDefenseStage = getStatModifier(defenseStage);

    let details = {
        power: move.power,
        attack: (isSpecial ? attacker.stats?.['special-attack'] ?? 1 : attacker.stats?.attack ?? 1) * finalAttackStage,
        defense: defenseBaseStat * finalDefenseStage,
        finalMultiplier: 1.0,
        effectiveness: initialEffectiveness,
        stabMultiplier: attacker.types.includes(move.type) ? 1.5 : 1.0,
        critMultiplier: 1.0,
        berryTriggered: false
    };

    // Booster Energy stat boosts
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

    // Ability-based modifications
    if (abilityEffects[attackerAbility]?.onModifyMove) abilityEffects[attackerAbility].onModifyMove(moveForCalc, attacker);
    if (abilityEffects[attackerAbility]?.onModifyStat) details.attack = abilityEffects[attackerAbility].onModifyStat(attackStageKey, details.attack, attacker);
    if (abilityEffects[defenderAbility]?.onModifyStat) details.defense = abilityEffects[defenderAbility].onModifyStat(defenseStageKey, details.defense, defender, attacker);
    if (attacker.status?.toLowerCase() === 'burned' && !isSpecial && attackerAbility !== 'guts') details.attack /= 2;
    if (isCritical && !abilityEffects[defenderAbility]?.onCritImmunity?.(defender, move, attackerAbility)) details.critMultiplier = (attackerAbility === 'sniper') ? 2.25 : 1.5;

    // Item-based modifications (skipped if Magic Room is active)
    if (currentBattleState.field.magicRoomTurns === 0) {
        // --- Attacker's Item Check ---
        if (!attacker.volatileStatuses.includes('Embargo')) {
            const attackerItem = attacker.heldItem?.name.toLowerCase();
            if (attacker.name === 'Clefable') {
                console.log('--- FINAL STATE INSPECTION ---');
                console.log('Checking itemEffects object right before use...');
                console.log('Is itemEffects an object?', typeof itemEffects === 'object' && itemEffects !== null);
                try {
                    console.log('All keys found in itemEffects:', Object.keys(itemEffects));
                    console.log('Value of itemEffects["life-orb"]:', itemEffects['life-orb']);
                    console.log('Type of onModifyDamage hook:', typeof itemEffects['life-orb']?.onModifyDamage);
                } catch (e) {
                    console.log('An error occurred while inspecting itemEffects:', e.message);
                }
                console.log('--- END FINAL STATE INSPECTION ---');
            }
            if (itemEffects[attackerItem]?.onModifyMove) {
                itemEffects[attackerItem].onModifyMove(details, attacker);
            }
            if (itemEffects[attackerItem]?.onModifyStat) {
                details.attack = itemEffects[attackerItem].onModifyStat(attackStageKey, details.attack, attacker);
            }
            if (itemEffects[attackerItem]?.onModifyDamage) {
                itemEffects[attackerItem].onModifyDamage(details, attacker, moveForCalc);
            }
            console.log('AFTER item modification, finalMultiplier is:', details.finalMultiplier);
        }

        // --- Defender's Item Check ---
        if (!defender.volatileStatuses.includes('Embargo')) {
            const defenderItem = defender.heldItem?.name.toLowerCase();
            if (itemEffects[defenderItem]?.onModifyStat) {
                details.defense = itemEffects[defenderItem].onModifyStat(defenseStageKey, details.defense, defender);
            }
            if (itemEffects[defenderItem]?.onModifyDamage) {
                itemEffects[defenderItem].onModifyDamage(details, defender, moveForCalc);
            }
            // This check for super-effective berries is also a defender item effect
            if (itemEffects['super-effective-berry']?.onModifyDamage) {
                itemEffects['super-effective-berry'].onModifyDamage(details, defender, moveForCalc);
            }
        }
    }

    details.finalMultiplier *= details.stabMultiplier;
    details.finalMultiplier *= details.critMultiplier;
    details.finalMultiplier *= details.effectiveness;

    // Final ability-based damage modifications
    if (abilityEffects[attackerAbility]?.onModifyDamage) abilityEffects[attackerAbility].onModifyDamage(details, attacker, move);
    if (abilityEffects[defenderAbility]?.onModifyDamage) abilityEffects[defenderAbility].onModifyDamage(details, defender, move, attackerAbility);

    let baseDamage = Math.floor(((((2 * attacker.level / 5 + 2) * details.power * (details.attack / details.defense)) / 50) + 2));
    console.log('Final combined multiplier is:', details.finalMultiplier);
    let finalDamage = Math.floor(baseDamage * details.finalMultiplier);

    return { damage: Math.max(1, finalDamage), effectiveness: details.effectiveness, berryTriggered: details.berryTriggered, breakdown: details };
};