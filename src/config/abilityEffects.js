/**
 * This file centralizes the logic for all Pokémon abilities in the battle engine.
 * Each key is the lowercase, hyphenated name of an ability.
 * The value is an object containing specific "hook" functions that the engine will call
 * at different points in the battle.
 *
 * @param {object} pokemon - The Pokémon object that has the ability.
 * @param {object} battleState - The entire current battle state.
 * @param {Array} newLog - The array of log entries to push new messages to.
 * @param {object} [target] - The opposing Pokémon, when applicable.
 * @param {object} [move] - The move being used, when applicable.
 * @param {number} [damage] - The calculated damage, when applicable.
 */
import { BITING_MOVES, AURA_PULSE_MOVES, PUNCHING_MOVES, RECOIL_MOVES, REFLECTABLE_MOVES, CONTACT_MOVES, SOUND_MOVES } from './gameData';
import { calculateStat } from '../utils/api';
import { getStatModifier, getEffectiveAbility } from '../hooks/battle-engine/battleUtils';
// --- Helper Functions ---
const getActiveOpponents = (pokemon, battleState, newLog) => {
    const pokemonTeamId = battleState.teams.find(t => t.pokemon.some(p => p.id === pokemon.id))?.id;
    if (!pokemonTeamId) return [];

    const opponentTeam = battleState.teams.find(t => t.id !== pokemonTeamId);
    const opponentKey = opponentTeam.id === 'players' ? 'players' : 'opponent';

    return opponentTeam.pokemon.filter((p, i) => battleState.activePokemonIndices[opponentKey].includes(i) && p && !p.fainted);
};

const setWeather = (weatherType, turns, message, pokemon, battleState, newLog) => {
    if (battleState.field.weather !== weatherType && battleState.field.weather !== 'strong-winds') {
        battleState.field.weather = weatherType;
        battleState.field.weatherTurns = turns;
        newLog.push({ type: 'text', text: message });
    }
};

const setTerrain = (terrainType, turns, message, pokemon, battleState, newLog) => {
    if (battleState.field.terrain !== terrainType) {
        battleState.field.terrain = terrainType;
        battleState.field.terrainTurns = turns;
        newLog.push({ type: 'text', text: message });
    }
};


// --- Ability Definitions ---
export const abilityEffects = {
    // --- Switch-In Abilities ---
    'intimidate': {
        onSwitchIn: (pokemon, battleState, newLog, statChanger) => {
            const opponents = getActiveOpponents(pokemon, battleState);
            if (opponents.length > 0) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Intimidate cuts the foe's attack!` });
                opponents.forEach(opp => {
                    statChanger(opp, 'attack', -1, newLog, battleState);
                    // The Adrenaline Orb logic will be moved to the main engine later
                });
            }
        }
    },
    'drizzle': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.name.toLowerCase() === 'damp rock' ? 8 : 5;
            setWeather('rain', turns, 'It started to rain!', pokemon, battleState, newLog);
        }
    },
    'primordial-sea': { // This is a strong weather, not extended by items
        onSwitchIn: (pokemon, battleState, newLog) => setWeather('heavy-rain', 9999, 'A heavy rain began to fall!', pokemon, battleState, newLog)
    },
    'sand-stream': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.name.toLowerCase() === 'smooth rock' ? 8 : 5;
            setWeather('sandstorm', turns, 'A sandstorm kicked up!', pokemon, battleState, newLog);
        }
    },
    'drought': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.name.toLowerCase() === 'heat rock' ? 8 : 5;
            setWeather('sunshine', turns, 'The sunlight turned harsh!', pokemon, battleState, newLog);
        }
    },
    'orichalcum-pulse': { // Same as Drought for now
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.name.toLowerCase() === 'heat rock' ? 8 : 5;
            setWeather('sunshine', turns, 'The sunlight turned harsh!', pokemon, battleState, newLog);
        }
    },
    'desolate-land': { // This is a strong weather, not extended by items
        onSwitchIn: (pokemon, battleState, newLog) => setWeather('harsh-sunshine', 9999, 'The sunlight became extremely harsh!', pokemon, battleState, newLog)
    },
    'snow-warning': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.name.toLowerCase() === 'icy rock' ? 8 : 5;
            setWeather('snow', turns, 'It started to snow!', pokemon, battleState, newLog);
        }
    },
    'delta-stream': {
        onSwitchIn: (pokemon, battleState, newLog) => setWeather('strong-winds', 9999, 'A mysterious air current is protecting Flying-type Pokemon!', pokemon, battleState, newLog)
    },
    'grassy-surge': {
        onSwitchIn: (pokemon, battleState, newLog) => setTerrain('grassy-terrain', 5, 'The battlefield became grassy!', pokemon, battleState, newLog)
    },
    'misty-surge': {
        onSwitchIn: (pokemon, battleState, newLog) => setTerrain('misty-terrain', 5, 'The battlefield became misty!', pokemon, battleState, newLog)
    },
    'psychic-surge': {
        onSwitchIn: (pokemon, battleState, newLog) => setTerrain('psychic-terrain', 5, 'The battlefield became psychic..y!', pokemon, battleState, newLog)
    },

    // --- Damage & Stat Modifying Abilities ---
    'levitate': {
        onCheckImmunity: (move, target, attackerAbility) => {
            // Add this check at the beginning
            if (attackerAbility?.toLowerCase() === 'mold breaker') return false;
            return move.type === 'ground';
        }
    },
    'guts': {
        onModifyStat: (stat, value, pokemon) => (stat === 'attack' && pokemon.status !== 'None' && !pokemon.isSpecial) ? value * 1.5 : value
    },
    'toxic-boost': {
        onModifyStat: (stat, value, pokemon) => (stat === 'attack' && (pokemon.status === 'Poisoned' || pokemon.status === 'Badly Poisoned') && !pokemon.isSpecial) ? value * 1.5 : value
    },
    'flare-boost': {
        onModifyStat: (stat, value, pokemon) => (stat === 'special-attack' && pokemon.status === 'Burned' && pokemon.isSpecial) ? value * 1.5 : value
    },
    'huge-power': {
        onModifyStat: (stat, value, pokemon) => (stat === 'attack' && !pokemon.isSpecial) ? value * 2 : value
    },
    'pure-power': {
        onModifyStat: (stat, value, pokemon) => (stat === 'attack' && !pokemon.isSpecial) ? value * 2 : value
    },
    'strong-jaw': {
        onModifyMove: (move, pokemon) => { if (BITING_MOVES.has(move.name.toLowerCase())) move.power *= 1.5; }
    },
    'mega-launcher': {
        onModifyMove: (move, pokemon) => { if (AURA_PULSE_MOVES.has(move.name.toLowerCase())) move.power *= 1.5; }
    },
    'technician': {
        onModifyMove: (move, pokemon) => { if (move.power <= 60) move.power *= 1.5; }
    },
    'iron-fist': {
        onModifyMove: (move, pokemon) => { if (PUNCHING_MOVES.has(move.name.toLowerCase())) move.power *= 1.2; }
    },
    'reckless': {
        onModifyMove: (move, pokemon) => { if (RECOIL_MOVES.has(move.name.toLowerCase())) move.power *= 1.2; }
    },
    'sheer-force': {
        onModifyMove: (move, pokemon) => {
            if (move.meta?.ailment?.name !== 'none' || move.stat_changes?.length > 0) {
                move.power *= 1.3;
                move.sheerForceBoosted = true; // Flag to prevent secondary effects
            }
        }
    },
    'adaptability': {
        onModifyDamage: (damageDetails, pokemon, move) => {
            if (pokemon.types.includes(move.type)) {
                damageDetails.stabMultiplier = 2;
            }
        }
    },
    'battle-armor': {
        onCritImmunity: (target, move, attackerAbility) => {
            // Add this check at the beginning
            if (attackerAbility?.toLowerCase() === 'mold breaker') return false;
            return true;
        }
    },
    'shell-armor': {
        onCritImmunity: (target, move, attackerAbility) => {
            // Add this check at the beginning
            if (attackerAbility?.toLowerCase() === 'mold breaker') return false;
            return true;
        }
    },
    'solid-rock': {
        onModifyDamage: (damageDetails, target, move, attackerAbility) => {
            if (attackerAbility?.toLowerCase() !== 'mold breaker' && damageDetails.effectiveness > 1) {
                damageDetails.finalMultiplier *= 0.75;
            }
        }
    },
    'filter': { // Same as Solid Rock
        onModifyDamage: (damageDetails, target, move, attackerAbility) => {
            if (attackerAbility?.toLowerCase() !== 'mold breaker' && damageDetails.effectiveness > 1) {
                damageDetails.finalMultiplier *= 0.75;
            }
        }
    },
    'thick-fat': {
        onModifyDamage: (damageDetails, target, move, attackerAbility) => {
            if (attackerAbility?.toLowerCase() !== 'mold breaker' && (move.type === 'fire' || move.type === 'ice')) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    'marvel-scale': {
        onModifyStat: (stat, value, pokemon, attacker) => { // Assume engine passes attacker
            if (getEffectiveAbility(attacker)?.toLowerCase() === 'mold breaker') return value;
            return (stat === 'defense' && pokemon.status?.toLowerCase() !== 'none' && !pokemon.isSpecial) ? value * 1.5 : value
        }
    },
    'fur-coat': {
        onModifyDamage: (damageDetails, target, move, attackerAbility) => {
            if (attackerAbility?.toLowerCase() !== 'mold breaker' && !move.isSpecial) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    'fluffy': {
        onModifyDamage: (damageDetails, target, move, attackerAbility) => {
            if (attackerAbility?.toLowerCase() !== 'mold breaker') {
                if (!move.isSpecial) {
                    damageDetails.finalMultiplier *= 0.5;
                }
                // Add this condition for fire weakness
                if (move.type === 'fire') {
                    damageDetails.finalMultiplier *= 2;
                }
            }
        }
    },
    'ice-scales': {
        onModifyDamage: (damageDetails, target, move, attackerAbility) => {
            if (attackerAbility?.toLowerCase() !== 'mold breaker' && move.isSpecial) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    'multiscale': {
        onModifyDamage: (damageDetails, target, move, attackerAbility) => {
            if (attackerAbility?.toLowerCase() !== 'mold breaker' && target.currentHp === target.maxHp) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    'shadow-shield': { // Same as Multiscale
        onModifyDamage: (damageDetails, target, move, attackerAbility) => {
            if (attackerAbility?.toLowerCase() !== 'mold breaker' && target.currentHp === target.maxHp) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    // --- Aura / Field-wide Abilities ---
    'dark-aura': {
        onModifyMove: (move, pokemon) => { if (move.type === 'dark') move.power *= 1.33; }
    },
    'fairy-aura': {
        onModifyMove: (move, pokemon) => { if (move.type === 'fairy') move.power *= 1.33; }
    },
    'sword-of-ruin': {
        onModifyStat: (stat, value, target, attacker) => (stat === 'defense' && getEffectiveAbility(target)?.toLowerCase() !== 'sword-of-ruin') ? value * 0.75 : value
    },
    'beads-of-ruin': {
        onModifyStat: (stat, value, target, attacker) => (stat === 'special-defense' && getEffectiveAbility(target)?.toLowerCase() !== 'beads-of-ruin') ? value * 0.75 : value
    },
    'tablets-of-ruin': {
        onModifyStat: (stat, value, attacker, target) => (stat === 'attack' && getEffectiveAbility(target)?.toLowerCase() !== 'tablets-of-ruin') ? value * 0.75 : value
    },
    'vessel-of-ruin': {
        onModifyStat: (stat, value, attacker, target) => (stat === 'special-attack' && getEffectiveAbility(target)?.toLowerCase() !== 'vessel-of-ruin') ? value * 0.75 : value
    },

    // --- Post-Action & End-of-Turn Abilities ---
    'speed-boost': {
        onEndOfTurn: (pokemon, battleState, newLog, statChanger) => {
            if (pokemon.stat_stages.speed < 6) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Speed Boost raised its speed!` });
                // Use the new helper function
                statChanger(pokemon, 'speed', 1, newLog, battleState);
            }
        }
    },
    'moxie': {
        onAfterKO: (pokemon, target, newLog, statChanger, battleState) => { // Add battleState here
            newLog.push({ type: 'text', text: `${pokemon.name}'s Moxie boosted its Attack!` });
            // Use the new helper function
            statChanger(pokemon, 'attack', 1, newLog, battleState);
        }
    },
    'magic-guard': {
        // This is a "marker" ability. The engine will check for this before applying
        // indirect damage from statuses, hazards, or recoil.
    },
    'poison-heal': {
        onEndOfTurn: (pokemon, battleState, newLog) => {
            if (pokemon.status === 'Poisoned' || pokemon.status === 'Badly Poisoned') {
                if (pokemon.currentHp < pokemon.maxHp) {
                    const healAmount = Math.max(1, Math.floor(pokemon.maxHp / 8));
                    pokemon.currentHp = Math.min(pokemon.maxHp, pokemon.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${pokemon.name} restored health using its Poison Heal!` });
                }
            }
        }
    },

    // --- Contact-Based Abilities ---
    'static': {
        onDamagedByContact: (pokemon, attacker, newLog) => {
            if (attacker.status === 'None') {
                // The DM will control the 30% chance. This hook assumes the chance succeeded.
                attacker.status = 'Paralyzed';
                newLog.push({ type: 'text', text: `${pokemon.name}'s Static paralyzed ${attacker.name}!` });
            }
        }
    },
    'poison-point': {
        onDamagedByContact: (pokemon, attacker, newLog) => {
            if (attacker.status === 'None') {
                // The DM will control the 30% chance. This hook assumes the chance succeeded.
                attacker.status = 'Poisoned';
                newLog.push({ type: 'text', text: `${pokemon.name}'s Poison Point poisoned ${attacker.name}!` });
            }
        }
    },

    // --- Form-Changing Abilities ---
    // The engine will call a generic `resolveFormChange` utility, but these hooks
    // define the trigger condition for that utility.
    'disguise': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog, attackerAbility) => {
            // Add this check at the beginning
            if (attackerAbility?.toLowerCase() === 'mold breaker') return damage;

            if (!pokemon.transformed && damage > 0) {
                const bustedForm = pokemon.forms?.find(f => f.formName === 'mimikyu-busted');
                if (bustedForm) {
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Disguise was busted!` });
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: bustedForm, type: 'RESOLVE' });
                }
                return 0; // Negate the damage
            }
            return damage;
        }
    },
    'zen mode': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog) => {
            const hpAfterDamage = pokemon.currentHp - damage;

            // Check if HP will drop to 50% or less after this hit.
            if (!pokemon.transformed && hpAfterDamage > 0 && hpAfterDamage <= pokemon.maxHp / 2) {
                // 1. Determine which form to look for based on the Pokémon's name.
                const isGalarian = pokemon.name.toLowerCase().includes('galar');
                const targetFormName = isGalarian ? 'darmanitan-galar-zen' : 'darmanitan-zen';

                // 2. Find the form using a robust, case-insensitive search.
                const zenForm = pokemon.forms?.find(
                    f => f.formName?.toLowerCase() === targetFormName.toLowerCase()
                );

                // 3. If the form is found, add the transformation to the queue.
                if (zenForm) {
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Zen Mode was triggered!` });
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: zenForm, type: 'RESOLVE' });
                }
            }
            return damage;
        },
        onEndOfTurn: (pokemon, battleState, newLog) => {
            // This handles reverting the form if HP is restored above 50%.
            if (pokemon.transformed && pokemon.currentHp > pokemon.maxHp / 2) {
                battleState.formChangeQueue.push({ pokemon: pokemon, type: 'REVERT' });
            }
        }
    },
    'ice-face': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog, attackerAbility) => {
            // Add this check at the beginning
            if (attackerAbility?.toLowerCase() === 'mold breaker') return damage;

            if (!pokemon.transformed && !move.isSpecial && damage > 0) {
                const noiceForm = pokemon.forms?.find(f => f.formName === 'eiscue-noice');
                if (noiceForm) {
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Ice Face was broken!` });
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: noiceForm, type: 'RESOLVE' });
                }
                return 0; // Negate the physical damage
            }
            return damage;
        },
        // ... onEndOfTurn logic remains the same
    },
    'stance-change': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            const isOffensive = move.damage_class.name !== 'status';
            if (isOffensive && !pokemon.transformed) {
                const bladeForm = pokemon.forms?.find(f => f.formName === 'aegislash-blade');
                if (bladeForm) {
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: bladeForm, type: 'RESOLVE' });
                }
            } else if (!isOffensive && move.name === 'King\'s Shield' && pokemon.transformed) {
                battleState.formChangeQueue.push({ pokemon: pokemon, type: 'REVERT' });
            }
        }
    },
    'schooling': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            if (!pokemon.transformed && pokemon.currentHp > pokemon.maxHp / 4) {
                const schoolForm = pokemon.forms?.find(f => f.formName === 'wishiwashi-school');
                if (schoolForm) {
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: schoolForm, type: 'RESOLVE' });
                }
            }
        },
        onEndOfTurn: (pokemon, battleState, newLog) => {
            if (pokemon.transformed && pokemon.currentHp <= pokemon.maxHp / 4) {
                battleState.formChangeQueue.push({ pokemon: pokemon, type: 'REVERT' });
            } else if (!pokemon.transformed && pokemon.currentHp > pokemon.maxHp / 4) {
                const schoolForm = pokemon.forms?.find(f => f.formName === 'wishiwashi-school');
                if (schoolForm) {
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: schoolForm, type: 'RESOLVE' });
                }
            }
        }
    },
    'regenerator': {
        onSwitchOut: (pokemon, battleState, newLog) => {
            if (pokemon.currentHp < pokemon.maxHp) {
                const healAmount = Math.floor(pokemon.maxHp / 3);
                pokemon.currentHp = Math.min(pokemon.maxHp, pokemon.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${pokemon.name} restored its health as it withdrew!` });
            }
        }
    },
    'prankster': {
        onModifyPriority: (priority, move) => {
            if (move.damage_class.name === 'status') {
                return priority + 1;
            }
            return priority;
        }
    },
    'mold breaker': {
        // This ability's effects are checked by other abilities.
    },
    'magic-bounce': {
        // This hook returns true if the move should be bounced.
        onBounce: (move) => {
            return REFLECTABLE_MOVES.has(move.name.toLowerCase());
        }
    },
    'sturdy': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog, attackerAbility) => {
            // Mold Breaker and similar abilities bypass Sturdy
            if (attackerAbility?.toLowerCase() === 'mold breaker') {
                return damage;
            }

            // Check if HP is full and damage is lethal
            if (pokemon.currentHp === pokemon.maxHp && damage >= pokemon.currentHp) {
                newLog.push({ type: 'text', text: `${pokemon.name} endured the hit with Sturdy!` });
                // Return damage that leaves the Pokémon with exactly 1 HP
                return pokemon.currentHp - 1;
            }

            // Otherwise, return the original damage
            return damage;
        }
    },
    'contrary': {
        // This hook needs to be created and called by your battle engine
        onModifyStatStage: (stageChange, pokemon, newLog) => {
            // Invert the stage change
            const invertedChange = stageChange * -1;

            // Announce the effect
            if (invertedChange !== 0) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Contrary inverted the stat change!` });
            }

            return invertedChange;
        }
    },
    'unaware': {
        // This is a marker ability. The primary logic is handled directly
        // in the calculateDamage function in useBattleEngine.js because
        // it needs to know about both the attacker and defender's stats.
    },
    'simple': {
        // This is a marker ability. The logic is handled directly
        // in the statChanger function in useBattleEngine.js
        // to keep all stat modifications centralized.
    },
    'wonder-guard': {
        // This is a marker ability. The logic is handled directly
        // in the calculateDamage function, as it needs access to the
        // final type effectiveness calculation.
    },
    'water-absorb': {
        onCheckImmunity: (move, pokemon, attackerAbility, newLog) => {
            if (move.type === 'water') {
                newLog.push({ type: 'text', text: `${pokemon.name} absorbed the water! ` });
                if (pokemon.currentHp < pokemon.maxHp) {
                    const healAmount = Math.floor(pokemon.maxHp / 4);
                    pokemon.currentHp = Math.min(pokemon.maxHp, pokemon.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${pokemon.name} restored health!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },
    'volt-absorb': {
        onCheckImmunity: (move, pokemon, attackerAbility, newLog) => {
            if (move.type === 'electric') {
                newLog.push({ type: 'text', text: `${pokemon.name} absorbed the electricity! ` });
                if (pokemon.currentHp < pokemon.maxHp) {
                    const healAmount = Math.floor(pokemon.maxHp / 4);
                    pokemon.currentHp = Math.min(pokemon.maxHp, pokemon.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${pokemon.name} restored health!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },
    'sap-sipper': {
        onCheckImmunity: (move, pokemon, attackerAbility, newLog, statChanger, battleState) => {
            if (move.type === 'grass') {
                newLog.push({ type: 'text', text: `${pokemon.name} absorbed the plant energy! ` });

                // Sap Sipper also raises the user's Attack stat.
                if (pokemon.stat_stages.attack < 6) {
                    // We need the engine's statChanger function for this.
                    // We'll need to pass it into the hook call.
                    if (statChanger) {
                        statChanger(pokemon, 'attack', 1, newLog, battleState);
                        newLog.push({ type: 'text', text: `${pokemon.name}'s Attack rose!` });
                    }
                }
                return true; // Grant immunity
            }
            return false;
        }
    },
    'protean': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            const moveType = move.type;
            // Check if the user is already this type to avoid spamming the log
            if (pokemon.types.length === 1 && pokemon.types[0] === moveType) {
                return;
            }

            // Change the user's type to the move's type
            pokemon.types = [moveType];
            newLog.push({ type: 'text', text: `${pokemon.name}'s Protean changed its type to ${move.type.toUpperCase()}!` });
        }
    },
    'libero': {
        // Libero is functionally identical to Protean
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            const moveType = move.type;
            if (pokemon.types.length === 1 && pokemon.types[0] === moveType) {
                return;
            }

            pokemon.types = [moveType];
            newLog.push({ type: 'text', text: `${pokemon.name}'s Libero changed its type to ${move.type.toUpperCase()}!` });
        }
    },
    'sand-rush': {
        onModifyStat: (stat, value, pokemon, battleState) => {
            if (stat === 'speed' && battleState.field.weather === 'sandstorm') {
                return value * 2;
            }
            return value;
        }
    },

    'slush-rush': {
        onModifyStat: (stat, value, pokemon, battleState) => {
            if (stat === 'speed' && battleState.field.weather === 'snow') {
                return value * 2;
            }
            return value;
        }
    },
    'protosynthesis': {
        onSwitchIn: (pokemon, battleState, newLog, statChanger) => {
            // Activates in harsh sunlight OR if holding Booster Energy
            const isSunlight = battleState.field.weather === 'sunshine' || battleState.field.weather === 'harsh-sunshine';
            const holdsBoosterEnergy = pokemon.heldItem?.name.toLowerCase() === 'booster energy';

            if (pokemon.boosterApplied) return; // Prevent re-activation

            if (isSunlight || holdsBoosterEnergy) {
                // Find the highest stat
                let highestStat = 'attack';
                let highestValue = pokemon.stats.attack;
                ['defense', 'special-attack', 'special-defense', 'speed'].forEach(stat => {
                    if (pokemon.stats[stat] > highestValue) {
                        highestValue = pokemon.stats[stat];
                        highestStat = stat;
                    }
                });

                // Apply the boost
                const boostAmount = highestStat === 'speed' ? 1.5 : 1.3;
                // We'll store the boost directly on the pokemon object for the engine to use.
                pokemon.boosterBoost = { stat: highestStat, multiplier: boostAmount };
                pokemon.boosterApplied = true;
                newLog.push({ type: 'text', text: `${pokemon.name}'s Protosynthesis activated, boosting its ${highestStat.replace('-', ' ')}!` });

                // Consume Booster Energy if it was the trigger
                if (holdsBoosterEnergy) {
                    pokemon.heldItem = null;
                }
            }
        }
    },

    'quark-drive': {
        onSwitchIn: (pokemon, battleState, newLog, statChanger) => {
            // Activates in Electric Terrain OR if holding Booster Energy
            const isElectricTerrain = battleState.field.terrain === 'electric-terrain';
            const holdsBoosterEnergy = pokemon.heldItem?.name.toLowerCase() === 'booster energy';

            if (pokemon.boosterApplied) return;

            if (isElectricTerrain || holdsBoosterEnergy) {
                // Find the highest stat (same logic as Protosynthesis)
                let highestStat = 'attack';
                let highestValue = pokemon.stats.attack;
                ['defense', 'special-attack', 'special-defense', 'speed'].forEach(stat => {
                    if (pokemon.stats[stat] > highestValue) {
                        highestValue = pokemon.stats[stat];
                        highestStat = stat;
                    }
                });

                const boostAmount = highestStat === 'speed' ? 1.5 : 1.3;
                pokemon.boosterBoost = { stat: highestStat, multiplier: boostAmount };
                pokemon.boosterApplied = true;
                newLog.push({ type: 'text', text: `${pokemon.name}'s Quark Drive activated, boosting its ${highestStat.replace('-', ' ')}!` });

                if (holdsBoosterEnergy) {
                    pokemon.heldItem = null;
                }
            }
        }
    },
    'defiant': {
        onStatLowered: (pokemon, battleState, newLog, statChanger) => {
            // Check if Attack is not already maxed out
            if (pokemon.stat_stages['attack'] < 6) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Defiant sharply raised its Attack!` });
                // Sharply raise Attack (+2 stages)
                statChanger(pokemon, 'attack', 2, newLog, battleState);
            }
        }
    },

    'competitive': {
        onStatLowered: (pokemon, battleState, newLog, statChanger) => {
            // Check if Special Attack is not already maxed out
            if (pokemon.stat_stages['special-attack'] < 6) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Competitive sharply raised its Sp. Atk!` });
                // Sharply raise Special Attack (+2 stages)
                statChanger(pokemon, 'special-attack', 2, newLog, battleState);
            }
        }
    },

    'justified': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog, attackerAbility, statChanger) => {
            // Activates if hit by a Dark-type move, damage was dealt, and Attack is not maxed out
            if (move.type === 'dark' && damage > 0 && pokemon.stat_stages['attack'] < 6) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Justified raised its Attack!` });
                // Raise Attack (+1 stage)
                statChanger(pokemon, 'attack', 1, newLog, battleState);
            }
            return damage; // Always return the damage
        }
    },
    'flash-fire': {
        onCheckImmunity: (move, pokemon, attackerAbility, newLog) => {
            if (move.type === 'fire') {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Flash Fire activated!` });
                // Set a flag on the Pokémon object that its fire moves are now boosted.
                pokemon.flashFireBoosted = true;
                return true; // Grant immunity
            }
            return false;
        },
        onModifyMove: (move, pokemon) => {
            // If the boost is active and the move is a Fire-type move, increase its power.
            if (pokemon.flashFireBoosted && move.type === 'fire') {
                move.power *= 1.5;
            }
        }
    },

    'motor-drive': {
        onCheckImmunity: (move, pokemon, attackerAbility, newLog, statChanger, battleState) => {
            if (move.type === 'electric') {
                newLog.push({ type: 'text', text: `${pokemon.name} absorbed the electricity!` });
                if (pokemon.stat_stages.speed < 6) {
                    statChanger(pokemon, 'speed', 1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Speed rose!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },

    'lightning-rod': {
        onRedirect: (move) => move.type === 'electric',
        onCheckImmunity: (move, pokemon, attackerAbility, newLog, statChanger, battleState) => {
            if (move.type === 'electric') {
                newLog.push({ type: 'text', text: `The attack was absorbed by ${pokemon.name}!` });
                if (pokemon.stat_stages['special-attack'] < 6) {
                    statChanger(pokemon, 'special-attack', 1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Sp. Atk rose!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },

    'storm-drain': {
        onRedirect: (move) => move.type === 'water',
        onCheckImmunity: (move, pokemon, attackerAbility, newLog, statChanger, battleState) => {
            if (move.type === 'water') {
                newLog.push({ type: 'text', text: `The attack was absorbed by ${pokemon.name}!` });
                if (pokemon.stat_stages['special-attack'] < 6) {
                    statChanger(pokemon, 'special-attack', 1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Sp. Atk rose!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },
    'mummy': {
        onDamagedByContact: (pokemon, attacker, newLog, statChanger, battleState) => {
            const unchangeableAbilities = ['multitype', 'stance-change', 'schooling', 'mummy'];
            const attackerAbility = getEffectiveAbility(attacker)?.toLowerCase();

            if (attackerAbility && !unchangeableAbilities.includes(attackerAbility)) {
                newLog.push({ type: 'text', text: `${attacker.name}'s ability became Mummy!` });
                // Store the original ability if it hasn't been stored already
                if (!attacker.originalAbility) {
                    attacker.originalAbility = attacker.ability;
                }
                // Change the ability
                attacker.ability = 'Mummy';
            }
        }
    },

    'gooey': {
        onDamagedByContact: (pokemon, attacker, newLog, statChanger, battleState) => {
            // Check if Speed can be lowered
            if (attacker.stat_stages['speed'] > -6) {
                newLog.push({ type: 'text', text: `${attacker.name}'s speed was lowered by ${pokemon.name}'s Gooey!` });
                // Lower Speed by 1 stage
                statChanger(attacker, 'speed', -1, newLog, battleState);
            }
        }
    },

    // Tangling Hair has the exact same effect as Gooey
    'tangling-hair': {
        onDamagedByContact: (pokemon, attacker, newLog, statChanger, battleState) => {
            if (attacker.stat_stages['speed'] > -6) {
                newLog.push({ type: 'text', text: `${attacker.name}'s speed was lowered by ${pokemon.name}'s Tangling Hair!` });
                statChanger(attacker, 'speed', -1, newLog, battleState);
            }
        }
    },
    'tough-claws': {
        onModifyMove: (move, pokemon) => {
            if (CONTACT_MOVES.has(move.name.toLowerCase())) {
                move.power *= 1.3;
            }
        }
    },

    'tinted-lens': {
        onModifyDamage: (damageDetails, pokemon, move) => {
            // Check if the move is "not very effective"
            if (damageDetails.effectiveness < 1 && damageDetails.effectiveness > 0) {
                // Double the final damage multiplier
                damageDetails.finalMultiplier *= 2;
            }
        }
    },

    'sniper': {
        // This is a "marker" ability. The primary logic is handled directly
        // in the calculateDamage function in useBattleEngine.js to modify
        // the critical hit multiplier.
    },

    'unburden': {
        // This is a "marker" ability. The primary logic is handled directly
        // in the calculateTurnOrderSpeed function in useBattleEngine.js by
        // checking if the Pokémon's originalHeldItem is gone.
    },

    'neutralizing-gas': {
        // This is a "marker" ability. Its logic is handled directly in the
        // getEffectiveAbility helper function in useBattleEngine.js, where it
        // suppresses the abilities of all other Pokémon on the field.
    },

    'moody': {
        onEndOfTurn: (pokemon, battleState, newLog, statChanger) => {
            const allStats = ['attack', 'defense', 'special-attack', 'special-defense', 'speed', 'accuracy', 'evasion'];

            const statsToBoost = allStats.filter(stat => pokemon.stat_stages[stat] < 6);
            const statsToLower = allStats.filter(stat => pokemon.stat_stages[stat] > -6);

            if (statsToBoost.length > 0) {
                // Pick a random stat to boost
                const randomBoostStat = statsToBoost[Math.floor(Math.random() * statsToBoost.length)];
                newLog.push({ type: 'text', text: `${pokemon.name}'s Moody boosted its ${randomBoostStat.replace('-', ' ')}!` });
                statChanger(pokemon, randomBoostStat, 2, newLog, battleState);

                // Remove the boosted stat from the potential stats to lower
                const index = statsToLower.indexOf(randomBoostStat);
                if (index > -1) {
                    statsToLower.splice(index, 1);
                }
            }

            if (statsToLower.length > 0) {
                // Pick a random stat to lower
                const randomLowerStat = statsToLower[Math.floor(Math.random() * statsToLower.length)];
                newLog.push({ type: 'text', text: `${pokemon.name}'s Moody lowered its ${randomLowerStat.replace('-', ' ')}!` });
                statChanger(pokemon, randomLowerStat, -1, newLog, battleState);
            }
        }
    },
    'imposter': {
        onSwitchIn: (pokemon, battleState, newLog, statChanger, handleTransform) => {
            // Find pokemon's team and slot index
            const pokemonTeamIndex = battleState.teams.findIndex(t => t.pokemon.some(p => p.id === pokemon.id));
            if (pokemonTeamIndex === -1) return;
            const pokemonTeamId = battleState.teams[pokemonTeamIndex].id;
            const pokemonSlotIndex = battleState.activePokemonIndices[pokemonTeamId].findIndex(i => battleState.teams[pokemonTeamIndex].pokemon[i]?.id === pokemon.id);

            // Find the opponent in the corresponding slot
            const opponentTeamIndex = pokemonTeamIndex === 0 ? 1 : 0;
            const opponentTeamId = battleState.teams[opponentTeamIndex].id;
            const opponentGlobalIndex = battleState.activePokemonIndices[opponentTeamId][pokemonSlotIndex];
            const opponent = battleState.teams[opponentTeamIndex].pokemon[opponentGlobalIndex];

            // If a valid opponent exists, transform into it
            if (opponent && !opponent.fainted) {
                handleTransform(pokemon, opponent, newLog);
            } else {
                newLog.push({ type: 'text', text: `${pokemon.name} has no one to transform into!` });
            }
        }
    },
    'soundproof': {
        onCheckImmunity: (move, pokemon, attackerAbility, newLog) => {
            if (SOUND_MOVES.has(move.name.toLowerCase())) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Soundproof blocks the move!` });
                return true; // Grant immunity
            }
            return false;
        }
    },

    'stalwart': {
        // This is a "marker" ability. Its logic is handled directly in the
        // redirection block in useBattleEngine.js to bypass redirection checks.
    },
    'propeller-tail': {
        // Functionally identical to Stalwart.
    },

    'aerilate': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'flying';
                move.power *= 1.2;
                newLog.push({ type: 'text', text: `The move became Flying-type due to Aerilate!` });
            }
        }
    },
    'pixilate': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'fairy';
                move.power *= 1.2;
                newLog.push({ type: 'text', text: `The move became Fairy-type due to Pixilate!` });
            }
        }
    },
    'refrigerate': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'ice';
                move.power *= 1.2;
                newLog.push({ type: 'text', text: `The move became Ice-type due to Refrigerate!` });
            }
        }
    },
    'galvanize': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'electric';
                move.power *= 1.2;
                newLog.push({ type: 'text', text: `The move became Electric-type due to Galvanize!` });
            }
        }
    },
    'harvest': {
        onEndOfTurn: (pokemon, battleState, newLog) => {
            // Check if a berry was consumed and the Pokémon is holding nothing
            if (pokemon.lastConsumedItem && !pokemon.heldItem && pokemon.lastConsumedItem.name.includes('berry')) {
                const weather = battleState.field.weather;
                const chance = (weather === 'sunshine' || weather === 'harsh-sunshine') ? 100 : 50;

                // Prompt the DM to make a roll. Do not restore the item automatically.
                newLog.push({
                    type: 'text',
                    text: `${pokemon.name}'s Harvest might restore its ${pokemon.lastConsumedItem.name}! (DM: ${chance}% chance)`
                });

                // Clear the consumed item slot so this doesn't trigger every turn.
                // If the DM's roll succeeds, they will manually give the item back.
                pokemon.lastConsumedItem = null;
            }
        }
    },
    'analytic': {
        onModifyMove: (move, pokemon, battleState) => {
            // Find the last Pokémon ID scheduled to move
            const lastToMoveId = battleState.turnOrder?.[battleState.turnOrder.length - 1];
            // If the user of this move is the last to move, boost power
            if (pokemon.id === lastToMoveId) {
                move.power *= 1.3;
            }
        }
    },

    'download': {
        onSwitchIn: (pokemon, battleState, newLog, statChanger) => {
            const opponents = getActiveOpponents(pokemon, battleState);
            if (opponents.length === 0) return;

            // Sum the defenses of all active opponents
            let totalDef = 0;
            let totalSpDef = 0;
            opponents.forEach(opp => {
                totalDef += calculateStat(opp.stats.defense, opp.level) * getStatModifier(opp.stat_stages.defense);
                totalSpDef += calculateStat(opp.stats['special-defense'], opp.level) * getStatModifier(opp.stat_stages['special-defense']);
            });

            // Raise the corresponding attacking stat
            if (totalDef < totalSpDef) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Download raised its Attack!` });
                statChanger(pokemon, 'attack', 1, newLog, battleState);
            } else {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Download raised its Sp. Atk!` });
                statChanger(pokemon, 'special-attack', 1, newLog, battleState);
            }
        }
    },

    'mold-breaker': {
        // This is a "marker ability". Other abilities (like Levitate, Sturdy, Flash Fire)
        // are responsible for checking if their effect should be ignored by Mold Breaker.
        // This entry makes it official in the ability list.
    },

    'pressure': {
        // This is a "marker ability". The engine's PP deduction logic would need to be
        // modified to check if the target of a move has Pressure. For this DnD system,
        // the DM will need to manually deduct an extra PP.
    },

    'stall': {
        // This is a "marker ability". Its logic is handled directly in the
        // calculateTurnOrderSpeed function in useBattleEngine.js.
    },

    'unnerve': {
        // This is a "marker ability". Its logic is handled directly in the engine
        // before end-of-turn item effects are processed.
    },

    // --- Also, a required update to existing weather abilities for Utility Umbrella ---
    'swift-swim': {
        onModifyStat: (stat, value, pokemon, battleState) => {
            if (stat === 'speed' && (battleState.field.weather === 'rain' || battleState.field.weather === 'heavy-rain')) {
                // Add a check for Utility Umbrella
                if (pokemon.heldItem?.name.toLowerCase() === 'utility-umbrella') return value;
                return value * 2;
            }
            return value;
        }
    },

    'chlorophyll': {
        onModifyStat: (stat, value, pokemon, battleState) => {
            if (stat === 'speed' && (battleState.field.weather === 'sunshine' || battleState.field.weather === 'harsh-sunshine')) {
                // Add a check for Utility Umbrella
                if (pokemon.heldItem?.name.toLowerCase() === 'utility-umbrella') return value;
                return value * 2;
            }
            return value;
        }
    },
};