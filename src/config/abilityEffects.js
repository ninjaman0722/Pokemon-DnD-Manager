/**
 * This file centralizes the logic for all Pokémon abilities in the battle engine.
 * Each key is the lowercase, hyphenated name of an ability.
 * The value is an object containing specific "hook" functions that the engine will call
 * at different points in the battle.
 *
 * @param {object} self - The Pokémon object that has the ability.
 * @param {object} battleState - The entire current battle state.
 * @param {Array} newLog - The array of log entries to push new messages to.
 * @param {object} [target] - The opposing Pokémon, when applicable.
 * @param {object} [move] - The move being used, when applicable.
 * @param {number} [damage] - The calculated damage, when applicable.
 */
import { BITING_MOVES, AURA_PULSE_MOVES, PUNCHING_MOVES, RECOIL_MOVES, REFLECTABLE_MOVES } from './gameData';
import { calculateStat, getStatModifier } from '../utils/api';
// --- Helper Functions ---
const getActiveOpponents = (self, battleState, newLog) => {
    const selfTeamId = battleState.teams.find(t => t.pokemon.some(p => p.id === self.id))?.id;
    if (!selfTeamId) return [];

    const opponentTeam = battleState.teams.find(t => t.id !== selfTeamId);
    const opponentKey = opponentTeam.id === 'players' ? 'players' : 'opponent';

    return opponentTeam.pokemon.filter((p, i) => battleState.activePokemonIndices[opponentKey].includes(i) && p && !p.fainted);
};

const setWeather = (weatherType, turns, message, self, battleState, newLog) => {
    if (battleState.field.weather !== weatherType && battleState.field.weather !== 'strong-winds') {
        battleState.field.weather = weatherType;
        battleState.field.weatherTurns = turns;
        newLog.push({ type: 'text', text: message });
    }
};

const setTerrain = (terrainType, turns, message, self, battleState, newLog) => {
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
        onSwitchIn: (self, battleState, newLog, applyStatChange) => {
            const opponents = getActiveOpponents(self, battleState);
            if (opponents.length > 0) {
                newLog.push({ type: 'text', text: `${self.name}'s Intimidate cuts the foe's attack!` });
                opponents.forEach(opp => {
                    // Apply the Attack drop
                    applyStatChange(opp, 'attack', -1, newLog, battleState);

                    // --- NEW LOGIC for Adrenaline Orb ---
                    // Check if the opponent is holding an item with an onIntimidated hook
                    const oppItemName = opp.heldItem?.name.toLowerCase();
                    if (itemEffects[oppItemName]?.onIntimidated) {
                        // Call the item's hook
                        itemEffects[oppItemName].onIntimidated(opp, battleState, newLog, applyStatChange);
                    }
                    // --- END NEW LOGIC ---
                });
            }
        }
    },
    'drizzle': {
        onSwitchIn: (self, battleState, newLog) => {
            const turns = self.heldItem?.name.toLowerCase() === 'damp rock' ? 8 : 5;
            setWeather('rain', turns, 'It started to rain!', self, battleState, newLog);
        }
    },
    'primordial-sea': { // This is a strong weather, not extended by items
        onSwitchIn: (self, battleState, newLog) => setWeather('heavy-rain', 9999, 'A heavy rain began to fall!', self, battleState, newLog)
    },
    'sand-stream': {
        onSwitchIn: (self, battleState, newLog) => {
            const turns = self.heldItem?.name.toLowerCase() === 'smooth rock' ? 8 : 5;
            setWeather('sandstorm', turns, 'A sandstorm kicked up!', self, battleState, newLog);
        }
    },
    'drought': {
        onSwitchIn: (self, battleState, newLog) => {
            const turns = self.heldItem?.name.toLowerCase() === 'heat rock' ? 8 : 5;
            setWeather('sunshine', turns, 'The sunlight turned harsh!', self, battleState, newLog);
        }
    },
    'orichalcum-pulse': { // Same as Drought for now
        onSwitchIn: (self, battleState, newLog) => {
            const turns = self.heldItem?.name.toLowerCase() === 'heat rock' ? 8 : 5;
            setWeather('sunshine', turns, 'The sunlight turned harsh!', self, battleState, newLog);
        }
    },
    'desolate-land': { // This is a strong weather, not extended by items
        onSwitchIn: (self, battleState, newLog) => setWeather('harsh-sunshine', 9999, 'The sunlight became extremely harsh!', self, battleState, newLog)
    },
    'snow-warning': {
        onSwitchIn: (self, battleState, newLog) => {
            const turns = self.heldItem?.name.toLowerCase() === 'icy rock' ? 8 : 5;
            setWeather('snow', turns, 'It started to snow!', self, battleState, newLog);
        }
    },
    'delta-stream': {
        onSwitchIn: (self, battleState, newLog) => setWeather('strong-winds', 9999, 'A mysterious air current is protecting Flying-type Pokemon!', self, battleState, newLog)
    },
    'grassy-surge': {
        onSwitchIn: (self, battleState, newLog) => setTerrain('grassy-terrain', 5, 'The battlefield became grassy!', self, battleState, newLog)
    },
    'misty-surge': {
        onSwitchIn: (self, battleState, newLog) => setTerrain('misty-terrain', 5, 'The battlefield became misty!', self, battleState, newLog)
    },
    'psychic-surge': {
        onSwitchIn: (self, battleState, newLog) => setTerrain('psychic-terrain', 5, 'The battlefield became psychic..y!', self, battleState, newLog)
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
        onModifyStat: (stat, value, self) => (stat === 'attack' && self.status !== 'None' && !self.isSpecial) ? value * 1.5 : value
    },
    'toxic-boost': {
        onModifyStat: (stat, value, self) => (stat === 'attack' && (self.status === 'Poisoned' || self.status === 'Badly Poisoned') && !self.isSpecial) ? value * 1.5 : value
    },
    'flare-boost': {
        onModifyStat: (stat, value, self) => (stat === 'special-attack' && self.status === 'Burned' && self.isSpecial) ? value * 1.5 : value
    },
    'huge-power': {
        onModifyStat: (stat, value, self) => (stat === 'attack' && !self.isSpecial) ? value * 2 : value
    },
    'pure-power': {
        onModifyStat: (stat, value, self) => (stat === 'attack' && !self.isSpecial) ? value * 2 : value
    },
    'strong-jaw': {
        onModifyMove: (move, self) => { if (BITING_MOVES.has(move.name.toLowerCase())) move.power *= 1.5; }
    },
    'mega-launcher': {
        onModifyMove: (move, self) => { if (AURA_PULSE_MOVES.has(move.name.toLowerCase())) move.power *= 1.5; }
    },
    'technician': {
        onModifyMove: (move, self) => { if (move.power <= 60) move.power *= 1.5; }
    },
    'iron-fist': {
        onModifyMove: (move, self) => { if (PUNCHING_MOVES.has(move.name.toLowerCase())) move.power *= 1.2; }
    },
    'reckless': {
        onModifyMove: (move, self) => { if (RECOIL_MOVES.has(move.name.toLowerCase())) move.power *= 1.2; }
    },
    'sheer-force': {
        onModifyMove: (move, self) => {
            if (move.meta?.ailment?.name !== 'none' || move.stat_changes?.length > 0) {
                move.power *= 1.3;
                move.sheerForceBoosted = true; // Flag to prevent secondary effects
            }
        }
    },
    'adaptability': {
        onModifyDamage: (damageDetails, self, move) => {
            if (self.types.includes(move.type)) {
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
        onModifyStat: (stat, value, self, attacker) => { // Assume engine passes attacker
            if (getEffectiveAbility(attacker)?.toLowerCase() === 'mold breaker') return value;
            return (stat === 'defense' && self.status?.toLowerCase() !== 'none' && !self.isSpecial) ? value * 1.5 : value
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
        onModifyMove: (move, self) => { if (move.type === 'dark') move.power *= 1.33; }
    },
    'fairy-aura': {
        onModifyMove: (move, self) => { if (move.type === 'fairy') move.power *= 1.33; }
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
        onEndOfTurn: (self, battleState, newLog, applyStatChange) => {
            if (self.stat_stages.speed < 6) {
                newLog.push({ type: 'text', text: `${self.name}'s Speed Boost raised its speed!` });
                // Use the new helper function
                applyStatChange(self, 'speed', 1, newLog, battleState);
            }
        }
    },
    'moxie': {
        onAfterKO: (self, target, newLog, applyStatChange, battleState) => { // Add battleState here
            newLog.push({ type: 'text', text: `${self.name}'s Moxie boosted its Attack!` });
            // Use the new helper function
            applyStatChange(self, 'attack', 1, newLog, battleState);
        }
    },
    'magic-guard': {
        // This is a "marker" ability. The engine will check for this before applying
        // indirect damage from statuses, hazards, or recoil.
    },
    'poison-heal': {
        onEndOfTurn: (self, battleState, newLog) => {
            if (self.status === 'Poisoned' || self.status === 'Badly Poisoned') {
                if (self.currentHp < self.maxHp) {
                    const healAmount = Math.max(1, Math.floor(self.maxHp / 8));
                    self.currentHp = Math.min(self.maxHp, self.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${self.name} restored health using its Poison Heal!` });
                }
            }
        }
    },

    // --- Contact-Based Abilities ---
    'static': {
        onDamagedByContact: (self, attacker, newLog) => {
            if (attacker.status === 'None') {
                // The DM will control the 30% chance. This hook assumes the chance succeeded.
                attacker.status = 'Paralyzed';
                newLog.push({ type: 'text', text: `${self.name}'s Static paralyzed ${attacker.name}!` });
            }
        }
    },
    'poison-point': {
        onDamagedByContact: (self, attacker, newLog) => {
            if (attacker.status === 'None') {
                // The DM will control the 30% chance. This hook assumes the chance succeeded.
                attacker.status = 'Poisoned';
                newLog.push({ type: 'text', text: `${self.name}'s Poison Point poisoned ${attacker.name}!` });
            }
        }
    },

    // --- Form-Changing Abilities ---
    // The engine will call a generic `resolveFormChange` utility, but these hooks
    // define the trigger condition for that utility.
    'disguise': {
        onTakeDamage: (damage, self, move, battleState, newLog, attackerAbility) => {
            // Add this check at the beginning
            if (attackerAbility?.toLowerCase() === 'mold breaker') return damage;

            if (!self.transformed && damage > 0) {
                const bustedForm = self.forms?.find(f => f.formName === 'mimikyu-busted');
                if (bustedForm) {
                    newLog.push({ type: 'text', text: `${self.name}'s Disguise was busted!` });
                    battleState.formChangeQueue.push({ pokemon: self, form: bustedForm, type: 'RESOLVE' });
                }
                return 0; // Negate the damage
            }
            return damage;
        }
    },
    'zen mode': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            const hpAfterDamage = self.currentHp - damage;

            // Check if HP will drop to 50% or less after this hit.
            if (!self.transformed && hpAfterDamage > 0 && hpAfterDamage <= self.maxHp / 2) {
                // 1. Determine which form to look for based on the Pokémon's name.
                const isGalarian = self.name.toLowerCase().includes('galar');
                const targetFormName = isGalarian ? 'darmanitan-galar-zen' : 'darmanitan-zen';

                // 2. Find the form using a robust, case-insensitive search.
                const zenForm = self.forms?.find(
                    f => f.formName?.toLowerCase() === targetFormName.toLowerCase()
                );

                // 3. If the form is found, add the transformation to the queue.
                if (zenForm) {
                    newLog.push({ type: 'text', text: `${self.name}'s Zen Mode was triggered!` });
                    battleState.formChangeQueue.push({ pokemon: self, form: zenForm, type: 'RESOLVE' });
                }
            }
            return damage;
        },
        onEndOfTurn: (self, battleState, newLog) => {
            // This handles reverting the form if HP is restored above 50%.
            if (self.transformed && self.currentHp > self.maxHp / 2) {
                battleState.formChangeQueue.push({ pokemon: self, type: 'REVERT' });
            }
        }
    },
    'ice-face': {
        onTakeDamage: (damage, self, move, battleState, newLog, attackerAbility) => {
            // Add this check at the beginning
            if (attackerAbility?.toLowerCase() === 'mold breaker') return damage;

            if (!self.transformed && !move.isSpecial && damage > 0) {
                const noiceForm = self.forms?.find(f => f.formName === 'eiscue-noice');
                if (noiceForm) {
                    newLog.push({ type: 'text', text: `${self.name}'s Ice Face was broken!` });
                    battleState.formChangeQueue.push({ pokemon: self, form: noiceForm, type: 'RESOLVE' });
                }
                return 0; // Negate the physical damage
            }
            return damage;
        },
        // ... onEndOfTurn logic remains the same
    },
    'stance-change': {
        onBeforeMove: (self, move, battleState, newLog) => {
            const isOffensive = move.damage_class.name !== 'status';
            if (isOffensive && !self.transformed) {
                const bladeForm = self.forms?.find(f => f.formName === 'aegislash-blade');
                if (bladeForm) {
                    battleState.formChangeQueue.push({ pokemon: self, form: bladeForm, type: 'RESOLVE' });
                }
            } else if (!isOffensive && move.name === 'King\'s Shield' && self.transformed) {
                battleState.formChangeQueue.push({ pokemon: self, type: 'REVERT' });
            }
        }
    },
    'schooling': {
        onSwitchIn: (self, battleState, newLog) => {
            if (!self.transformed && self.currentHp > self.maxHp / 4) {
                const schoolForm = self.forms?.find(f => f.formName === 'wishiwashi-school');
                if (schoolForm) {
                    battleState.formChangeQueue.push({ pokemon: self, form: schoolForm, type: 'RESOLVE' });
                }
            }
        },
        onEndOfTurn: (self, battleState, newLog) => {
            if (self.transformed && self.currentHp <= self.maxHp / 4) {
                battleState.formChangeQueue.push({ pokemon: self, type: 'REVERT' });
            } else if (!self.transformed && self.currentHp > self.maxHp / 4) {
                const schoolForm = self.forms?.find(f => f.formName === 'wishiwashi-school');
                if (schoolForm) {
                    battleState.formChangeQueue.push({ pokemon: self, form: schoolForm, type: 'RESOLVE' });
                }
            }
        }
    },
    'regenerator': {
        onSwitchOut: (self, battleState, newLog) => {
            if (self.currentHp < self.maxHp) {
                const healAmount = Math.floor(self.maxHp / 3);
                self.currentHp = Math.min(self.maxHp, self.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${self.name} restored its health as it withdrew!` });
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
        onTakeDamage: (damage, self, move, battleState, newLog, attackerAbility) => {
            // Mold Breaker and similar abilities bypass Sturdy
            if (attackerAbility?.toLowerCase() === 'mold breaker') {
                return damage;
            }

            // Check if HP is full and damage is lethal
            if (self.currentHp === self.maxHp && damage >= self.currentHp) {
                newLog.push({ type: 'text', text: `${self.name} endured the hit with Sturdy!` });
                // Return damage that leaves the Pokémon with exactly 1 HP
                return self.currentHp - 1;
            }

            // Otherwise, return the original damage
            return damage;
        }
    },
    'contrary': {
        // This hook needs to be created and called by your battle engine
        onModifyStatStage: (stageChange, self, newLog) => {
            // Invert the stage change
            const invertedChange = stageChange * -1;

            // Announce the effect
            if (invertedChange !== 0) {
                newLog.push({ type: 'text', text: `${self.name}'s Contrary inverted the stat change!` });
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
        // in the applyStatChange function in useBattleEngine.js
        // to keep all stat modifications centralized.
    },
    'wonder-guard': {
        // This is a marker ability. The logic is handled directly
        // in the calculateDamage function, as it needs access to the
        // final type effectiveness calculation.
    },
    'water-absorb': {
        onCheckImmunity: (move, self, attackerAbility, newLog) => {
            if (move.type === 'water') {
                newLog.push({ type: 'text', text: `${self.name} absorbed the water! ` });
                if (self.currentHp < self.maxHp) {
                    const healAmount = Math.floor(self.maxHp / 4);
                    self.currentHp = Math.min(self.maxHp, self.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${self.name} restored health!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },
    'volt-absorb': {
        onCheckImmunity: (move, self, attackerAbility, newLog) => {
            if (move.type === 'electric') {
                newLog.push({ type: 'text', text: `${self.name} absorbed the electricity! ` });
                if (self.currentHp < self.maxHp) {
                    const healAmount = Math.floor(self.maxHp / 4);
                    self.currentHp = Math.min(self.maxHp, self.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${self.name} restored health!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },
    'sap-sipper': {
        onCheckImmunity: (move, self, attackerAbility, newLog, applyStatChange, battleState) => {
            if (move.type === 'grass') {
                newLog.push({ type: 'text', text: `${self.name} absorbed the plant energy! ` });

                // Sap Sipper also raises the user's Attack stat.
                if (self.stat_stages.attack < 6) {
                    // We need the engine's applyStatChange function for this.
                    // We'll need to pass it into the hook call.
                    if (applyStatChange) {
                        applyStatChange(self, 'attack', 1, newLog, battleState);
                        newLog.push({ type: 'text', text: `${self.name}'s Attack rose!` });
                    }
                }
                return true; // Grant immunity
            }
            return false;
        }
    },
    'protean': {
        onBeforeMove: (self, move, battleState, newLog) => {
            const moveType = move.type;
            // Check if the user is already this type to avoid spamming the log
            if (self.types.length === 1 && self.types[0] === moveType) {
                return;
            }

            // Change the user's type to the move's type
            self.types = [moveType];
            newLog.push({ type: 'text', text: `${self.name}'s Protean changed its type to ${move.type.toUpperCase()}!` });
        }
    },
    'libero': {
        // Libero is functionally identical to Protean
        onBeforeMove: (self, move, battleState, newLog) => {
            const moveType = move.type;
            if (self.types.length === 1 && self.types[0] === moveType) {
                return;
            }

            self.types = [moveType];
            newLog.push({ type: 'text', text: `${self.name}'s Libero changed its type to ${move.type.toUpperCase()}!` });
        }
    },
    'sand-rush': {
        onModifyStat: (stat, value, self, battleState) => {
            if (stat === 'speed' && battleState.field.weather === 'sandstorm') {
                return value * 2;
            }
            return value;
        }
    },

    'slush-rush': {
        onModifyStat: (stat, value, self, battleState) => {
            if (stat === 'speed' && battleState.field.weather === 'snow') {
                return value * 2;
            }
            return value;
        }
    },
    'protosynthesis': {
        onSwitchIn: (self, battleState, newLog, applyStatChange) => {
            // Activates in harsh sunlight OR if holding Booster Energy
            const isSunlight = battleState.field.weather === 'sunshine' || battleState.field.weather === 'harsh-sunshine';
            const holdsBoosterEnergy = self.heldItem?.name.toLowerCase() === 'booster energy';

            if (self.boosterApplied) return; // Prevent re-activation

            if (isSunlight || holdsBoosterEnergy) {
                // Find the highest stat
                let highestStat = 'attack';
                let highestValue = self.stats.attack;
                ['defense', 'special-attack', 'special-defense', 'speed'].forEach(stat => {
                    if (self.stats[stat] > highestValue) {
                        highestValue = self.stats[stat];
                        highestStat = stat;
                    }
                });

                // Apply the boost
                const boostAmount = highestStat === 'speed' ? 1.5 : 1.3;
                // We'll store the boost directly on the pokemon object for the engine to use.
                self.boosterBoost = { stat: highestStat, multiplier: boostAmount };
                self.boosterApplied = true;
                newLog.push({ type: 'text', text: `${self.name}'s Protosynthesis activated, boosting its ${highestStat.replace('-', ' ')}!` });

                // Consume Booster Energy if it was the trigger
                if (holdsBoosterEnergy) {
                    self.heldItem = null;
                }
            }
        }
    },

    'quark-drive': {
        onSwitchIn: (self, battleState, newLog, applyStatChange) => {
            // Activates in Electric Terrain OR if holding Booster Energy
            const isElectricTerrain = battleState.field.terrain === 'electric-terrain';
            const holdsBoosterEnergy = self.heldItem?.name.toLowerCase() === 'booster energy';

            if (self.boosterApplied) return;

            if (isElectricTerrain || holdsBoosterEnergy) {
                // Find the highest stat (same logic as Protosynthesis)
                let highestStat = 'attack';
                let highestValue = self.stats.attack;
                ['defense', 'special-attack', 'special-defense', 'speed'].forEach(stat => {
                    if (self.stats[stat] > highestValue) {
                        highestValue = self.stats[stat];
                        highestStat = stat;
                    }
                });

                const boostAmount = highestStat === 'speed' ? 1.5 : 1.3;
                self.boosterBoost = { stat: highestStat, multiplier: boostAmount };
                self.boosterApplied = true;
                newLog.push({ type: 'text', text: `${self.name}'s Quark Drive activated, boosting its ${highestStat.replace('-', ' ')}!` });

                if (holdsBoosterEnergy) {
                    self.heldItem = null;
                }
            }
        }
    },
    'defiant': {
        onStatLowered: (self, battleState, newLog, applyStatChange) => {
            // Check if Attack is not already maxed out
            if (self.stat_stages['attack'] < 6) {
                newLog.push({ type: 'text', text: `${self.name}'s Defiant sharply raised its Attack!` });
                // Sharply raise Attack (+2 stages)
                applyStatChange(self, 'attack', 2, newLog, battleState);
            }
        }
    },

    'competitive': {
        onStatLowered: (self, battleState, newLog, applyStatChange) => {
            // Check if Special Attack is not already maxed out
            if (self.stat_stages['special-attack'] < 6) {
                newLog.push({ type: 'text', text: `${self.name}'s Competitive sharply raised its Sp. Atk!` });
                // Sharply raise Special Attack (+2 stages)
                applyStatChange(self, 'special-attack', 2, newLog, battleState);
            }
        }
    },

    'justified': {
        onTakeDamage: (damage, self, move, battleState, newLog, attackerAbility, applyStatChange) => {
            // Activates if hit by a Dark-type move, damage was dealt, and Attack is not maxed out
            if (move.type === 'dark' && damage > 0 && self.stat_stages['attack'] < 6) {
                newLog.push({ type: 'text', text: `${self.name}'s Justified raised its Attack!` });
                // Raise Attack (+1 stage)
                applyStatChange(self, 'attack', 1, newLog, battleState);
            }
            return damage; // Always return the damage
        }
    },
    'flash-fire': {
        onCheckImmunity: (move, self, attackerAbility, newLog) => {
            if (move.type === 'fire') {
                newLog.push({ type: 'text', text: `${self.name}'s Flash Fire activated!` });
                // Set a flag on the Pokémon object that its fire moves are now boosted.
                self.flashFireBoosted = true;
                return true; // Grant immunity
            }
            return false;
        },
        onModifyMove: (move, self) => {
            // If the boost is active and the move is a Fire-type move, increase its power.
            if (self.flashFireBoosted && move.type === 'fire') {
                move.power *= 1.5;
            }
        }
    },

    'motor-drive': {
        onCheckImmunity: (move, self, attackerAbility, newLog, applyStatChange, battleState) => {
            if (move.type === 'electric') {
                newLog.push({ type: 'text', text: `${self.name} absorbed the electricity!` });
                if (self.stat_stages.speed < 6) {
                    applyStatChange(self, 'speed', 1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${self.name}'s Speed rose!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },

    'lightning-rod': {
        onRedirect: (move) => move.type === 'electric',
        onCheckImmunity: (move, self, attackerAbility, newLog, applyStatChange, battleState) => {
            if (move.type === 'electric') {
                newLog.push({ type: 'text', text: `The attack was absorbed by ${self.name}!` });
                if (self.stat_stages['special-attack'] < 6) {
                    applyStatChange(self, 'special-attack', 1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${self.name}'s Sp. Atk rose!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },

    'storm-drain': {
        onRedirect: (move) => move.type === 'water',
        onCheckImmunity: (move, self, attackerAbility, newLog, applyStatChange, battleState) => {
            if (move.type === 'water') {
                newLog.push({ type: 'text', text: `The attack was absorbed by ${self.name}!` });
                if (self.stat_stages['special-attack'] < 6) {
                    applyStatChange(self, 'special-attack', 1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${self.name}'s Sp. Atk rose!` });
                }
                return true; // Grant immunity
            }
            return false;
        }
    },
    'mummy': {
        onDamagedByContact: (self, attacker, newLog, applyStatChange, battleState) => {
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
        onDamagedByContact: (self, attacker, newLog, applyStatChange, battleState) => {
            // Check if Speed can be lowered
            if (attacker.stat_stages['speed'] > -6) {
                newLog.push({ type: 'text', text: `${attacker.name}'s speed was lowered by ${self.name}'s Gooey!` });
                // Lower Speed by 1 stage
                applyStatChange(attacker, 'speed', -1, newLog, battleState);
            }
        }
    },

    // Tangling Hair has the exact same effect as Gooey
    'tangling-hair': {
        onDamagedByContact: (self, attacker, newLog, applyStatChange, battleState) => {
            if (attacker.stat_stages['speed'] > -6) {
                newLog.push({ type: 'text', text: `${attacker.name}'s speed was lowered by ${self.name}'s Tangling Hair!` });
                applyStatChange(attacker, 'speed', -1, newLog, battleState);
            }
        }
    },
    'tough-claws': {
        onModifyMove: (move, self) => {
            if (CONTACT_MOVES.has(move.name.toLowerCase())) {
                move.power *= 1.3;
            }
        }
    },

    'tinted-lens': {
        onModifyDamage: (damageDetails, self, move) => {
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
        onEndOfTurn: (self, battleState, newLog, applyStatChange) => {
            const allStats = ['attack', 'defense', 'special-attack', 'special-defense', 'speed', 'accuracy', 'evasion'];
            
            const statsToBoost = allStats.filter(stat => self.stat_stages[stat] < 6);
            const statsToLower = allStats.filter(stat => self.stat_stages[stat] > -6);

            if (statsToBoost.length > 0) {
                // Pick a random stat to boost
                const randomBoostStat = statsToBoost[Math.floor(Math.random() * statsToBoost.length)];
                newLog.push({ type: 'text', text: `${self.name}'s Moody boosted its ${randomBoostStat.replace('-', ' ')}!` });
                applyStatChange(self, randomBoostStat, 2, newLog, battleState);
                
                // Remove the boosted stat from the potential stats to lower
                const index = statsToLower.indexOf(randomBoostStat);
                if (index > -1) {
                    statsToLower.splice(index, 1);
                }
            }
            
            if (statsToLower.length > 0) {
                // Pick a random stat to lower
                const randomLowerStat = statsToLower[Math.floor(Math.random() * statsToLower.length)];
                newLog.push({ type: 'text', text: `${self.name}'s Moody lowered its ${randomLowerStat.replace('-', ' ')}!` });
                applyStatChange(self, randomLowerStat, -1, newLog, battleState);
            }
        }
    },
    'imposter': {
        onSwitchIn: (self, battleState, newLog, applyStatChange, handleTransform) => {
            // Find self's team and slot index
            const selfTeamIndex = battleState.teams.findIndex(t => t.pokemon.some(p => p.id === self.id));
            if (selfTeamIndex === -1) return;
            const selfTeamId = battleState.teams[selfTeamIndex].id;
            const selfSlotIndex = battleState.activePokemonIndices[selfTeamId].findIndex(i => battleState.teams[selfTeamIndex].pokemon[i]?.id === self.id);

            // Find the opponent in the corresponding slot
            const opponentTeamIndex = selfTeamIndex === 0 ? 1 : 0;
            const opponentTeamId = battleState.teams[opponentTeamIndex].id;
            const opponentGlobalIndex = battleState.activePokemonIndices[opponentTeamId][selfSlotIndex];
            const opponent = battleState.teams[opponentTeamIndex].pokemon[opponentGlobalIndex];

            // If a valid opponent exists, transform into it
            if (opponent && !opponent.fainted) {
                handleTransform(self, opponent, newLog);
            } else {
                newLog.push({ type: 'text', text: `${self.name} has no one to transform into!` });
            }
        }
    },
    'soundproof': {
        onCheckImmunity: (move, self, attackerAbility, newLog) => {
            if (SOUND_MOVES.has(move.name.toLowerCase())) {
                newLog.push({ type: 'text', text: `${self.name}'s Soundproof blocks the move!` });
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
        onBeforeMove: (self, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'flying';
                move.power *= 1.2;
                newLog.push({ type: 'text', text: `The move became Flying-type due to Aerilate!` });
            }
        }
    },
    'pixilate': {
        onBeforeMove: (self, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'fairy';
                move.power *= 1.2;
                newLog.push({ type: 'text', text: `The move became Fairy-type due to Pixilate!` });
            }
        }
    },
    'refrigerate': {
        onBeforeMove: (self, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'ice';
                move.power *= 1.2;
                newLog.push({ type: 'text', text: `The move became Ice-type due to Refrigerate!` });
            }
        }
    },
    'galvanize': {
        onBeforeMove: (self, move, battleState, newLog) => {
            if (move.type === 'normal' && move.damage_class !== 'status') {
                move.type = 'electric';
                move.power *= 1.2;
                newLog.push({ type: 'text', text: `The move became Electric-type due to Galvanize!` });
            }
        }
    },
    'harvest': {
        onEndOfTurn: (self, battleState, newLog) => {
            // Check if a berry was consumed and the Pokémon is holding nothing
            if (self.lastConsumedItem && !self.heldItem && self.lastConsumedItem.name.includes('berry')) {
                const weather = battleState.field.weather;
                const chance = (weather === 'sunshine' || weather === 'harsh-sunshine') ? 100 : 50;
                
                // Prompt the DM to make a roll. Do not restore the item automatically.
                newLog.push({ 
                    type: 'text', 
                    text: `${self.name}'s Harvest might restore its ${self.lastConsumedItem.name}! (DM: ${chance}% chance)` 
                });
                
                // Clear the consumed item slot so this doesn't trigger every turn.
                // If the DM's roll succeeds, they will manually give the item back.
                self.lastConsumedItem = null;
            }
        }
    },
    'analytic': {
        onModifyMove: (move, self, battleState) => {
            // Find the last Pokémon ID scheduled to move
            const lastToMoveId = battleState.turnOrder?.[battleState.turnOrder.length - 1];
            // If the user of this move is the last to move, boost power
            if (self.id === lastToMoveId) {
                move.power *= 1.3;
            }
        }
    },

    'download': {
        onSwitchIn: (self, battleState, newLog, applyStatChange) => {
            const opponents = getActiveOpponents(self, battleState);
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
                newLog.push({ type: 'text', text: `${self.name}'s Download raised its Attack!` });
                applyStatChange(self, 'attack', 1, newLog, battleState);
            } else {
                newLog.push({ type: 'text', text: `${self.name}'s Download raised its Sp. Atk!` });
                applyStatChange(self, 'special-attack', 1, newLog, battleState);
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
        onModifyStat: (stat, value, self, battleState) => {
            if (stat === 'speed' && (battleState.field.weather === 'rain' || battleState.field.weather === 'heavy-rain')) {
                // Add a check for Utility Umbrella
                if (self.heldItem?.name.toLowerCase() === 'utility-umbrella') return value;
                return value * 2;
            }
            return value;
        }
    },

    'chlorophyll': {
        onModifyStat: (stat, value, self, battleState) => {
            if (stat === 'speed' && (battleState.field.weather === 'sunshine' || battleState.field.weather === 'harsh-sunshine')) {
                // Add a check for Utility Umbrella
                if (self.heldItem?.name.toLowerCase() === 'utility-umbrella') return value;
                return value * 2;
            }
            return value;
        }
    },
};