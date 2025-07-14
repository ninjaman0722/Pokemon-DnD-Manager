/**
 * This file centralizes the logic for all held items in the battle engine.
 * Each key is the lowercase, hyphenated name of an item.
 * The value is an object containing specific "hook" functions that the engine will call
 * at different points in the battle.
 *
 * @param {object} self - The Pokémon object holding the item.
 * @param {object} battleState - The entire current battle state.
 * @param {Array} newLog - The array of log entries to push new messages to.
 * @param {object} [target] - The opposing Pokémon, when applicable.
 * @param {object} [move] - The move being used, when applicable.
 * @param {number} [damage] - The calculated damage, when applicable.
 */
import { TYPE_ENHANCING_ITEMS, PUNCHING_MOVES, SOUND_MOVES, SUPER_EFFECTIVE_BERRY_MAP, TYPE_CHART, TWO_TURN_MOVES } from './gameData';

// --- Item Definitions ---
export const itemEffects = {
    // --- Stat-Enhancing Items (Pre-calculation) ---
    'choice-band': {
        onModifyStat: (stat, value, self) => (stat === 'attack' && !self.isSpecial) ? value * 1.5 : value
    },
    'choice-specs': {
        onModifyStat: (stat, value, self) => (stat === 'special-attack' && self.isSpecial) ? value * 1.5 : value
    },
    'choice-scarf': {
        onModifyStat: (stat, value, self) => (stat === 'speed') ? value * 1.5 : value
    },
    'light-ball': {
        onModifyStat: (stat, value, self) => (self.name.toLowerCase() === 'pikachu') ? value * 2 : value
    },
    'thick-club': {
        onModifyStat: (stat, value, self) => {
            const name = self.name.toLowerCase();
            return (stat === 'attack' && (name.includes('cubone') || name.includes('marowak')) && !self.isSpecial) ? value * 2 : value;
        }
    },
    'deep-sea-tooth': {
        onModifyStat: (stat, value, self) => (stat === 'special-attack' && self.name.toLowerCase() === 'clamperl' && self.isSpecial) ? value * 2 : value
    },
    'eviolite': {
        onModifyStat: (stat, value, self) => (self.canEvolve && (stat === 'defense' || stat === 'special-defense')) ? value * 1.5 : value
    },
    'assault-vest': {
        onModifyStat: (stat, value, self) => (stat === 'special-defense' && self.isSpecial) ? value * 1.5 : value
    },
    'metal-powder': {
        onModifyStat: (stat, value, self) => (stat === 'defense' && self.name.toLowerCase() === 'ditto' && !self.isSpecial) ? value * 1.5 : value
    },
    'deep-sea-scale': {
        onModifyStat: (stat, value, self) => (stat === 'special-defense' && self.name.toLowerCase() === 'clamperl' && self.isSpecial) ? value * 2 : value
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
        onModifyMove: (move, self) => {
            if (self.name.toLowerCase().includes('dialga') && (move.type === 'steel' || move.type === 'dragon')) {
                move.power *= 1.2;
            }
        }
    },
    'lustrous-orb': {
        onModifyMove: (move, self) => {
            if (self.name.toLowerCase().includes('palkia') && (move.type === 'water' || move.type === 'dragon')) {
                move.power *= 1.2;
            }
        }
    },
    'griseous-orb': {
        onModifyMove: (move, self) => {
            if (self.name.toLowerCase().includes('giratina') && (move.type === 'ghost' || move.type === 'dragon')) {
                move.power *= 1.2;
            }
        }
    },
    'metronome': {
        onModifyMove: (move, self) => {
            const boost = 1 + (Math.min(self.consecutiveMoveCounter || 0, 5) * 0.2);
            if (boost > 1) {
                move.power *= boost;
            }
        }
    },

    // --- Type-Enhancing Items (Generic) ---
    // This hook will be called by a special handler in the engine
    'type-enhancing': {
        onModifyMove: (move, self) => {
            const itemHeldType = TYPE_ENHANCING_ITEMS[self.heldItem?.name?.toLowerCase()];
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
        onModifyDamage: (damageDetails, attacker, move) => { if (!move.sheerForceBoosted) damageDetails.finalMultiplier *= 1.3; },
        onAfterDamageDealt: (damage, self, target, move, battleState, newLog) => {
            if (!move.sheerForceBoosted && self.currentHp > 0) {
                const recoil = Math.max(1, Math.floor(self.maxHp / 10));
                self.currentHp = Math.max(0, self.currentHp - recoil);
                newLog.push({ type: 'text', text: `${self.name} was hurt by its Life Orb!` });
                if (self.currentHp === 0) {
                    self.fainted = true;
                    newLog.push({ type: 'text', text: `${self.name} fainted!` });
                }
            }
        }
    },

    // --- Defensive / Recovery Items ---
    'focus-sash': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            if (self.currentHp === self.maxHp && damage >= self.currentHp) {
                newLog.push({ type: 'text', text: `${self.name} hung on using its Focus Sash!` });
                self.lastConsumedItem = self.heldItem; // Add this line
                self.heldItem = null; 
                return self.currentHp - 1;
            }
            return damage;
        }
    },
    'sitrus-berry': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            const hpAfterDamage = self.currentHp - damage;
            if (self.currentHp > 0 && hpAfterDamage <= self.maxHp / 2) {
                const healAmount = Math.floor(self.maxHp / 4);
                self.currentHp = Math.min(self.maxHp, self.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${self.name} ate its Sitrus Berry and restored health!` });
                self.lastConsumedItem = self.heldItem; // Add this line
                self.heldItem = null;
            }
            return damage;
        }
    },
    'leftovers': {
        onEndOfTurn: (self, battleState, newLog) => {
            if (self.currentHp < self.maxHp) {
                const healAmount = Math.max(1, Math.floor(self.maxHp / 16));
                self.currentHp = Math.min(self.maxHp, self.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${self.name} restored a little health using its Leftovers!` });
            }
        }
    },

    // --- Status-Curing Berries ---
    'lum-berry': {
        onEndOfTurn: (self, battleState, newLog) => {
            if (self.status !== 'None' || self.volatileStatuses.includes('Confused')) {
                newLog.push({ type: 'text', text: `${self.name} used its Lum Berry to cure its condition!` });
                self.status = 'None';
                self.volatileStatuses = self.volatileStatuses.filter(s => s !== 'Confused');
                self.lastConsumedItem = self.heldItem;
                self.heldItem = null;
            }
        }
    },
    // --- VERIFIED & COMPLETED ---
    'cheri-berry': {
        onEndOfTurn: (self, battleState, newLog) => {
            if (self.status === 'Paralyzed') {
                newLog.push({ type: 'text', text: `${self.name} ate its Cheri Berry and was cured of paralysis!` });
                self.status = 'None';
                self.lastConsumedItem = self.heldItem;
                self.heldItem = null;
            }
        }
    },
    'chesto-berry': {
        onEndOfTurn: (self, battleState, newLog) => {
            if (self.status === 'Asleep') {
                newLog.push({ type: 'text', text: `${self.name} ate its Chesto Berry and woke up!` });
                self.status = 'None';
                self.lastConsumedItem = self.heldItem;
                self.heldItem = null;
            }
        }
    },
    'pecha-berry': {
        onEndOfTurn: (self, battleState, newLog) => {
            if (self.status === 'Poisoned' || self.status === 'Badly Poisoned') {
                newLog.push({ type: 'text', text: `${self.name} ate its Pecha Berry and was cured of poison!` });
                self.status = 'None';
                self.lastConsumedItem = self.heldItem;
                self.heldItem = null;
            }
        }
    },
    'rawst-berry': {
        onEndOfTurn: (self, battleState, newLog) => {
            if (self.status === 'Burned') {
                newLog.push({ type: 'text', text: `${self.name} ate its Rawst Berry and healed its burn!` });
                self.status = 'None';
                self.lastConsumedItem = self.heldItem;
                self.heldItem = null;
            }
        }
    },
    'aspear-berry': {
        onEndOfTurn: (self, battleState, newLog) => {
            if (self.status === 'Frozen') {
                newLog.push({ type: 'text', text: `${self.name} ate its Aspear Berry and thawed out!` });
                self.status = 'None';
                self.lastConsumedItem = self.heldItem;
                self.heldItem = null;
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
                self.lastConsumedItem = self.heldItem;
                self.heldItem = null;
            }
        }
    },

    // --- Post-Attack Trigger Items ---
    'throat-spray': {
        onAfterMove: (self, move, battleState, newLog) => {
            if (SOUND_MOVES.has(move.name.toLowerCase()) && self.stat_stages['special-attack'] < 6) {
                self.stat_stages['special-attack'] = Math.min(6, self.stat_stages['special-attack'] + 1);
                newLog.push({ type: 'text', text: `${self.name}'s Throat Spray raised its Sp. Atk!` });
                self.lastConsumedItem = self.heldItem;
                self.heldItem = null;
            }
        }
    },
    'eject-button': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            if (damage > 0 && self.currentHp - damage > 0) {
                newLog.push({ type: 'text', text: `${self.name} is forced to switch out by its Eject Button!` });
                self.heldItem = null;
                // The engine will see this flag and trigger the replacement phase
                battleState.ejectQueue.push({ teamId: self.teamId, slotIndex: self.slotIndex });
            }
            return damage;
        }
    },

    // --- New Items from your Roadmap ---
    'air-balloon': {
        onCheckImmunity: (move, target) => move.type === 'ground',
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            if (damage > 0) {
                newLog.push({ type: 'text', text: `${self.name}'s Air Balloon popped!` });
                self.heldItem = null;
            }
            return damage;
        }
    },
    'protective-pads': {
        // This is a "marker" item. The engine will check for this before applying
        // effects from contact-based abilities like Static or Poison Point.
    },
    'weakness-policy': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            // We only proceed if damage is dealt and the item hasn't been used yet.
            if (damage > 0 && self.heldItem) {
                // Determine if the move was super-effective
                let effectiveness = 1;
                self.types.forEach(type => {
                    effectiveness *= TYPE_CHART[move.type]?.[type] ?? 1;
                });

                if (effectiveness > 1) {
                    newLog.push({ type: 'text', text: `${self.name}'s Weakness Policy was activated!` });

                    // Sharply raise Attack and Sp. Atk
                    let boosted = false;
                    if (self.stat_stages['attack'] < 6) {
                        self.stat_stages['attack'] = Math.min(6, self.stat_stages['attack'] + 2);
                        boosted = true;
                    }
                    if (self.stat_stages['special-attack'] < 6) {
                        self.stat_stages['special-attack'] = Math.min(6, self.stat_stages['special-attack'] + 2);
                        boosted = true;
                    }

                    if (boosted) {
                        newLog.push({ type: 'text', text: `${self.name}'s Attack and Sp. Atk were sharply raised!` });
                    }

                    self.lastConsumedItem = self.heldItem; 
                    self.heldItem = null;
                }
            }
            return damage; // Always return the original damage
        }
    },
    'eject-pack': {
        // This hook needs to be created and called by your battle engine
        onStatLowered: (self, battleState, newLog) => {
            // Check if the item is still held
            if (self.heldItem) {
                newLog.push({ type: 'text', text: `${self.name} is forced to switch out by its Eject Pack!` });

                // Add the Pokémon to the eject queue, just like Eject Button does
                battleState.ejectQueue.push({ teamId: self.teamId, slotIndex: self.slotIndex });

                // Consume the item
                self.heldItem = null;
            }
        }
    },
    'red-card': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            // Item only triggers if damage is dealt and the holder isn't fainted.
            if (damage > 0 && self.currentHp > 0 && self.heldItem) {

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
                    newLog.push({ type: 'text', text: `${self.name}'s Red Card activated!` });
                    self.heldItem = null; // Consume the item

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
        onFieldEffectStart: (self, fieldEffectName, battleState, newLog, applyStatChange) => {
            // Check if the triggering field effect is Trick Room
            if (fieldEffectName === 'trick-room') {
                // Check if the item is still held (it might have been removed by another effect)
                if (self.heldItem?.name.toLowerCase() === 'room-service') {
                    newLog.push({ type: 'text', text: `${self.name}'s Room Service was used!` });

                    // Lower speed by one stage
                    applyStatChange(self, 'speed', -1, newLog, battleState);
                    newLog.push({ type: 'text', text: `${self.name}'s Speed fell!` });

                    // Consume the item
                    self.heldItem = null;
                }
            }
        }
    },
    'blunder-policy': {
        onMiss: (self, move, battleState, newLog, applyStatChange) => {
            // Check if the item is still held and Magic Room is not active
            if (self.heldItem?.name.toLowerCase() === 'blunder-policy' && battleState.field.magicRoomTurns === 0) {
                newLog.push({ type: 'text', text: `${self.name}'s Blunder Policy activated!` });

                // Sharply raise Speed
                applyStatChange(self, 'speed', 2, newLog, battleState);
                newLog.push({ type: 'text', text: `${self.name}'s Speed was sharply raised!` });

                // Consume the item
                self.heldItem = null;
            }
        }
    },
    'rocky-helmet': {
        onDamagedByContact: (self, attacker, battleState, newLog) => {
            if (attacker.currentHp > 0 && getEffectiveAbility(attacker)?.toLowerCase() !== 'magic-guard') {
                const damage = Math.max(1, Math.floor(attacker.maxHp / 6));
                attacker.currentHp = Math.max(0, attacker.currentHp - damage);
                newLog.push({ type: 'text', text: `${attacker.name} was hurt by ${self.name}'s Rocky Helmet!` });
                if (attacker.currentHp === 0) {
                    attacker.fainted = true;
                    newLog.push({ type: 'text', text: `${attacker.name} fainted!` });
                }
            }
        }
    },
    'black-sludge': {
        onEndOfTurn: (self, battleState, newLog) => {
            // This hook is only called if the Pokémon is not fainted.
            // Check if the holder is a Poison-type
            if (self.types.includes('poison')) {
                // Heal if the Pokémon is not already at full health
                if (self.currentHp < self.maxHp) {
                    const healAmount = Math.max(1, Math.floor(self.maxHp / 16));
                    self.currentHp = Math.min(self.maxHp, self.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${self.name} restored a little health using its Black Sludge!` });
                }
            } else {
                // Damage if the Pokémon is not a Poison-type
                const damageAmount = Math.max(1, Math.floor(self.maxHp / 16));
                self.currentHp = Math.max(0, self.currentHp - damageAmount);
                newLog.push({ type: 'text', text: `${self.name} was hurt by its Black Sludge!` });

                // Check if the Pokémon fainted from the damage
                if (self.currentHp === 0) {
                    self.fainted = true;
                    newLog.push({ type: 'text', text: `${self.name} fainted!` });
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
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            // Check if HP will drop below 1/4 and the item is held
            if (self.heldItem && self.currentHp - damage <= self.maxHp / 4 && self.currentHp - damage > 0) {
                if (self.stat_stages['attack'] < 6) {
                    self.stat_stages['attack'] = Math.min(6, self.stat_stages['attack'] + 1);
                    newLog.push({ type: 'text', text: `${self.name} ate its Liechi Berry and raised its Attack!` });
                    self.lastConsumedItem = self.heldItem;
                    self.heldItem = null; // Consume the berry
                }
            }
            return damage; // Always return original damage
        }
    },

    'ganlon-berry': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            if (self.heldItem && self.currentHp - damage <= self.maxHp / 4 && self.currentHp - damage > 0) {
                if (self.stat_stages['defense'] < 6) {
                    self.stat_stages['defense'] = Math.min(6, self.stat_stages['defense'] + 1);
                    newLog.push({ type: 'text', text: `${self.name} ate its Ganlon Berry and raised its Defense!` });
                    self.lastConsumedItem = self.heldItem;
                    self.heldItem = null;
                }
            }
            return damage;
        }
    },

    'salac-berry': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            if (self.heldItem && self.currentHp - damage <= self.maxHp / 4 && self.currentHp - damage > 0) {
                if (self.stat_stages['speed'] < 6) {
                    self.stat_stages['speed'] = Math.min(6, self.stat_stages['speed'] + 1);
                    newLog.push({ type: 'text', text: `${self.name} ate its Salac Berry and raised its Speed!` });
                    self.lastConsumedItem = self.heldItem;
                    self.heldItem = null;
                }
            }
            return damage;
        }
    },

    'petaya-berry': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            if (self.heldItem && self.currentHp - damage <= self.maxHp / 4 && self.currentHp - damage > 0) {
                if (self.stat_stages['special-attack'] < 6) {
                    self.stat_stages['special-attack'] = Math.min(6, self.stat_stages['special-attack'] + 1);
                    newLog.push({ type: 'text', text: `${self.name} ate its Petaya Berry and raised its Sp. Atk!` });
                    self.lastConsumedItem = self.heldItem;
                    self.heldItem = null;
                }
            }
            return damage;
        }
    },

    'apicot-berry': {
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            if (self.heldItem && self.currentHp - damage <= self.maxHp / 4 && self.currentHp - damage > 0) {
                if (self.stat_stages['special-defense'] < 6) {
                    self.stat_stages['special-defense'] = Math.min(6, self.stat_stages['special-defense'] + 1);
                    newLog.push({ type: 'text', text: `${self.name} ate its Apicot Berry and raised its Sp. Def!` });
                    self.lastConsumedItem = self.heldItem;
                    self.heldItem = null;
                }
            }
            return damage;
        }
    },
    'gem': {
        // This is a generic handler for all Type Gems.
        onModifyMove: (move, self, battleState, newLog) => {
            // Extract the type from the item name (e.g., "Fire Gem" -> "fire")
            const itemHeld = self.heldItem?.name.toLowerCase();
            const gemType = itemHeld?.split(' ')[0];

            // Check if the move type matches the gem type
            if (gemType === move.type) {
                move.power *= 1.3;
                // Add a flag so the engine knows to consume the item after the move
                move.gemBoosted = true;
            }
        },
        // The engine will need to check for the 'gemBoosted' flag on the move
        // after it executes and then set self.heldItem = null.
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
        onStatLowered: (self, battleState, newLog) => {
            if (self.heldItem?.name.toLowerCase() === 'white herb') {
                let statsWereRestored = false;
                for (const stat in self.stat_stages) {
                    if (self.stat_stages[stat] < 0) {
                        self.stat_stages[stat] = 0;
                        statsWereRestored = true;
                    }
                }
                if (statsWereRestored) {
                    newLog.push({ type: 'text', text: `${self.name} used its White Herb to restore its stats!` });
                    self.heldItem = null;
                }
            }
        }
    },

    'mental-herb': {
        // This hook will be called before a Pokémon attempts to use a move.
        onBeforeMove: (self, move, battleState, newLog) => {
            const CUREABLE_STATUSES = ['Infatuated', 'Taunt', 'Encore', 'Torment', 'Disable'];
            let curedStatus = null;

            for (const status of CUREABLE_STATUSES) {
                if (self.volatileStatuses.includes(status)) {
                    curedStatus = status;
                    break; // Found a status to cure
                }
            }

            if (curedStatus) {
                self.volatileStatuses = self.volatileStatuses.filter(s => s !== curedStatus);
                // Also remove encoredMove if Encore was cured
                if (curedStatus === 'Encore') {
                    self.encoredMove = null;
                }
                newLog.push({ type: 'text', text: `${self.name} used its Mental Herb to snap out of its ${curedStatus}!` });
                self.heldItem = null; // Consume the item
            }
        }
    },
    'power-herb': {
        onBeforeMove: (self, move, battleState, newLog) => {
            // The TWO_TURN_MOVES set should be imported from gameData.js
            if (TWO_TURN_MOVES.has(move.name.toLowerCase())) {
                // This flag tells the engine to skip the charge turn
                move.powerHerbBoosted = true;
                newLog.push({ type: 'text', text: `${self.name} is glowing with power from its Power Herb!` });
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
        onEndOfTurn: (self, battleState, newLog) => {
            // The orb only activates if the holder has no status condition.
            if (self.status === 'None') {
                self.status = 'Burned';
                newLog.push({ type: 'text', text: `${self.name} was burned by its Flame Orb!` });
            }
        }
    },

    'toxic-orb': {
        onEndOfTurn: (self, battleState, newLog) => {
            // The orb only activates if the holder has no status condition.
            if (self.status === 'None') {
                self.status = 'Badly Poisoned';
                newLog.push({ type: 'text', text: `${self.name} was badly poisoned by its Toxic Orb!` });
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
        onTakeDamage: (damage, self, move, battleState, newLog, applyStatChange) => {
            // Activates if hit by a Water-type move, damage is dealt, and the item is held.
            if (damage > 0 && move.type === 'water' && self.heldItem?.name.toLowerCase() === 'absorb bulb') {
                newLog.push({ type: 'text', text: `${self.name}'s Absorb Bulb was used!` });
                // Use the engine's stat change function to correctly raise Sp. Atk
                applyStatChange(self, 'special-attack', 1, newLog, battleState);
                self.heldItem = null; // Consume the item
            }
            return damage; // Always return original damage
        }
    },

    'cell-battery': {
        onTakeDamage: (damage, self, move, battleState, newLog, applyStatChange) => {
            // Activates if hit by an Electric-type move
            if (damage > 0 && move.type === 'electric' && self.heldItem?.name.toLowerCase() === 'cell battery') {
                newLog.push({ type: 'text', text: `${self.name}'s Cell Battery was used!` });
                applyStatChange(self, 'attack', 1, newLog, battleState);
                self.heldItem = null;
            }
            return damage;
        }
    },

    'luminous-moss': {
        onTakeDamage: (damage, self, move, battleState, newLog, applyStatChange) => {
            // Activates if hit by a Water-type move
            if (damage > 0 && move.type === 'water' && self.heldItem?.name.toLowerCase() === 'luminous moss') {
                newLog.push({ type: 'text', text: `${self.name}'s Luminous Moss was used!` });
                applyStatChange(self, 'special-defense', 1, newLog, battleState);
                self.heldItem = null;
            }
            return damage;
        }
    },

    'snowball': {
        onTakeDamage: (damage, self, move, battleState, newLog, applyStatChange) => {
            // Activates if hit by an Ice-type move
            if (damage > 0 && move.type === 'ice' && self.heldItem?.name.toLowerCase() === 'snowball') {
                newLog.push({ type: 'text', text: `${self.name}'s Snowball was used!` });
                applyStatChange(self, 'attack', 1, newLog, battleState);
                self.heldItem = null;
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
        onIntimidated: (self, battleState, newLog, applyStatChange) => {
            // Check if the item is still held (it might have been removed by another effect)
            if (self.heldItem?.name.toLowerCase() === 'adrenaline orb') {
                newLog.push({ type: 'text', text: `${self.name}'s Adrenaline Orb was used!` });

                // Raise speed by one stage
                applyStatChange(self, 'speed', 1, newLog, battleState);
                newLog.push({ type: 'text', text: `${self.name}'s Speed rose!` });

                // Consume the item
                self.heldItem = null;
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
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            const hpAfterDamage = self.currentHp - damage;
            // Check if HP drops into the 25% range and the item is held.
            if (self.heldItem?.name.toLowerCase() === 'custap berry' && hpAfterDamage > 0 && hpAfterDamage <= self.maxHp / 4) {
                newLog.push({ type: 'text', text: `${self.name} ate its Custap Berry!` });

                // Set a flag on the Pokémon object itself. The engine will read this.
                self.custapBerryActivated = true;
                self.lastConsumedItem = self.heldItem;
                // Consume the berry
                self.heldItem = null;
            }
            return damage; // Always return original damage
        }
    },
    'booster-energy': {
        // Marker item. The Protosynthesis/Quark Drive abilities check for this on switch-in.
    },
    'shell-bell': {
        onAfterDamageDealt: (damageDealt, self, move, battleState, newLog) => {
            // This hook is called after an attack. `self` is the Shell Bell holder.
            if (damageDealt > 0 && self.currentHp < self.maxHp) {
                const healAmount = Math.max(1, Math.floor(damageDealt / 8));
                self.currentHp = Math.min(self.maxHp, self.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${self.name} restored a little HP using its Shell Bell!` });
            }
        }
    },

    'clear-amulet': {
        // This is a "marker item". The logic is handled directly in the
        // applyStatChange function in useBattleEngine.js to prevent stat drops.
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
        onTakeDamage: (damage, self, move, battleState, newLog) => {
            const hpAfterDamage = self.currentHp - damage;
            // Activates if HP drops to 1/2 or less
            if (self.heldItem && hpAfterDamage > 0 && hpAfterDamage <= self.maxHp / 2) {
                self.currentHp = Math.min(self.maxHp, self.currentHp + 20);
                newLog.push({ type: 'text', text: `${self.name} drank its Berry Juice and restored some health!` });
                self.lastConsumedItem = self.heldItem;
                self.heldItem = null; // Consume the item
            }
            return damage;
        }
    },

    'sticky-barb': {
        onEndOfTurn: (self, battleState, newLog) => {
            // Holder takes damage at the end of the turn
            if (getEffectiveAbility(self, battleState)?.toLowerCase() !== 'magic-guard') {
                const damageAmount = Math.max(1, Math.floor(self.maxHp / 8));
                self.currentHp = Math.max(0, self.currentHp - damageAmount);
                newLog.push({ type: 'text', text: `${self.name} was hurt by its Sticky Barb!` });
                if (self.currentHp === 0) {
                    self.fainted = true;
                    newLog.push({ type: 'text', text: `${self.name} fainted!` });
                }
            }
        },
        onDamagedByContact: (self, attacker, newLog, applyStatChange, battleState) => {
            // Transfers the item to the attacker on contact if they have no item
            if (self.heldItem && !attacker.heldItem) {
                newLog.push({ type: 'text', text: `${self.name}'s Sticky Barb stuck to ${attacker.name}!` });
                attacker.heldItem = self.heldItem;
                self.heldItem = null;
            }
        }
    },
};