import { TYPE_CHART } from '../../config/gameData';
import { abilityEffects } from '../../config/abilityEffects';
import { itemEffects } from '../../config/itemEffects';
import { getEffectiveAbility, getStatModifier, isGrounded, normalizeItemName } from './battleUtils';
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

    const attackerAbility = getEffectiveAbility(attacker, currentBattleState)?.toLowerCase();
    const defenderAbility = getEffectiveAbility(defender, currentBattleState)?.toLowerCase();
    const isSpecial = move.damage_class.name === 'special';
    const moveForCalc = { ...move, isSpecial };
    const moveNameLower = moveForCalc.name.toLowerCase();

    if (moveNameLower === 'facade' && attacker.status && attacker.status !== 'None') {
        moveForCalc.power *= 2;
    }

    // Acrobatics doubles power if the user has no held item
    if (moveNameLower === 'acrobatics' && !attacker.heldItem) {
        moveForCalc.power *= 2;
    }

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
    const weather = currentBattleState.field.weather;
    const terrain = currentBattleState.field.terrain;
    const attackerIsGrounded = isGrounded(attacker, currentBattleState);

    // Apply Weather effects (and check for Utility Umbrella)
    if (attacker.heldItem?.name.toLowerCase() !== 'utility-umbrella') {
        if (weather === 'sunshine' || weather === 'harsh-sunshine') {
            if (move.type === 'fire') details.finalMultiplier *= 1.5;
            if (move.type === 'water') details.finalMultiplier *= 0.5;
        } else if (weather === 'rain' || weather === 'heavy-rain') {
            if (move.type === 'water') details.finalMultiplier *= 1.5;
            if (move.type === 'fire') details.finalMultiplier *= 0.5;
        }
    }

    // Apply Terrain effects
    if (attackerIsGrounded) {
        if (terrain === 'electric-terrain' && move.type === 'electric') {
            details.finalMultiplier *= 1.3;
        } else if (terrain === 'grassy-terrain' && move.type === 'grass') {
            details.finalMultiplier *= 1.3;
        } else if (terrain === 'psychic-terrain' && move.type === 'psychic') {
            details.finalMultiplier *= 1.3;
        }
    }

    // Defensive terrain effects (apply to opponent)
    if (isGrounded(defender, currentBattleState) && terrain === 'misty-terrain' && move.type === 'dragon') {
        details.finalMultiplier *= 0.5;
    }
    if (abilityEffects[attackerAbility]?.onModifyDamage) abilityEffects[attackerAbility].onModifyDamage(details, attacker, move);
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
    if (isCritical && !abilityEffects[defenderAbility]?.onCritImmunity?.(defender, move, attackerAbility)) details.critMultiplier = (attackerAbility === 'sniper') ? 2.25 : 1.5;

    // Item-based modifications (skipped if Magic Room is active)
    if (currentBattleState.field.magicRoomTurns == 0) {
        const attackerItemName = attacker.heldItem ? normalizeItemName(attacker.heldItem.name) : '';
        const defenderItemName = defender.heldItem ? normalizeItemName(defender.heldItem.name) : '';

        if (!attacker.volatileStatuses.includes('embargo')) {
            const attackerItem = itemEffects[attackerItemName];

            if (attackerItem?.onModifyMove) {
                // This will call the specific hook for items like Muscle Band
                attackerItem.onModifyMove(details, attacker);
            }

            // --- NEW: Generic Type-Enhancing Item Check ---
            // This checks if the held item exists in the TYPE_ENHANCING_ITEMS map
            // If so, it calls the generic 'type-enhancing' hook you defined in itemEffects.js
            if (TYPE_ENHANCING_ITEMS[attacker.heldItem?.name.toLowerCase()]) {
                itemEffects['type-enhancing']?.onModifyMove(details, attacker);
            }
            // --- END NEW BLOCK ---

            if (attackerItem?.onModifyStat) {
                details.attack = attackerItem.onModifyStat(attackStageKey, details.attack, attacker);
            }
            if (attackerItem?.onModifyDamage) {
                attackerItem.onModifyDamage(details, attacker, moveForCalc);
            }
        }

        // Apply defender item effects if not under embargo
        if (!defender.volatileStatuses.includes('embargo')) {
            if (itemEffects[defenderItemName]?.onModifyStat) {
                details.defense = itemEffects[defenderItemName].onModifyStat(defenseStageKey, details.defense, defender);
            }
            if (itemEffects[defenderItemName]?.onModifyDamage && moveForCalc.isSuperEffective) {
                itemEffects[defenderItemName].onModifyDamage(details, defender, moveForCalc);
            }
        }
    }

    details.finalMultiplier *= details.stabMultiplier;
    details.finalMultiplier *= details.critMultiplier;
    details.finalMultiplier *= details.effectiveness;
    // Final ability-based damage modifications
    if (abilityEffects[attackerAbility]?.onModifyDamage) abilityEffects[attackerAbility].onModifyDamage(details, attacker, move);
    if (abilityEffects[defenderAbility]?.onModifyDamage) abilityEffects[defenderAbility].onModifyDamage(details, defender, move, attackerAbility);

    let baseDamage = Math.floor(((2 * attacker.level / 5 + 2) * moveForCalc.power * (details.attack / details.defense)) / 50) + 2;
    let finalDamage = Math.floor(baseDamage * details.finalMultiplier);

    return { damage: Math.max(1, finalDamage), effectiveness: details.effectiveness, berryTriggered: details.berryTriggered, breakdown: details };
};