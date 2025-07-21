/**
 * This file centralizes the logic for all held items in the battle engine.
 * Each key is the lowercase, hyphenated name of an item.
 * The value is an object containing specific "hook" functions that the engine will call
 * at different points in the battle.
 *
 * @param {object} target - The Pokémon object holding the item.
 * @param {object} battleState - The entire current battle state.
 * @param {Array} newLog - The array of log entries to push new messages to.
 * @param {object} [target] - The opposing Pokémon, when applicable.
 * @param {object} [move] - The move being used, when applicable.
 * @param {number} [damage] - The calculated damage, when applicable.
 */
import { TYPE_ENHANCING_ITEMS, PUNCHING_MOVES, SOUND_MOVES, SUPER_EFFECTIVE_BERRY_MAP, TYPE_CHART, TWO_TURN_MOVES } from './gameData';
import { getEffectiveAbility } from '../hooks/battle-engine/battleUtils';

// --- Item Definitions ---
export const itemEffects = {
    // --- Stat-Enhancing Items (Pre-calculation) ---
    'choice-band': {
        onModifyStat: (stat, value, target) => (stat === 'attack' && !target.isSpecial) ? value * 1.5 : value
    },
    'choice-specs': {
        onModifyStat: (stat, value, target) => (stat === 'special-attack' && target.isSpecial) ? value * 1.5 : value
    },
    'choice-scarf': {
        onModifyStat: (stat, value, target) => (stat === 'speed') ? value * 1.5 : value
    },
    'light-ball': {
        onModifyStat: (stat, value, target) => (target.name.toLowerCase() === 'pikachu') ? value * 2 : value
    },
    'thick-club': {
        onModifyStat: (stat, value, target) => {
            const name = target.name.toLowerCase();
            return (stat === 'attack' && (name.includes('cubone') || name.includes('marowak')) && !target.isSpecial) ? value * 2 : value;
        }
    },
    'deep-sea-tooth': {
        onModifyStat: (stat, value, target) => (stat === 'special-attack' && target.name.toLowerCase() === 'clamperl' && target.isSpecial) ? value * 2 : value
    },
    'eviolite': {
        onModifyStat: (stat, value, target) => (target.canEvolve && (stat === 'defense' || stat === 'special-defense')) ? value * 1.5 : value
    },
    'assault-vest': {
        onModifyStat: (stat, value, target) => (stat === 'special-defense' && target.isSpecial) ? value * 1.5 : value
    },
    'metal-powder': {
        onModifyStat: (stat, value, target) => (stat === 'defense' && target.name.toLowerCase() === 'ditto' && !target.isSpecial) ? value * 1.5 : value
    },
    'deep-sea-scale': {
        onModifyStat: (stat, value, target) => (stat === 'special-defense' && target.name.toLowerCase() === 'clamperl' && target.isSpecial) ? value * 2 : value
    },

    // --- Move Power Enhancing Items ---
    'muscle-band': {
        onModifyMove: (move) => { if (!move.isSpecial) move.power *= 1.1; }
    },
    'wise-glasses': {
        onModifyMove: (move) => { if (move.isSpecial) move.power *= 1.1; }
    },
    'punching-glove': {
        onModifyMove: (move) => { if (PUNCHING_MOVES.has(move.name.toLowerCase())) move.power *= 1.1; }
    },
    'adamant-orb': {
        onModifyMove: (move, target) => {
            if (target.name.toLowerCase().includes('dialga') && (move.type === 'steel' || move.type === 'dragon')) {
                move.power *= 1.2;
            }
        }
    },
    'lustrous-orb': {
        onModifyMove: (move, target) => {
            if (target.name.toLowerCase().includes('palkia') && (move.type === 'water' || move.type === 'dragon')) {
                move.power *= 1.2;
            }
        }
    },
    'griseous-orb': {
        onModifyMove: (move, target) => {
            if (target.name.toLowerCase().includes('giratina') && (move.type === 'ghost' || move.type === 'dragon')) {
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
    // This hook will be called by a special handler in the engine
    'type-enhancing': {
        onModifyMove: (move, target) => {
            const itemHeldType = TYPE_ENHANCING_ITEMS[target.heldItem?.name?.toLowerCase()];
            if (itemHeldType === move.type) {
                move.power *= 1.2;
            }
        }
    },

    // --- General Damage Modifiers ---
    'expert-belt': {
        onModifyDamage: (damageDetails) => { if (damageDetails.effectiveness > 1) damageDetails.finalMultiplier *= 1.2; }
    },
    'life-orb': {
        onModifyDamage: (damageDetails, attacker, move) => {
            console.log('>>> ENTERING Life Orb onModifyDamage hook.');
            console.log('>>> Move name:', move.name, '| sheerForceBoosted is:', move.sheerForceBoosted);
            if (!move.sheerForceBoosted) damageDetails.finalMultiplier *= 1.3;
            console.log('>>> APPLIED Life Orb boost. New multiplier:', damageDetails.finalMultiplier);
        },
        // CORRECTED onAfterDamageDealt hook
        onAfterDamageDealt: (damage, attacker, move, battleState, newLog) => {
            // Add a check for Magic Guard here
            if (!move.sheerForceBoosted && getEffectiveAbility(attacker, battleState)?.toLowerCase() !== 'magic-guard' && attacker.currentHp > 0) {
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
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (target.currentHp === target.maxHp && damage >= target.currentHp) {
                newLog.push({ type: 'text', text: `${target.name} hung on using its Focus Sash!` });
                target.lastConsumedItem = target.heldItem; // Add this line
                target.heldItem = null;
                return target.currentHp - 1;
            }
            return damage;
        }
    },
    'sitrus-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            const hpAfterDamage = target.currentHp - damage;
            if (target.currentHp > 0 && hpAfterDamage <= target.maxHp / 2) {
                const healAmount = Math.floor(target.maxHp / 4);
                target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${target.name} ate its Sitrus Berry and restored health!` });
                target.lastConsumedItem = target.heldItem; // Add this line
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
    // --- VERIFIED & COMPLETED ---
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
            const berryType = SUPER_EFFECTIVE_BERRY_MAP.get(target.heldItem?.name.toLowerCase());
            if (berryType === move.type && damageDetails.effectiveness > 1) {
                damageDetails.finalMultiplier *= 0.5;
                damageDetails.berryTriggered = true; // Flag for the engine to consume the item
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },

    // --- Post-Attack Trigger Items ---
    'throat-spray': {
        onAfterMove: (target, move, battleState, newLog) => {
            if (SOUND_MOVES.has(move.name.toLowerCase()) && target.stat_stages['special-attack'] < 6) {
                target.stat_stages['special-attack'] = Math.min(6, target.stat_stages['special-attack'] + 1);
                newLog.push({ type: 'text', text: `${target.name}'s Throat Spray raised its Sp. Atk!` });
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },
    'eject-button': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            if (damage > 0 && target.currentHp - damage > 0) {
                newLog.push({ type: 'text', text: `${target.name} is forced to switch out by its Eject Button!` });
                target.heldItem = null;
                // The engine will see this flag and trigger the replacement phase
                battleState.ejectQueue.push({ teamId: target.teamId, slotIndex: target.slotIndex });
            }
            return damage;
        }
    },

    // --- New Items from your Roadmap ---
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
    'protective-pads': {
        // This is a "marker" item. The engine will check for this before applying
        // effects from contact-based abilities like Static or Poison Point.
    },
    'weakness-policy': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            // We only proceed if damage is dealt and the item hasn't been used yet.
            if (damage > 0 && target.heldItem) {
                // Determine if the move was super-effective
                let effectiveness = 1;
                target.types.forEach(type => {
                    effectiveness *= TYPE_CHART[move.type]?.[type] ?? 1;
                });

                if (effectiveness > 1) {
                    newLog.push({ type: 'text', text: `${target.name}'s Weakness Policy was activated!` });

                    // Sharply raise Attack and Sp. Atk
                    let boosted = false;
                    if (target.stat_stages['attack'] < 6) {
                        target.stat_stages['attack'] = Math.min(6, target.stat_stages['attack'] + 2);
                        boosted = true;
                    }
                    if (target.stat_stages['special-attack'] < 6) {
                        target.stat_stages['special-attack'] = Math.min(6, target.stat_stages['special-attack'] + 2);
                        boosted = true;
                    }

                    if (boosted) {
                        newLog.push({ type: 'text', text: `${target.name}'s Attack and Sp. Atk were sharply raised!` });
                    }

                    target.lastConsumedItem = target.heldItem;
                    target.heldItem = null;
                }
            }
            return damage; // Always return the original damage
        }
    },
    'eject-pack': {
        // This hook needs to be created and called by your battle engine
        onStatLowered: (target, battleState, newLog) => {
            // Check if the item is still held
            if (target.heldItem) {
                newLog.push({ type: 'text', text: `${target.name} is forced to switch out by its Eject Pack!` });

                // Add the Pokémon to the eject queue, just like Eject Button does
                battleState.ejectQueue.push({ teamId: target.teamId, slotIndex: target.slotIndex });

                // Consume the item
                target.heldItem = null;
            }
        }
    },
    'red-card': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            // Item only triggers if damage is dealt and the holder isn't fainted.
            if (damage > 0 && target.currentHp > 0 && target.heldItem) {

                // Find the attacker in the battle state
                const attacker = battleState.teams.flatMap(t => t.pokemon).find(p => p.id === move.ownerId);
                if (!attacker) return damage;

                const attackerTeam = battleState.teams.find(t => t.pokemon.some(p => p.id === attacker.id));
                const attackerTeamKey = attackerTeam.id === 'players' ? 'players' : 'opponent';
                const attackerSlotIndex = battleState.activePokemonIndices[attackerTeamKey].findIndex(i => attackerTeam.pokemon[i].id === attacker.id);

                // Find all eligible replacements on the attacker's bench
                const eligibleReplacements = attackerTeam.pokemon.filter((p, i) =>
                    p && !p.fainted && !battleState.activePokemonIndices[attackerTeamKey].includes(i)
                );

                if (eligibleReplacements.length > 0) {
                    newLog.push({ type: 'text', text: `${target.name}'s Red Card activated!` });
                    target.heldItem = null; // Consume the item

                    // Pick a random replacement
                    const randomIndex = Math.floor(Math.random() * eligibleReplacements.length);
                    const replacementPokemon = eligibleReplacements[randomIndex];

                    // Add the forced switch to our new queue
                    battleState.forcedSwitchQueue.push({
                        teamId: attackerTeam.id,
                        teamKey: attackerTeamKey,
                        slotIndex: attackerSlotIndex,
                        pokemonToSwitchOutId: attacker.id,
                        replacementId: replacementPokemon.id,
                    });
                }
            }
            return damage; // Always return the original damage
        }
    },
    'room-service': {
        onFieldEffectStart: (target, fieldEffectName, battleState, newLog, statChanger) => {
            // Check if the triggering field effect is Trick Room
            if (fieldEffectName === 'trick-room') {
                // Check if the item is still held (it might have been removed by another effect)
                if (target.heldItem?.name.toLowerCase() === 'room-service') {
                    newLog.push({ type: 'text', text: `${target.name}'s Room Service was used!` });

                    // Lower speed by one stage
                    statChanger(target, 'speed', -1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${target.name}'s Speed fell!` });

                    // Consume the item
                    target.heldItem = null;
                }
            }
        }
    },
    'blunder-policy': {
        onMiss: (target, move, battleState, newLog, statChanger) => {
            // Check if the item is still held and Magic Room is not active
            if (target.heldItem?.name.toLowerCase() === 'blunder-policy' && battleState.field.magicRoomTurns === 0) {
                newLog.push({ type: 'text', text: `${target.name}'s Blunder Policy activated!` });

                // Sharply raise Speed
                statChanger(target, 'speed', 2, newLog, battleState);
                newLog.push({ type: 'text', text: `${target.name}'s Speed was sharply raised!` });

                // Consume the item
                target.heldItem = null;
            }
        }
    },
    'rocky-helmet': {
        onDamagedByContact: (target, attacker, battleState, newLog) => {
            if (attacker.currentHp > 0 && getEffectiveAbility(attacker)?.toLowerCase() !== 'magic-guard') {
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
            // This hook is only called if the Pokémon is not fainted.
            // Check if the holder is a Poison-type
            if (target.types.includes('poison')) {
                // Heal if the Pokémon is not already at full health
                if (target.currentHp < target.maxHp) {
                    const healAmount = Math.max(1, Math.floor(target.maxHp / 16));
                    target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${target.name} restored a little health using its Black Sludge!` });
                }
            } else {
                // Damage if the Pokémon is not a Poison-type
                const damageAmount = Math.max(1, Math.floor(target.maxHp / 16));
                target.currentHp = Math.max(0, target.currentHp - damageAmount);
                newLog.push({ type: 'text', text: `${target.name} was hurt by its Black Sludge!` });

                // Check if the Pokémon fainted from the damage
                if (target.currentHp === 0) {
                    target.fainted = true;
                    newLog.push({ type: 'text', text: `${target.name} fainted!` });
                }
            }
        }
    },

    'big-root': {
        // This is a marker item. The logic is handled in useBattleEngine.js
        // where drain moves are calculated to increase the healing amount.
        onModifyHealing: (healAmount) => {
            return healAmount * 1.3;
        }
    },

    // --- NEW ITEMS: "Pinch" Berries (Stat-Boosting) ---

    'liechi-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            // Check if HP will drop below 1/4 and the item is held
            if (target.heldItem && target.currentHp - damage <= target.maxHp / 4 && target.currentHp - damage > 0) {
                if (target.stat_stages['attack'] < 6) {
                    target.stat_stages['attack'] = Math.min(6, target.stat_stages['attack'] + 1);
                    newLog.push({ type: 'text', text: `${target.name} ate its Liechi Berry and raised its Attack!` });
                    target.lastConsumedItem = target.heldItem;
                    target.heldItem = null; // Consume the berry
                }
            }
            return damage; // Always return original damage
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
        // This is a generic handler for all Type Gems.
        onModifyMove: (move, target, battleState, newLog) => {
            // Extract the type from the item name (e.g., "Fire Gem" -> "fire")
            const itemHeld = target.heldItem?.name.toLowerCase();
            const gemType = itemHeld?.split(' ')[0];

            // Check if the move type matches the gem type
            if (gemType === move.type) {
                move.power *= 1.3;
                // Add a flag so the engine knows to consume the item after the move
                move.gemBoosted = true;
            }
        },
        // The engine will need to check for the 'gemBoosted' flag on the move
        // after it executes and then set target.heldItem = null.
    },

    // --- NEW ITEMS: "Marker" Items for DM ---
    // These items influence DM-controlled dice rolls (crits, flinching).
    // Having them in the system serves as a reference for the DM.

    'scope-lens': {
        // Marker item. No direct engine effect.
        // The DM sees this and knows to increase the critical hit chance.
    },

    'razor-claw': {
        // Marker item. Functionally identical to Scope Lens.
    },

    'kings-rock': {
        // Marker item. No direct engine effect.
        // The DM sees this and knows to add a flinch chance to attacks.
    },

    'razor-fang': {
        // Marker item. Functionally identical to King's Rock.
    },
    'white-herb': {
        onStatLowered: (target, battleState, newLog) => {
            if (target.heldItem?.name.toLowerCase() === 'white herb') {
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
        // This hook will be called before a Pokémon attempts to use a move.
        onBeforeMove: (target, move, battleState, newLog) => {
            const CUREABLE_STATUSES = ['Infatuated', 'Taunt', 'Encore', 'Torment', 'Disable'];
            let curedStatus = null;

            for (const status of CUREABLE_STATUSES) {
                if (target.volatileStatuses.includes(status)) {
                    curedStatus = status;
                    break; // Found a status to cure
                }
            }

            if (curedStatus) {
                target.volatileStatuses = target.volatileStatuses.filter(s => s !== curedStatus);
                // Also remove encoredMove if Encore was cured
                if (curedStatus === 'Encore') {
                    target.encoredMove = null;
                }
                newLog.push({ type: 'text', text: `${target.name} used its Mental Herb to snap out of its ${curedStatus}!` });
                target.heldItem = null; // Consume the item
            }
        }
    },
    'power-herb': {
        onBeforeMove: (target, move, battleState, newLog) => {
            // The TWO_TURN_MOVES set should be imported from gameData.js
            if (TWO_TURN_MOVES.has(move.name.toLowerCase())) {
                // This flag tells the engine to skip the charge turn
                move.powerHerbBoosted = true;
                newLog.push({ type: 'text', text: `${target.name} is glowing with power from its Power Herb!` });
            }
        }
    },
    'light-clay': {
        // This is a "marker item". The battle engine will check for its presence
        // directly when a screen-setting move is used. No hooks are needed.
    },
    'terrain-extender': {
        // This is a "marker item". The battle engine will check for its presence
        // directly when a terrain-setting move is used. No hooks are needed.
    },
    'binding-band': {
        // This is a "marker item". The engine will check for its presence on the user
        // of a binding move when calculating end-of-turn damage.
    },
    'flame-orb': {
        onEndOfTurn: (target, battleState, newLog) => {
            // The orb only activates if the holder has no status condition.
            if (target.status === 'None') {
                target.status = 'Burned';
                newLog.push({ type: 'text', text: `${target.name} was burned by its Flame Orb!` });
            }
        }
    },

    'toxic-orb': {
        onEndOfTurn: (target, battleState, newLog) => {
            // The orb only activates if the holder has no status condition.
            if (target.status === 'None') {
                target.status = 'Badly Poisoned';
                newLog.push({ type: 'text', text: `${target.name} was badly poisoned by its Toxic Orb!` });
            }
        }
    },
    'damp-rock': {
        // Marker item. Engine checks for this when Rain is set.
    },

    'heat-rock': {
        // Marker item. Engine checks for this when Sun is set.
    },

    'icy-rock': {
        // Marker item. Engine checks for this when Snow is set.
    },

    'smooth-rock': {
        // Marker item. Engine checks for this when Sandstorm is set.
    },
    'absorb-bulb': {
        onTakeDamage: (damage, target, move, battleState, newLog, statChanger) => {
            // Activates if hit by a Water-type move, damage is dealt, and the item is held.
            if (damage > 0 && move.type === 'water' && target.heldItem?.name.toLowerCase() === 'absorb bulb') {
                newLog.push({ type: 'text', text: `${target.name}'s Absorb Bulb was used!` });
                // Use the engine's stat change function to correctly raise Sp. Atk
                statChanger(target, 'special-attack', 1, newLog, battleState);
                target.heldItem = null; // Consume the item
            }
            return damage; // Always return original damage
        }
    },

    'cell-battery': {
        onTakeDamage: (damage, target, move, battleState, newLog, statChanger) => {
            // Activates if hit by an Electric-type move
            if (damage > 0 && move.type === 'electric' && target.heldItem?.name.toLowerCase() === 'cell battery') {
                newLog.push({ type: 'text', text: `${target.name}'s Cell Battery was used!` });
                statChanger(target, 'attack', 1, newLog, battleState);
                target.heldItem = null;
            }
            return damage;
        }
    },

    'luminous-moss': {
        onTakeDamage: (damage, target, move, battleState, newLog, statChanger) => {
            // Activates if hit by a Water-type move
            if (damage > 0 && move.type === 'water' && target.heldItem?.name.toLowerCase() === 'luminous moss') {
                newLog.push({ type: 'text', text: `${target.name}'s Luminous Moss was used!` });
                statChanger(target, 'special-defense', 1, newLog, battleState);
                target.heldItem = null;
            }
            return damage;
        }
    },

    'snowball': {
        onTakeDamage: (damage, target, move, battleState, newLog, statChanger) => {
            // Activates if hit by an Ice-type move
            if (damage > 0 && move.type === 'ice' && target.heldItem?.name.toLowerCase() === 'snowball') {
                newLog.push({ type: 'text', text: `${target.name}'s Snowball was used!` });
                statChanger(target, 'attack', 1, newLog, battleState);
                target.heldItem = null;
            }
            return damage;
        }
    },
    'bright-powder': {
        // Marker item. The hit chance calculation will check for this on the defender.
    },
    'wide-lens': {
        // Marker item. The hit chance calculation will check for this on the attacker.
    },
    'zoom-lens': {
        // Marker item. The hit chance calculation will check for this on the attacker.
    },
    'heavy-duty-boots': {
        // This is a "marker item". The engine will check for its presence
        // when a Pokémon switches in and entry hazards are on the field.
    },
    'shed-shell': {
        // Marker item. The UI will check for this item to override the 'Trapped' status.
    },
    'covert-cloak': {
        // Marker item. Engine checks for this on the defender before applying secondary effects.
    },
    'mirror-herb': {
        // This is a "marker item". The engine will check for this when an opponent's stats are raised.
    },
    'ability-shield': {
        // Marker item. The engine will check for this before allowing an ability to be suppressed.
    },
    'loaded-dice': {
        // Marker item. The engine will check for this when a multi-hit move is used.
    },
    'destiny-knot': {
        // Marker item. The engine checks for this when the holder becomes infatuated.
    },
    'iron-ball': {
        // Marker item. The engine checks for this in speed calculations and grounded checks.
    },
    'float-stone': {
        // Marker item. The engine will check for this when moves that depend on weight are implemented.
    },
    'adrenaline-orb': {
        // This hook will be called by the Intimidate ability's effect.
        onIntimidated: (target, battleState, newLog, statChanger) => {
            // Check if the item is still held (it might have been removed by another effect)
            if (target.heldItem?.name.toLowerCase() === 'adrenaline orb') {
                newLog.push({ type: 'text', text: `${target.name}'s Adrenaline Orb was used!` });

                // Raise speed by one stage
                statChanger(target, 'speed', 1, newLog, battleState);
                newLog.push({ type: 'text', text: `${target.name}'s Speed rose!` });

                // Consume the item
                target.heldItem = null;
            }
        }
    },
    'grip-claw': {
        // Marker item. The engine checks for this when applying a binding move
        // to determine the duration of the 'Trapped' status.
    },
    'quick-claw': {
        // Marker item. The UI will show a checkbox for this, and the engine
        // will check for the action flag during turn sorting.
    },
    'custap-berry': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            const hpAfterDamage = target.currentHp - damage;
            // Check if HP drops into the 25% range and the item is held.
            if (target.heldItem?.name.toLowerCase() === 'custap berry' && hpAfterDamage > 0 && hpAfterDamage <= target.maxHp / 4) {
                newLog.push({ type: 'text', text: `${target.name} ate its Custap Berry!` });

                // Set a flag on the Pokémon object ittarget. The engine will read this.
                target.custapBerryActivated = true;
                target.lastConsumedItem = target.heldItem;
                // Consume the berry
                target.heldItem = null;
            }
            return damage; // Always return original damage
        }
    },
    'booster-energy': {
        // Marker item. The Protosynthesis/Quark Drive abilities check for this on switch-in.
    },
    'shell-bell': {
        onAfterDamageDealt: (damageDealt, target, move, battleState, newLog) => {
            // This hook is called after an attack. `target` is the Shell Bell holder.
            if (damageDealt > 0 && target.currentHp < target.maxHp) {
                const healAmount = Math.max(1, Math.floor(damageDealt / 8));
                target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${target.name} restored a little HP using its Shell Bell!` });
            }
        }
    },

    'clear-amulet': {
        // This is a "marker item". The logic is handled directly in the
        // statChanger function in useBattleEngine.js to prevent stat drops.
    },

    'lagging-tail': {
        // This is a "marker item". The logic is handled directly in the
        // calculateTurnOrderSpeed function in useBattleEngine.js.
    },

    'full-incense': {
        // This is a "marker item", functionally identical to Lagging Tail. The
        // logic is handled in the calculateTurnOrderSpeed function.
    },

    'ring-target': {
        // This is a "marker item". The logic is handled directly in the
        // calculateDamage function in useBattleEngine.js to negate immunities.
    },
    'utility-umbrella': {
        // This is a "marker item". Its primary logic lives within other effects
        // that check for its presence (e.g., weather-related abilities).
    },

    'berry-juice': {
        onTakeDamage: (damage, target, move, battleState, newLog) => {
            const hpAfterDamage = target.currentHp - damage;
            // Activates if HP drops to 1/2 or less
            if (target.heldItem && hpAfterDamage > 0 && hpAfterDamage <= target.maxHp / 2) {
                target.currentHp = Math.min(target.maxHp, target.currentHp + 20);
                newLog.push({ type: 'text', text: `${target.name} drank its Berry Juice and restored some health!` });
                target.lastConsumedItem = target.heldItem;
                target.heldItem = null; // Consume the item
            }
            return damage;
        }
    },

    'sticky-barb': {
        onEndOfTurn: (target, battleState, newLog) => {
            // Holder takes damage at the end of the turn
            if (getEffectiveAbility(target, battleState)?.toLowerCase() !== 'magic-guard') {
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
            // Transfers the item to the attacker on contact if they have no item
            if (target.heldItem && !attacker.heldItem) {
                newLog.push({ type: 'text', text: `${target.name}'s Sticky Barb stuck to ${attacker.name}!` });
                attacker.heldItem = target.heldItem;
                target.heldItem = null;
            }
        }
    },
};