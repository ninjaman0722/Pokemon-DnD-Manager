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
import { calculateStatChange } from '../hooks/battle-engine/stateModifiers';
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
                });
            }
        }
    },
    'drizzle': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.id === 'damp-rock' ? 8 : 5;
            setWeather('rain', turns, 'It started to rain!', pokemon, battleState, newLog);
        }
    },
    'primordial-sea': {
        onSwitchIn: (pokemon, battleState, newLog) => setWeather('heavy-rain', 9999, 'A heavy rain began to fall!', pokemon, battleState, newLog)
    },
    'sand-stream': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.id === 'smooth-rock' ? 8 : 5;
            setWeather('sandstorm', turns, 'A sandstorm kicked up!', pokemon, battleState, newLog);
        }
    },
    'drought': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.id === 'heat-rock' ? 8 : 5;
            setWeather('sunshine', turns, 'The sunlight turned harsh!', pokemon, battleState, newLog);
        }
    },
    'orichalcum-pulse': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.id === 'heat-rock' ? 8 : 5;
            setWeather('sunshine', turns, 'The sunlight turned harsh!', pokemon, battleState, newLog);
        }
    },
    'desolate-land': {
        onSwitchIn: (pokemon, battleState, newLog) => setWeather('harsh-sunshine', 9999, 'The sunlight became extremely harsh!', pokemon, battleState, newLog)
    },
    'snow-warning': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const turns = pokemon.heldItem?.id === 'icy-rock' ? 8 : 5;
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
        onCheckImmunity: (move, target, attackerAbilityId) => {
            if (attackerAbilityId === 'mold-breaker') return false;
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
    'technician': {
        // The parameter 'move' should be 'details'
        onModifyMove: (details, pokemon) => {
            // The property is details.power, not move.power
            if (details.power <= 60) {
                details.power *= 1.5;
            }
        }
    },
    'strong-jaw': {
        onModifyMove: (details, pokemon) => { if (BITING_MOVES.has(details.id)) details.power *= 1.5; }
    },
    'mega-launcher': {
        onModifyMove: (details, pokemon) => { if (AURA_PULSE_MOVES.has(details.id)) details.power *= 1.5; }
    },
    'iron-fist': {
        onModifyMove: (details, pokemon) => { if (PUNCHING_MOVES.has(details.id)) details.power *= 1.2; }
    },
    'reckless': {
        onModifyMove: (details, pokemon) => { if (RECOIL_MOVES.has(details.id)) details.power *= 1.2; }
    },
    'sheer-force': {
        onModifyMove: (details, pokemon) => {
            if (details.meta?.ailment?.name !== 'none' || details.stat_changes?.length > 0) {
                details.power *= 1.3;
                details.sheerForceBoosted = true;
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
        onCritImmunity: (target, move, attackerAbilityId) => {
            if (attackerAbilityId === 'mold-breaker') return false;
            return true;
        }
    },
    'shell-armor': {
        onCritImmunity: (target, move, attackerAbilityId) => {
            if (attackerAbilityId === 'mold-breaker') return false;
            return true;
        }
    },
    'solid-rock': {
        onModifyDamage: (damageDetails, target, move, attackerAbilityId) => {
            if (attackerAbilityId !== 'mold-breaker' && damageDetails.effectiveness > 1) {
                damageDetails.finalMultiplier *= 0.75;
            }
        }
    },
    'filter': {
        onModifyDamage: (damageDetails, target, move, attackerAbilityId) => {
            if (attackerAbilityId !== 'mold-breaker' && damageDetails.effectiveness > 1) {
                damageDetails.finalMultiplier *= 0.75;
            }
        }
    },
    'thick-fat': {
        onModifyDamage: (damageDetails, target, move, attackerAbilityId) => {
            if (attackerAbilityId !== 'mold-breaker' && (move.type === 'fire' || move.type === 'ice')) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    'marvel-scale': {
        onModifyStat: (stat, value, pokemon, attacker) => {
            if (getEffectiveAbility(attacker)?.id === 'mold-breaker') return value;
            return (stat === 'defense' && pokemon.status?.toLowerCase() !== 'none' && !pokemon.isSpecial) ? value * 1.5 : value
        }
    },
    'fur-coat': {
        onModifyDamage: (damageDetails, target, move, attackerAbilityId) => {
            if (attackerAbilityId !== 'mold-breaker' && !move.isSpecial) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    'fluffy': {
        onModifyDamage: (damageDetails, target, move, attackerAbilityId) => {
            if (attackerAbilityId !== 'mold-breaker') {
                if (!move.isSpecial) {
                    damageDetails.finalMultiplier *= 0.5;
                }
                if (move.type === 'fire') {
                    damageDetails.finalMultiplier *= 2;
                }
            }
        }
    },
    'ice-scales': {
        onModifyDamage: (damageDetails, target, move, attackerAbilityId) => {
            if (attackerAbilityId !== 'mold-breaker' && move.isSpecial) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    'multiscale': {
        onModifyDamage: (damageDetails, target, move, attackerAbilityId) => {
            if (attackerAbilityId !== 'mold-breaker' && target.currentHp === target.maxHp) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    'shadow-shield': {
        onModifyDamage: (damageDetails, target, move, attackerAbilityId) => {
            if (attackerAbilityId !== 'mold-breaker' && target.currentHp === target.maxHp) {
                damageDetails.finalMultiplier *= 0.5;
            }
        }
    },
    'dark-aura': {
        onModifyMove: (move, pokemon) => { if (move.type === 'dark') move.power *= 1.33; }
    },
    'fairy-aura': {
        onModifyMove: (move, pokemon) => { if (move.type === 'fairy') move.power *= 1.33; }
    },
    'sword-of-ruin': {
        onModifyStat: (stat, value, target, attacker) => (stat === 'defense' && getEffectiveAbility(target)?.id !== 'sword-of-ruin') ? value * 0.75 : value
    },
    'beads-of-ruin': {
        onModifyStat: (stat, value, target, attacker) => (stat === 'special-defense' && getEffectiveAbility(target)?.id !== 'beads-of-ruin') ? value * 0.75 : value
    },
    'tablets-of-ruin': {
        onModifyStat: (stat, value, attacker, target) => (stat === 'attack' && getEffectiveAbility(target)?.id !== 'tablets-of-ruin') ? value * 0.75 : value
    },
    'vessel-of-ruin': {
        onModifyStat: (stat, value, attacker, target) => (stat === 'special-attack' && getEffectiveAbility(target)?.id !== 'vessel-of-ruin') ? value * 0.75 : value
    },

    'speed-boost': {
        onEndOfTurn: (pokemon, battleState, newLog, statChanger) => {
            if (pokemon.stat_stages.speed < 6) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Speed Boost raised its speed!` });
                statChanger(pokemon, 'speed', 1, newLog, battleState);
            }
        }
    },
    'moxie': {
        onAfterKO: (pokemon, target, newLog, statChanger, battleState) => {
            newLog.push({ type: 'text', text: `${pokemon.name}'s Moxie boosted its Attack!` });
            statChanger(pokemon, 'attack', 1, newLog, battleState);
        }
    },
    'magic-guard': {
        // Marker ability
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

    'static': {
        onDamagedByContact: (pokemon, attacker, newLog) => {
            if (attacker.status === 'None' && !attacker.types.includes('electric')) {
                attacker.status = 'Paralyzed';
                newLog.push({ type: 'text', text: `${pokemon.name}'s Static paralyzed ${attacker.name}!` });
            }
        }
    },
    'poison-point': {
        onDamagedByContact: (pokemon, attacker, newLog) => {
            if (attacker.status === 'None') {
                attacker.status = 'Poisoned';
                newLog.push({ type: 'text', text: `${pokemon.name}'s Poison Point poisoned ${attacker.name}!` });
            }
        }
    },

    'disguise': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog, attackerAbilityId) => {
            if (attackerAbilityId === 'mold-breaker') return damage;

            if (!pokemon.transformed && damage > 0) {
                const bustedForm = pokemon.forms?.find(f => f.formName === 'mimikyu-busted');
                if (bustedForm) {
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Disguise was busted!` });
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: bustedForm, type: 'RESOLVE' });
                }
                return 0;
            }
            return damage;
        }
    },
    'zen-mode': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog) => {
            const hpAfterDamage = pokemon.currentHp - damage;
            if (!pokemon.transformed && hpAfterDamage > 0 && hpAfterDamage <= pokemon.maxHp / 2) {
                const isGalarian = pokemon.id.includes('galar');
                const targetFormName = isGalarian ? 'darmanitan-galar-zen' : 'darmanitan-zen';
                const zenForm = pokemon.forms?.find(f => f.formName === targetFormName);
                if (zenForm) {
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Zen Mode was triggered!` });
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: zenForm, type: 'RESOLVE' });
                }
            }
            return damage;
        },
        onEndOfTurn: (pokemon, battleState, newLog) => {
            if (pokemon.transformed && pokemon.currentHp > pokemon.maxHp / 2) {
                battleState.formChangeQueue.push({ pokemon: pokemon, type: 'REVERT' });
            }
        }
    },
    'ice-face': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog, attackerAbilityId) => {
            if (attackerAbilityId === 'mold-breaker') return damage;

            if (!pokemon.transformed && !move.isSpecial && damage > 0) {
                const noiceForm = pokemon.forms?.find(f => f.formName === 'eiscue-noice');
                if (noiceForm) {
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Ice Face was broken!` });
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: noiceForm, type: 'RESOLVE' });
                }
                return 0;
            }
            return damage;
        },
    },
    'stance-change': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            const isOffensive = move.damage_class.name !== 'status';
            if (isOffensive && !pokemon.transformed) {
                const bladeForm = pokemon.forms?.find(f => f.formName === 'aegislash-blade');
                if (bladeForm) {
                    battleState.formChangeQueue.push({ pokemon: pokemon, form: bladeForm, type: 'RESOLVE' });
                }
            } else if (!isOffensive && move.id === 'kings-shield' && pokemon.transformed) {
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
    'magic-bounce': {
        onBounce: (move) => {
            return REFLECTABLE_MOVES.has(move.id);
        }
    },
    'sturdy': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog, attackerAbilityId) => {
            if (attackerAbilityId === 'mold-breaker') {
                return damage;
            }
            if (pokemon.currentHp === pokemon.maxHp && damage >= pokemon.currentHp) {
                newLog.push({ type: 'text', text: `${pokemon.name} endured the hit with Sturdy!` });
                return pokemon.currentHp - 1;
            }
            return damage;
        }
    },
    'contrary': {
        onModifyStatStage: (stageChange, pokemon, newLog) => {
            const invertedChange = stageChange * -1;
            if (invertedChange !== 0) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Contrary inverted the stat change!` });
            }
            return invertedChange;
        }
    },
    'trace': {
        onSwitchIn: (pokemon, battleState, newLog) => {
            const opponents = getActiveOpponents(pokemon, battleState);
            // Trace only works in singles, so we target the first opponent.
            if (opponents.length > 0) {
                const target = opponents[0];
                const targetAbilityId = getEffectiveAbility(target, battleState)?.id;

                // Abilities that cannot be copied by Trace
                const untraceableAbilities = ['trace', 'multitype', 'stance-change', 'schooling', 'comatose', 'disguise', 'power-construct', 'zen-mode', 'imposter'];

                if (targetAbilityId && !untraceableAbilities.includes(targetAbilityId)) {
                    // Copy the ability
                    pokemon.ability = { ...target.ability };
                    newLog.push({ type: 'text', text: `${pokemon.name} traced ${target.name}'s ${target.ability.name}!` });

                    // --- IMPORTANT ---
                    // Now, immediately trigger the onSwitchIn effect of the NEWLY TRACED ability.
                    const newAbilityId = pokemon.ability.id;
                    if (abilityEffects[newAbilityId]?.onSwitchIn) {
                        const statChanger = (p, stat, change) => {
                            const { updatedTarget, newLog: statLog } = calculateStatChange(p, stat, change, battleState);
                            Object.assign(p, updatedTarget);
                            newLog.push(...statLog);
                        };
                        abilityEffects[newAbilityId].onSwitchIn(pokemon, battleState, newLog, statChanger);
                    }
                }
            }
        }
    },

    'water-absorb': {
        onCheckImmunity: (move) => move.type === 'water'
    },
    'volt-absorb': {
        onCheckImmunity: (move) => move.type === 'electric'
    },
    'sap-sipper': {
        onCheckImmunity: (move, pokemon, attackerAbilityId, newLog, statChanger, battleState) => {
            if (move.type === 'grass') {
                newLog.push({ type: 'text', text: `${pokemon.name} absorbed the plant energy! ` });
                if (pokemon.stat_stages.attack < 6) {
                    if (statChanger) {
                        statChanger(pokemon, 'attack', 1, newLog, battleState);
                        newLog.push({ type: 'text', text: `${pokemon.name}'s Attack rose!` });
                    }
                }
                return true;
            }
            return false;
        }
    },
    'protean': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            const moveType = move.type;
            if (pokemon.types.length === 1 && pokemon.types[0] === moveType) {
                return;
            }
            pokemon.types = [moveType];
            newLog.push({ type: 'text', text: `${pokemon.name}'s Protean changed its type to ${move.type.toUpperCase()}!` });
        }
    },
    'libero': {
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
            const isSunlight = battleState.field.weather === 'sunshine' || battleState.field.weather === 'harsh-sunshine';
            const holdsBoosterEnergy = pokemon.heldItem?.id === 'booster-energy';

            if (pokemon.boosterApplied) return;

            if (isSunlight || holdsBoosterEnergy) {
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
                newLog.push({ type: 'text', text: `${pokemon.name}'s Protosynthesis activated, boosting its ${highestStat.replace('-', ' ')}!` });

                if (holdsBoosterEnergy) {
                    pokemon.heldItem = null;
                }
            }
        }
    },

    'quark-drive': {
        onSwitchIn: (pokemon, battleState, newLog, statChanger) => {
            const isElectricTerrain = battleState.field.terrain === 'electric-terrain';
            const holdsBoosterEnergy = pokemon.heldItem?.id === 'booster-energy';
            if (pokemon.boosterApplied) return;
            if (isElectricTerrain || holdsBoosterEnergy) {
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
            if (pokemon.stat_stages['attack'] < 6) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Defiant sharply raised its Attack!` });
                statChanger(pokemon, 'attack', 2, newLog, battleState);
            }
        }
    },

    'competitive': {
        onStatLowered: (pokemon, battleState, newLog, statChanger) => {
            if (pokemon.stat_stages['special-attack'] < 6) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Competitive sharply raised its Sp. Atk!` });
                statChanger(pokemon, 'special-attack', 2, newLog, battleState);
            }
        }
    },

    'justified': {
        onTakeDamage: (damage, pokemon, move, battleState, newLog, attackerAbilityId, statChanger) => {
            if (move.type === 'dark' && damage > 0 && pokemon.stat_stages['attack'] < 6) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Justified raised its Attack!` });
                statChanger(pokemon, 'attack', 1, newLog, battleState);
            }
            return damage;
        }
    },
    'flash-fire': {
        onCheckImmunity: (move, pokemon, attackerAbilityId, newLog) => {
            if (move.type === 'fire') {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Flash Fire activated!` });
                pokemon.flashFireBoosted = true;
                return true;
            }
            return false;
        },
        onModifyMove: (move, pokemon) => {
            if (pokemon.flashFireBoosted && move.type === 'fire') {
                move.power *= 1.5;
            }
        }
    },

    'motor-drive': {
        onCheckImmunity: (move, pokemon, attackerAbilityId, newLog, statChanger, battleState) => {
            if (move.type === 'electric') {
                newLog.push({ type: 'text', text: `${pokemon.name} absorbed the electricity!` });
                if (pokemon.stat_stages.speed < 6) {
                    statChanger(pokemon, 'speed', 1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Speed rose!` });
                }
                return true;
            }
            return false;
        }
    },

    'lightning-rod': {
        onRedirect: (move) => move.type === 'electric',
        onCheckImmunity: (move, pokemon, attackerAbilityId, newLog, statChanger, battleState) => {
            if (move.type === 'electric') {
                newLog.push({ type: 'text', text: `The attack was absorbed by ${pokemon.name}!` });
                if (pokemon.stat_stages['special-attack'] < 6) {
                    statChanger(pokemon, 'special-attack', 1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Sp. Atk rose!` });
                }
                return true;
            }
            return false;
        }
    },

    'storm-drain': {
        onRedirect: (move) => move.type === 'water',
        onCheckImmunity: (move, pokemon, attackerAbilityId, newLog, statChanger, battleState) => {
            if (move.type === 'water') {
                newLog.push({ type: 'text', text: `The attack was absorbed by ${pokemon.name}!` });
                if (pokemon.stat_stages['special-attack'] < 6) {
                    statChanger(pokemon, 'special-attack', 1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${pokemon.name}'s Sp. Atk rose!` });
                }
                return true;
            }
            return false;
        }
    },
    'mummy': {
        onDamagedByContact: (pokemon, attacker, newLog, statChanger, battleState) => {
            const unchangeableAbilities = ['multitype', 'stance-change', 'schooling', 'mummy'];
            const attackerAbilityId = getEffectiveAbility(attacker)?.id;

            if (attackerAbilityId && !unchangeableAbilities.includes(attackerAbilityId)) {
                newLog.push({ type: 'text', text: `${attacker.name}'s ability became Mummy!` });
                if (!attacker.originalAbility) {
                    attacker.originalAbility = attacker.ability;
                }
                attacker.ability = { name: "Mummy", id: "mummy" }; // Set to the ability object
            }
        }
    },

    'gooey': {
        onDamagedByContact: (pokemon, attacker, newLog, statChanger, battleState) => {
            if (attacker.stat_stages['speed'] > -6) {
                newLog.push({ type: 'text', text: `${attacker.name}'s speed was lowered by ${pokemon.name}'s Gooey!` });
                statChanger(attacker, 'speed', -1, newLog, battleState);
            }
        }
    },
    'tangling-hair': {
        onDamagedByContact: (pokemon, attacker, newLog, statChanger, battleState) => {
            if (attacker.stat_stages['speed'] > -6) {
                newLog.push({ type: 'text', text: `${attacker.name}'s speed was lowered by ${pokemon.name}'s Tangling Hair!` });
                statChanger(attacker, 'speed', -1, newLog, battleState);
            }
        }
    },
    'tough-claws': {
        onModifyMove: (details, pokemon) => {
            if (CONTACT_MOVES.has(details.id)) {
                details.power *= 1.3;
            }
        }
    },

    'tinted-lens': {
        onModifyDamage: (damageDetails, pokemon, move) => {
            if (damageDetails.effectiveness < 1 && damageDetails.effectiveness > 0) {
                damageDetails.finalMultiplier *= 2;
            }
        }
    },

    'imposter': {
        onSwitchIn: (pokemon, battleState, newLog, statChanger, handleTransform) => {
            const pokemonTeamIndex = battleState.teams.findIndex(t => t.pokemon.some(p => p.id === pokemon.id));
            if (pokemonTeamIndex === -1) return;
            const pokemonTeamId = battleState.teams[pokemonTeamIndex].id;
            const pokemonSlotIndex = battleState.activePokemonIndices[pokemonTeamId].findIndex(i => battleState.teams[pokemonTeamIndex].pokemon[i]?.id === pokemon.id);

            const opponentTeamIndex = pokemonTeamIndex === 0 ? 1 : 0;
            const opponentTeamId = battleState.teams[opponentTeamIndex].id;
            const opponentGlobalIndex = battleState.activePokemonIndices[opponentTeamId][pokemonSlotIndex];
            const opponent = battleState.teams[opponentTeamIndex].pokemon[opponentGlobalIndex];

            if (opponent && !opponent.fainted) {
                handleTransform(pokemon, opponent, newLog);
            } else {
                newLog.push({ type: 'text', text: `${pokemon.name} has no one to transform into!` });
            }
        }
    },
    'soundproof': {
        onCheckImmunity: (move, pokemon, attackerAbilityId, newLog) => {
            if (SOUND_MOVES.has(move.id)) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Soundproof blocks the move!` });
                return true;
            }
            return false;
        }
    },
    'aerilate': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'flying';
                move.power = Math.floor(move.power * 1.2); // CORRECTED
                newLog.push({ type: 'text', text: `The move became Flying-type due to Aerilate!` });
            }
        }
    },
    'pixilate': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'fairy';
                move.power = Math.floor(move.power * 1.2); // CORRECTED
                newLog.push({ type: 'text', text: `The move became Fairy-type due to Pixilate!` });
            }
        }
    },
    'refrigerate': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'ice';
                move.power = Math.floor(move.power * 1.2); // CORRECTED
                newLog.push({ type: 'text', text: `The move became Ice-type due to Refrigerate!` });
            }
        }
    },
    'galvanize': {
        onBeforeMove: (pokemon, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'electric';
                move.power = Math.floor(move.power * 1.2); // CORRECTED
                newLog.push({ type: 'text', text: `The move became Electric-type due to Galvanize!` });
            }
        }
    },
    'harvest': {
        onEndOfTurn: (pokemon, battleState, newLog) => {
            if (pokemon.lastConsumedItem && !pokemon.heldItem && pokemon.lastConsumedItem.name.includes('berry')) {
                const weather = battleState.field.weather;
                const chance = (weather === 'sunshine' || weather === 'harsh-sunshine') ? 100 : 50;

                newLog.push({
                    type: 'text',
                    text: `${pokemon.name}'s Harvest might restore its ${pokemon.lastConsumedItem.name}! (DM: ${chance}% chance)`
                });
                pokemon.lastConsumedItem = null;
            }
        }
    },
    'analytic': {
        onModifyMove: (move, pokemon, battleState) => {
            const lastToMoveId = battleState.turnOrder?.[battleState.turnOrder.length - 1];
            if (pokemon.id === lastToMoveId) {
                move.power *= 1.3;
            }
        }
    },
    'download': {
        onSwitchIn: (pokemon, battleState, newLog, statChanger) => {
            const opponents = getActiveOpponents(pokemon, battleState);
            if (opponents.length === 0) return;

            let totalDef = 0;
            let totalSpDef = 0;
            opponents.forEach(opp => {
                totalDef += calculateStat(opp.stats.defense, opp.level) * getStatModifier(opp.stat_stages.defense);
                totalSpDef += calculateStat(opp.stats['special-defense'], opp.level) * getStatModifier(opp.stat_stages['special-defense']);
            });

            if (totalDef < totalSpDef) {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Download raised its Attack!` });
                statChanger(pokemon, 'attack', 1, newLog, battleState);
            } else {
                newLog.push({ type: 'text', text: `${pokemon.name}'s Download raised its Sp. Atk!` });
                statChanger(pokemon, 'special-attack', 1, newLog, battleState);
            }
        }
    },
    'moody': {
        onEndOfTurn: (pokemon, battleState, newLog, statChanger) => {
            const allStats = ['attack', 'defense', 'special-attack', 'special-defense', 'speed', 'accuracy', 'evasion'];

            const statsToBoost = allStats.filter(stat => pokemon.stat_stages[stat] < 6);
            const statsToLower = allStats.filter(stat => pokemon.stat_stages[stat] > -6);

            if (statsToBoost.length > 0) {
                const randomBoostStat = statsToBoost[Math.floor(Math.random() * statsToBoost.length)];
                newLog.push({ type: 'text', text: `${pokemon.name}'s Moody boosted its ${randomBoostStat.replace('-', ' ')}!` });
                statChanger(pokemon, randomBoostStat, 2, newLog, battleState);
                const index = statsToLower.indexOf(randomBoostStat);
                if (index > -1) {
                    statsToLower.splice(index, 1);
                }
            }

            if (statsToLower.length > 0) {
                const randomLowerStat = statsToLower[Math.floor(Math.random() * statsToLower.length)];
                newLog.push({ type: 'text', text: `${pokemon.name}'s Moody lowered its ${randomLowerStat.replace('-', ' ')}!` });
                statChanger(pokemon, randomLowerStat, -1, newLog, battleState);
            }
        }
    },
    'swift-swim': {
        onModifyStat: (stat, value, pokemon, battleState) => {
            if (stat === 'speed' && (battleState.field.weather === 'rain' || battleState.field.weather === 'heavy-rain')) {
                if (pokemon.heldItem?.id === 'utility-umbrella') return value;
                return value * 2;
            }
            return value;
        }
    },
    'chlorophyll': {
        onModifyStat: (stat, value, pokemon, battleState) => {
            if (stat === 'speed' && (battleState.field.weather === 'sunshine' || battleState.field.weather === 'harsh-sunshine')) {
                if (pokemon.heldItem?.id === 'utility-umbrella') return value;
                return value * 2;
            }
            return value;
        }
    },
    // Marker abilities that don't have hooks but need to exist in the object
    'unaware': {},
    'simple': {},
    'wonder-guard': {},
    'mold-breaker': {},
    'pressure': {},
    'stall': {},
    'unnerve': {},
    'sniper': {},
    'unburden': {},
    'neutralizing-gas': {},
    'stalwart': {},
    'propeller-tail': {},
};