/**
 * This file centralizes the logic for all held items in the battle engine.
 * Each key is the lowercase, hyphenated name of an item.
 * The value is an object containing specific "hook" functions that the engine will call
 * at different points in the battle.
 */
import { TYPE_ENHANCING_ITEMS, PUNCHING_MOVES, SOUND_MOVES, SUPER_EFFECTIVE_BERRY_MAP, TYPE_CHART, TWO_TURN_MOVES } from '../../config/gameData';
import { getEffectiveAbility } from './battleUtils';
import { calculateStatChange } from './stateModifiers';

// --- Item Definitions ---
export const itemEffects = {
    // --- Stat-Enhancing Items (Pre-calculation) ---
    'choice-band': {
        onModifyStat: (stat, value, target) => (stat === 'attack') ? value * 1.5 : value
    },
    'choice-specs': {
        onModifyStat: (stat, value, target) => (stat === 'special-attack') ? value * 1.5 : value
    },
    'choice-scarf': {
        onModifyStat: (stat, value, target) => (stat === 'speed') ? value * 1.5 : value
    },
    'light-ball': {
        onModifyStat: (stat, value, target) => (target.id === 'pikachu') ? value * 2 : value
    },
    'thick-club': {
        onModifyStat: (stat, value, target) => {
            const pokeId = target.id;
            return (stat === 'attack' && (pokeId.includes('cubone') || pokeId.includes('marowak'))) ? value * 2 : value;
        }
    },
    'deep-sea-tooth': {
        onModifyStat: (stat, value, target) => (stat === 'special-attack' && target.id === 'clamperl') ? value * 2 : value
    },
    'eviolite': {
        onModifyStat: (stat, value, target) => (target.canEvolve && (stat === 'defense' || stat === 'special-defense')) ? value * 1.5 : value
    },
    'assault-vest': {
        onModifyStat: (stat, value, target) => (stat === 'special-defense') ? value * 1.5 : value
    },
    'metal-powder': {
        onModifyStat: (stat, value, target) => (stat === 'defense' && target.id === 'ditto') ? value * 1.5 : value
    },
    'deep-sea-scale': {
        onModifyStat: (stat, value, target) => (stat === 'special-defense' && target.id === 'clamperl') ? value * 2 : value
    },

    // --- Move Power Enhancing Items ---
    'muscle-band': {
        onModifyMove: (move) => { if (!move.isSpecial) move.power *= 1.1; }
    },
    'wise-glasses': {
        onModifyMove: (move) => { if (move.isSpecial) move.power *= 1.1; }
    },
    'punching-glove': {
        onModifyMove: (move) => { if (PUNCHING_MOVES.has(move.id)) move.power *= 1.1; }
    },
    'adamant-orb': {
        onModifyMove: (move, target) => {
            if (target.id.includes('dialga') && (move.type === 'steel' || move.type === 'dragon')) {
                move.power *= 1.2;
            }
        }
    },
    'lustrous-orb': {
        onModifyMove: (move, target) => {
            if (target.id.includes('palkia') && (move.type === 'water' || move.type === 'dragon')) {
                move.power *= 1.2;
            }
        }
    },
    'griseous-orb': {
        onModifyMove: (move, target) => {
            if (target.id.includes('giratina') && (move.type === 'ghost' || move.type === 'dragon')) {
                move.power *= 1.2;
            }
        }
    },
    'metronome': {
        onModifyMove: (move, target) => {
            const boost = 1 + (Math.min(target.consecutiveMoveCounter || 0, 5) * 0.2);
            if (boost > 1) {
                move.power *= boost;
            }
        }
    },

    // --- Type-Enhancing Items (Generic) ---
    'type-enhancing': {
        onModifyMove: (move, target) => {
            const itemHeldType = TYPE_ENHANCING_ITEMS[target.heldItem?.id];
            if (itemHeldType === move.type) {
                move.power *= 1.2;
            }
        }
    },

    // --- General Damage Modifiers ---
    'expert-belt': {
        onModifyDamage: (damageDetails) => { if (damageDetails.effectiveness > 1) damageDetails.finalMultiplier *= 1.2; }
    },
    // In src/config/itemEffects.js
    'life-orb': {
        onModifyDamage: (damageDetails, attacker, move) => {
            damageDetails.finalMultiplier *= 1.3;
        },
        onAfterDamageDealt: (damage, attacker, move, battleState, newLog) => {
            if (!move.sheerForceBoosted && getEffectiveAbility(attacker, battleState)?.id !== 'magic-guard' && attacker.currentHp > 0) {
                const recoil = Math.max(1, Math.floor(attacker.maxHp / 10));
                attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
                newLog.push({ type: 'text', text: `${attacker.name} was hurt by its Life Orb!` });
                if (attacker.currentHp === 0) {
                    attacker.fainted = true;
                    newLog.push({ type: 'text', text: `${attacker.name} fainted!` });
                }
            }
        }
    },

    // --- Defensive / Recovery Items ---
    'focus-sash': {
        // This hook is called with the calculated damage BEFORE it's subtracted from HP.
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            const isAtFullHp = target.currentHp === target.maxHp;
            const isLethal = damage >= target.currentHp;

            // The Focus Sash only works if the Pokémon is at full HP and the hit would be lethal.
            if (target.heldItem?.id === 'focus-sash' && isAtFullHp && isLethal) {
                newLog.push({ type: 'text', text: `${target.name} hung on using its Focus Sash!` });
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
                // The function returns the new damage value: exactly enough to leave the Pokémon with 1 HP.
                return target.currentHp - 1;
            }
            // If the conditions aren't met, return the original damage.
            return damage;
        }
    },
    'sitrus-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            // The check happens based on HP *after* the incoming damage.
            const hpAfterDamage = target.currentHp - damage;
            if (target.heldItem?.id === 'sitrus-berry' && hpAfterDamage > 0 && hpAfterDamage <= target.maxHp / 2) {
                const healAmount = Math.floor(target.maxHp / 4);
                target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${target.name} ate its Sitrus Berry and restored health!` });
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
            return damage;
        }
    },
    'leftovers': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.currentHp < target.maxHp) {
                const healAmount = Math.max(1, Math.floor(target.maxHp / 16));
                target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${target.name} restored a little health using its Leftovers!` });
            }
        }
    },

    // --- Status-Curing Berries ---
    'lum-berry': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.status !== 'None' || target.volatileStatuses.includes('Confused')) {
                newLog.push({ type: 'text', text: `${target.name} used its Lum Berry to cure its condition!` });
                target.status = 'None';
                target.volatileStatuses = target.volatileStatuses.filter(s => s !== 'Confused');
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },
    'cheri-berry': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.status === 'Paralyzed') {
                newLog.push({ type: 'text', text: `${target.name} ate its Cheri Berry and was cured of paralysis!` });
                target.status = 'None';
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },
    'chesto-berry': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.status === 'Asleep') {
                newLog.push({ type: 'text', text: `${target.name} ate its Chesto Berry and woke up!` });
                target.status = 'None';
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },
    'pecha-berry': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.status === 'Poisoned' || target.status === 'Badly Poisoned') {
                newLog.push({ type: 'text', text: `${target.name} ate its Pecha Berry and was cured of poison!` });
                target.status = 'None';
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },
    'rawst-berry': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.status === 'Burned') {
                newLog.push({ type: 'text', text: `${target.name} ate its Rawst Berry and healed its burn!` });
                target.status = 'None';
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },
    'aspear-berry': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.status === 'Frozen') {
                newLog.push({ type: 'text', text: `${target.name} ate its Aspear Berry and thawed out!` });
                target.status = 'None';
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },

    // --- Super-Effective Damage Reducing Berries ---
    'super-effective-berry': {
        onModifyDamage: (damageDetails, target, move) => {
            const berryType = SUPER_EFFECTIVE_BERRY_MAP.get(target.heldItem?.id);
            if (berryType === move.type && damageDetails.effectiveness > 1) {
                damageDetails.finalMultiplier *= 0.5;
                damageDetails.berryTriggered = true;
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },

    // --- Post-Attack Trigger Items ---
    'throat-spray': {
        onAfterMove: (target, move, battleState, newLog) => {
            if (SOUND_MOVES.has(move.id) && target.stat_stages['special-attack'] < 6) {
                target.stat_stages['special-attack'] = Math.min(6, target.stat_stages['special-attack'] + 1);
                newLog.push({ type: 'text', text: `${target.name}'s Throat Spray raised its Sp. Atk!` });
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },
    'eject-button': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (damage > 0 && target.currentHp - damage > 0 && target.heldItem?.id === 'eject-button') { // Added item check for safety
                newLog.push({ type: 'text', text: `${target.name} is forced to switch out by its Eject Button!` });

                // --- THIS IS THE MISSING LINE ---
                // The teamId and slotIndex need to be found to add to the queue.
                const teamIndex = battleState.teams.findIndex(t => t.pokemon.some(p => p.id === target.id));
                if (teamIndex !== -1) {
                    const team = battleState.teams[teamIndex];
                    const teamKey = team.id === 'players' ? 'players' : 'opponent';
                    const slotIndex = battleState.activePokemonIndices[teamKey].findIndex(i => team.pokemon[i]?.id === target.id);

                    if (slotIndex !== -1) {
                        battleState.ejectQueue.push({ teamId: team.id, teamIndex, slotIndex });
                    }
                }
                // --- END FIX ---

                target.lastConsumedItem = target.heldItem; // Consume the item
                target.heldItem = null;
            }
            return damage;
        }
    },

    'air-balloon': {
        onCheckImmunity: (move, target) => move.type === 'ground',
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (damage > 0) {
                newLog.push({ type: 'text', text: `${target.name}'s Air Balloon popped!` });
                target.heldItem = null;
            }
            return damage;
        }
    },
    'protective-pads': {},
    'weakness-policy': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (target.heldItem?.id === 'weakness-policy' && damage > 0) {
                // Check if the incoming move was super-effective.
                let effectiveness = 1;
                target.types.forEach(type => {
                    effectiveness *= TYPE_CHART[move.type]?.[type] ?? 1;
                });

                if (effectiveness > 1) {
                    newLog.push({ type: 'text', text: `${target.name}'s Weakness Policy was activated!` });
                    let boosted = false;
                    const statChanger = (pokemon, stat, change) => {
                        const { updatedTarget, newLog: statLog } = calculateStatChange(pokemon, stat, change, battleState);
                        Object.assign(pokemon, updatedTarget); // Apply the changes to the Pokémon
                        newLog.push(...statLog); // Add any new log messages
                    };
                    if (target.stat_stages['attack'] < 6) {
                        statChanger(target, 'attack', 2, newLog, battleState);
                        boosted = true;
                    }
                    if (target.stat_stages['special-attack'] < 6) {
                        statChanger(target, 'special-attack', 2, newLog, battleState);
                        boosted = true;
                    }
                    if (boosted) {
                        newLog.push({ type: 'text', text: `${target.name}'s Attack and Sp. Atk were sharply raised!` });
                    }
                    target.lastConsumedItem = target.heldItem;
                    target.heldItem = null;
                }
            }
            return damage;
        }
    },
    'eject-pack': {
        onStatLowered: (target, battleState, newLog) => {
            if (target.heldItem) {
                newLog.push({ type: 'text', text: `${target.name} is forced to switch out by its Eject Pack!` });
                battleState.ejectQueue.push({ teamId: target.teamId, slotIndex: target.slotIndex });
                target.heldItem = null;
            }
        }
    },
    'red-card': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (damage > 0 && target.currentHp > 0 && target.heldItem) {
                const attacker = battleState.teams.flatMap(t => t.pokemon).find(p => p.id === move.ownerId);
                if (!attacker) return damage;
                const attackerTeam = battleState.teams.find(t => t.pokemon.some(p => p.id === attacker.id));
                const attackerTeamKey = attackerTeam.id === 'players' ? 'players' : 'opponent';
                const attackerSlotIndex = battleState.activePokemonIndices[attackerTeamKey].findIndex(i => attackerTeam.pokemon[i].id === attacker.id);
                const eligibleReplacements = attackerTeam.pokemon.filter((p, i) =>
                    p && !p.fainted && !battleState.activePokemonIndices[attackerTeamKey].includes(i)
                );
                if (eligibleReplacements.length > 0) {
                    newLog.push({ type: 'text', text: `${target.name}'s Red Card activated!` });
                    target.heldItem = null;
                    const randomIndex = Math.floor(Math.random() * eligibleReplacements.length);
                    const replacementPokemon = eligibleReplacements[randomIndex];
                    battleState.forcedSwitchQueue.push({
                        teamId: attackerTeam.id,
                        teamKey: attackerTeamKey,
                        slotIndex: attackerSlotIndex,
                        pokemonToSwitchOutId: attacker.id,
                        replacementId: replacementPokemon.id,
                    });
                }
            }
            return damage;
        }
    },
    'room-service': {
        onFieldEffectStart: (target, fieldEffectName, battleState, newLog, statChanger) => {
            if (fieldEffectName === 'trick-room') {
                if (target.heldItem?.id === 'room-service') {
                    newLog.push({ type: 'text', text: `${target.name}'s Room Service was used!` });
                    statChanger(target, 'speed', -1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${target.name}'s Speed fell!` });
                    target.heldItem = null;
                }
            }
        }
    },
    'blunder-policy': {
        onMiss: (target, move, battleState, newLog, statChanger) => {
            if (target.heldItem?.id === 'blunder-policy' && battleState.field.magicRoomTurns === 0) {
                newLog.push({ type: 'text', text: `${target.name}'s Blunder Policy activated!` });
                statChanger(target, 'speed', 2, newLog, battleState);
                newLog.push({ type: 'text', text: `${target.name}'s Speed was sharply raised!` });
                target.heldItem = null;
            }
        }
    },
    'rocky-helmet': {
        onDamagedByContact: (target, attacker, battleState, newLog) => {
            if (attacker.currentHp > 0 && getEffectiveAbility(attacker)?.id !== 'magic-guard') {
                const damage = Math.max(1, Math.floor(attacker.maxHp / 6));
                attacker.currentHp = Math.max(0, attacker.currentHp - damage);
                newLog.push({ type: 'text', text: `${attacker.name} was hurt by ${target.name}'s Rocky Helmet!` });
                if (attacker.currentHp === 0) {
                    attacker.fainted = true;
                    newLog.push({ type: 'text', text: `${attacker.name} fainted!` });
                }
            }
        }
    },
    'black-sludge': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.types.includes('poison')) {
                if (target.currentHp < target.maxHp) {
                    const healAmount = Math.max(1, Math.floor(target.maxHp / 16));
                    target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${target.name} restored a little health using its Black Sludge!` });
                }
            } else {
                const damageAmount = Math.max(1, Math.floor(target.maxHp / 16));
                target.currentHp = Math.max(0, target.currentHp - damageAmount);
                newLog.push({ type: 'text', text: `${target.name} was hurt by its Black Sludge!` });
                if (target.currentHp === 0) {
                    target.fainted = true;
                    newLog.push({ type: 'text', text: `${target.name} fainted!` });
                }
            }
        }
    },
    'big-root': {
        onModifyHealing: (healAmount) => {
            return healAmount * 1.3;
        }
    },
    'liechi-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (target.heldItem && target.currentHp - damage <= target.maxHp / 4 && target.currentHp - damage > 0) {
                if (target.stat_stages['attack'] < 6) {
                    target.stat_stages['attack'] = Math.min(6, target.stat_stages['attack'] + 1);
                    newLog.push({ type: 'text', text: `${target.name} ate its Liechi Berry and raised its Attack!` });
                    target.lastConsumedItem = target.heldItem;
                    target.heldItem = null;
                }
            }
            return damage;
        }
    },
    'ganlon-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (target.heldItem && target.currentHp - damage <= target.maxHp / 4 && target.currentHp - damage > 0) {
                if (target.stat_stages['defense'] < 6) {
                    target.stat_stages['defense'] = Math.min(6, target.stat_stages['defense'] + 1);
                    newLog.push({ type: 'text', text: `${target.name} ate its Ganlon Berry and raised its Defense!` });
                    target.lastConsumedItem = target.heldItem;
                    target.heldItem = null;
                }
            }
            return damage;
        }
    },
    'salac-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (target.heldItem && target.currentHp - damage <= target.maxHp / 4 && target.currentHp - damage > 0) {
                if (target.stat_stages['speed'] < 6) {
                    target.stat_stages['speed'] = Math.min(6, target.stat_stages['speed'] + 1);
                    newLog.push({ type: 'text', text: `${target.name} ate its Salac Berry and raised its Speed!` });
                    target.lastConsumedItem = target.heldItem;
                    target.heldItem = null;
                }
            }
            return damage;
        }
    },
    'petaya-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (target.heldItem && target.currentHp - damage <= target.maxHp / 4 && target.currentHp - damage > 0) {
                if (target.stat_stages['special-attack'] < 6) {
                    target.stat_stages['special-attack'] = Math.min(6, target.stat_stages['special-attack'] + 1);
                    newLog.push({ type: 'text', text: `${target.name} ate its Petaya Berry and raised its Sp. Atk!` });
                    target.lastConsumedItem = target.heldItem;
                    target.heldItem = null;
                }
            }
            return damage;
        }
    },
    'apicot-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (target.heldItem && target.currentHp - damage <= target.maxHp / 4 && target.currentHp - damage > 0) {
                if (target.stat_stages['special-defense'] < 6) {
                    target.stat_stages['special-defense'] = Math.min(6, target.stat_stages['special-defense'] + 1);
                    newLog.push({ type: 'text', text: `${target.name} ate its Apicot Berry and raised its Sp. Def!` });
                    target.lastConsumedItem = target.heldItem;
                    target.heldItem = null;
                }
            }
            return damage;
        }
    },
    'gem': {
        onModifyMove: (move, target, battleState, newLog) => {
            const itemHeldId = target.heldItem?.id;
            const gemType = itemHeldId?.split('-')[0];
            if (gemType === move.type) {
                move.power *= 1.3;
                move.gemBoosted = true;
            }
        },
    },
    'white-herb': {
        onStatLowered: (target, battleState, newLog) => {
            if (target.heldItem?.id === 'white-herb') {
                let statsWereRestored = false;
                for (const stat in target.stat_stages) {
                    if (target.stat_stages[stat] < 0) {
                        target.stat_stages[stat] = 0;
                        statsWereRestored = true;
                    }
                }
                if (statsWereRestored) {
                    newLog.push({ type: 'text', text: `${target.name} used its White Herb to restore its stats!` });
                    target.heldItem = null;
                }
            }
        }
    },
    'mental-herb': {
        onBeforeMove: (target, move, battleState, newLog) => {
            const CUREABLE_STATUSES = ['Infatuated', 'Taunt', 'Encore', 'Torment', 'Disable'];
            let curedStatus = null;
            for (const status of CUREABLE_STATUSES) {
                if (target.volatileStatuses.includes(status)) {
                    curedStatus = status;
                    break;
                }
            }
            if (curedStatus) {
                target.volatileStatuses = target.volatileStatuses.filter(s => s !== curedStatus);
                if (curedStatus === 'Encore') {
                    target.encoredMove = null;
                }
                newLog.push({ type: 'text', text: `${target.name} used its Mental Herb to snap out of its ${curedStatus}!` });
                target.heldItem = null;
            }
        }
    },
    'power-herb': {
        onBeforeMove: (target, move, battleState, newLog) => {
            if (TWO_TURN_MOVES.has(move.id)) {
                move.powerHerbBoosted = true;
                newLog.push({ type: 'text', text: `${target.name} is glowing with power from its Power Herb!` });
            }
        }
    },
    'flame-orb': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.status === 'None') {
                target.status = 'Burned';
                newLog.push({ type: 'text', text: `${target.name} was burned by its Flame Orb!` });
            }
        }
    },
    'toxic-orb': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (target.status === 'None') {
                target.status = 'Badly Poisoned';
                newLog.push({ type: 'text', text: `${target.name} was badly poisoned by its Toxic Orb!` });
            }
        }
    },
    'absorb-bulb': {
        onTakeDamage: (damage, target, move, battleState, newLog, statChanger) => {
            if (damage > 0 && move.type === 'water' && target.heldItem?.id === 'absorb-bulb') {
                newLog.push({ type: 'text', text: `${target.name}'s Absorb Bulb was used!` });
                statChanger(target, 'special-attack', 1, newLog, battleState);
                target.heldItem = null;
            }
            return damage;
        }
    },
    'cell-battery': {
        onTakeDamage: (damage, target, move, battleState, newLog, statChanger) => {
            if (damage > 0 && move.type === 'electric' && target.heldItem?.id === 'cell-battery') {
                newLog.push({ type: 'text', text: `${target.name}'s Cell Battery was used!` });
                statChanger(target, 'attack', 1, newLog, battleState);
                target.heldItem = null;
            }
            return damage;
        }
    },
    'luminous-moss': {
        onTakeDamage: (damage, target, move, battleState, newLog, statChanger) => {
            if (damage > 0 && move.type === 'water' && target.heldItem?.id === 'luminous-moss') {
                newLog.push({ type: 'text', text: `${target.name}'s Luminous Moss was used!` });
                statChanger(target, 'special-defense', 1, newLog, battleState);
                target.heldItem = null;
            }
            return damage;
        }
    },
    'snowball': {
        onTakeDamage: (damage, target, move, battleState, newLog, statChanger) => {
            if (damage > 0 && move.type === 'ice' && target.heldItem?.id === 'snowball') {
                newLog.push({ type: 'text', text: `${target.name}'s Snowball was used!` });
                statChanger(target, 'attack', 1, newLog, battleState);
                target.heldItem = null;
            }
            return damage;
        }
    },
    'adrenaline-orb': {
        onIntimidated: (target, battleState, newLog, statChanger) => {
            if (target.heldItem?.id === 'adrenaline-orb') {
                newLog.push({ type: 'text', text: `${target.name}'s Adrenaline Orb was used!` });
                statChanger(target, 'speed', 1, newLog, battleState);
                newLog.push({ type: 'text', text: `${target.name}'s Speed rose!` });
                target.heldItem = null;
            }
        }
    },
    'custap-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            const hpAfterDamage = target.currentHp - damage;
            if (target.heldItem?.id === 'custap-berry' && hpAfterDamage > 0 && hpAfterDamage <= target.maxHp / 4) {
                newLog.push({ type: 'text', text: `${target.name} ate its Custap Berry!` });
                target.custapBerryActivated = true;
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
            return damage;
        }
    },
    'shell-bell': {
        onAfterDamageDealt: (damageDealt, target, move, battleState, newLog) => {
            if (damageDealt > 0 && target.currentHp < target.maxHp) {
                const healAmount = Math.max(1, Math.floor(damageDealt / 8));
                target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${target.name} restored a little HP using its Shell Bell!` });
            }
        }
    },
    'berry-juice': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            const hpAfterDamage = target.currentHp - damage;
            if (target.heldItem && hpAfterDamage > 0 && hpAfterDamage <= target.maxHp / 2) {
                target.currentHp = Math.min(target.maxHp, target.currentHp + 20);
                newLog.push({ type: 'text', text: `${target.name} drank its Berry Juice and restored some health!` });
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
            return damage;
        }
    },
    'sticky-barb': {
        onEndOfTurn: (target, battleState, newLog) => {
            if (getEffectiveAbility(target, battleState)?.id !== 'magic-guard') {
                const damageAmount = Math.max(1, Math.floor(target.maxHp / 8));
                target.currentHp = Math.max(0, target.currentHp - damageAmount);
                newLog.push({ type: 'text', text: `${target.name} was hurt by its Sticky Barb!` });
                if (target.currentHp === 0) {
                    target.fainted = true;
                    newLog.push({ type: 'text', text: `${target.name} fainted!` });
                }
            }
        },
        onDamagedByContact: (target, attacker, newLog, statChanger, battleState) => {
            if (target.heldItem && !attacker.heldItem) {
                newLog.push({ type: 'text', text: `${target.name}'s Sticky Barb stuck to ${attacker.name}!` });
                attacker.heldItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },
    // Marker items - logic is handled elsewhere in the engine
    'scope-lens': {},
    'razor-claw': {},
    'kings-rock': {},
    'razor-fang': {},
    'light-clay': {},
    'terrain-extender': {},
    'binding-band': {},
    'damp-rock': {},
    'heat-rock': {},
    'icy-rock': {},
    'smooth-rock': {},
    'bright-powder': {},
    'wide-lens': {},
    'zoom-lens': {},
    'heavy-duty-boots': {},
    'shed-shell': {},
    'covert-cloak': {},
    'mirror-herb': {},
    'ability-shield': {},
    'loaded-dice': {},
    'destiny-knot': {},
    'iron-ball': {},
    'float-stone': {},
    'booster-energy': {},
    'clear-amulet': {},
    'lagging-tail': {},
    'full-incense': {},
    'ring-target': {},
    'utility-umbrella': {},
};