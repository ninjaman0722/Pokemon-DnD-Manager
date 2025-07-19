import { useState } from 'react';
import { doc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import {
    TYPE_CHART, RECOIL_MOVES, DRAIN_MOVES, CONTACT_MOVES, Z_CRYSTAL_MAP, API_AILMENT_TO_STATUS_MAP, CURSE_MOVE, NIGHTMARE_MOVE, REFLECT_TYPE_MOVES, LIGHT_SCREEN_TYPE_MOVES, AURORA_VEIL_MOVE, MOVE_TO_TERRAIN_MAP, MOVE_TO_WEATHER_MAP, WEATHER_EXTENDING_ROCKS, ENCORE_MOVE, TAUNT_MOVE, INFATUATION_MOVE, ABILITY_SUPPRESSING_MOVES, ABILITY_REPLACEMENT_MOVES, TWO_TURN_MOVES, REFLECTABLE_MOVES, BINDING_MOVES, LEECH_SEED_MOVE, CONFUSION_INDUCING_MOVES
} from '../config/gameData';
import { abilityEffects } from '../config/abilityEffects';
import { itemEffects } from '../config/itemEffects';
import { calculateStat, getEffectiveAbility, getStatModifier } from '../utils/api';

export const useBattleEngine = (battleState, battleId, allTrainers, queuedActions, setQueuedActions, setTurnOrder, isAiEnabled) => {
    const [isProcessingTurn, setIsProcessingTurn] = useState(false);
    const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);

    const handleTransform = (transformer, target, newLog) => {
        if (transformer.transformed || target.transformed) {
            newLog.push({ type: 'text', text: 'But it failed!' });
            return;
        }

        newLog.push({ type: 'text', text: `${transformer.name} transformed into ${target.name}!` });

        // Create a backup of the original state before transforming
        transformer.basePokemonState = JSON.parse(JSON.stringify(transformer));

        // Copy properties from the target
        transformer.name = target.name;
        transformer.sprites = { ...target.sprites };
        transformer.sprite = target.sprite;
        transformer.shinySprite = target.shinySprite;
        transformer.types = [...target.types];
        transformer.weight = target.weight;

        // Copy base stats and current stat stages
        transformer.stats = { ...target.stats }; // Copy the calculated stats
        transformer.stat_stages = { ...target.stat_stages };

        // Copy moveset, setting PP to 5 for each move
        transformer.moves = target.moves.map(move => ({
            ...move,
            pp: 5,
            maxPp: 5,
        }));

        // Mark as transformed
        transformer.transformed = true;
    };

    const applyStatChange = (target, stat, change, newLog, currentBattleState) => {
        if (target.fainted) return;

        let finalChange = change;
        const targetAbility = getEffectiveAbility(target, currentBattleState)?.toLowerCase();

        if (targetAbility === 'simple') {
            finalChange *= 2;
        }
        if (targetAbility === 'contrary') {
            const contraryEffect = abilityEffects['contrary']?.onModifyStatStage;
            if (contraryEffect) {
                finalChange = contraryEffect(finalChange, target, newLog);
            }
        }

        const originalStage = target.stat_stages[stat];
        target.stat_stages[stat] = Math.max(-6, Math.min(6, originalStage + finalChange));

        const wasLowered = target.stat_stages[stat] < originalStage;
        if (wasLowered) {
            // --- ADD THIS BLOCK to trigger abilities like Defiant/Competitive ---
            const abilityEffect = abilityEffects[targetAbility];
            if (abilityEffect?.onStatLowered) {
                abilityEffect.onStatLowered(target, currentBattleState, newLog, applyStatChange);
            }
            if (target.heldItem?.name.toLowerCase() === 'clear-amulet') {
                newLog.push({ type: 'text', text: `${target.name}'s Clear Amulet prevents its stats from being lowered!` });
                target.stat_stages[stat] = originalStage; // Revert the change
                return; // Stop processing this stat drop
            }
            // --- END ADDED BLOCK ---

            if (currentBattleState.field.magicRoomTurns === 0) {
                const ejectPackEffect = itemEffects['eject-pack']?.onStatLowered;
                if (ejectPackEffect && target.heldItem?.name.toLowerCase() === 'eject-pack') {
                    ejectPackEffect(target, currentBattleState, newLog);
                }
                const whiteHerbEffect = itemEffects['white-herb']?.onStatLowered;
                if (whiteHerbEffect && target.heldItem?.name.toLowerCase() === 'white herb') {
                    whiteHerbEffect(target, currentBattleState, newLog);
                }
            }
        }

        // --- NEW LOGIC FOR MIRROR HERB ---
        // After a stat change is applied, check if it was a boost.
        const wasRaised = target.stat_stages[stat] > originalStage;
        if (wasRaised) {
            // Find the opponent team
            const targetTeamId = currentBattleState.teams.find(t => t.pokemon.some(p => p.id === target.id))?.id;
            const opponentTeam = currentBattleState.teams.find(t => t.id !== targetTeamId);

            if (opponentTeam) {
                // Check all active opponents of the Pokémon that got the boost
                const opponentActiveIndices = currentBattleState.activePokemonIndices[opponentTeam.id];
                opponentTeam.pokemon.forEach((opponent, index) => {
                    if (opponentActiveIndices.includes(index) && !opponent.fainted) {
                        // If an opponent holds a Mirror Herb, trigger its effect
                        if (opponent.heldItem?.name.toLowerCase() === 'mirror-herb') {
                            // Check if the holder's corresponding stat is not already maxed out
                            if (opponent.stat_stages[stat] < 6) {
                                newLog.push({ type: 'text', text: `${opponent.name} copied ${target.name}'s stat boost with its Mirror Herb!` });

                                // Consume the item immediately to prevent loops
                                opponent.heldItem = null;

                                // Apply the same stat boost to the Mirror Herb holder.
                                // We can safely call applyStatChange again because the item is now null.
                                const boostAmount = target.stat_stages[stat] - originalStage;
                                applyStatChange(opponent, stat, boostAmount, newLog, currentBattleState);
                            }
                        }
                    }
                });
            }
        }
    };
    const isGrounded = (pokemon, currentBattleState) => {
        // --- NEW GRAVITY CHECK ---
        // If Gravity is active, every Pokémon is grounded. Period.
        if (currentBattleState.field.gravityTurns > 0) {
            return true;
        }
        if (pokemon.heldItem?.name.toLowerCase() === 'iron ball') {
            return true;
        }
        // --- END NEW CHECK ---

        // The rest of the logic only runs if Gravity is NOT active.
        if (currentBattleState.field.magicRoomTurns === 0 && pokemon.heldItem?.name.toLowerCase() === 'air-balloon') {
            return false;
        }

        if (pokemon.types.includes('flying')) return false;

        const abilityName = getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase();
        if (abilityEffects[abilityName]?.onCheckImmunity?.({ type: 'ground' }, pokemon)) {
            return false;
        }

        return true;
    };
    const getZMovePower = (basePower) => {
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
    const resolveFormChange = (pokemon, form, newLog) => {
        console.group(`--- INSIDE resolveFormChange for ${pokemon.name} ---`);
        if (!pokemon || !form) {
            console.error("RESOLVE CHECK FAILED: Missing pokemon or form data.");
            console.groupEnd();
            return false;
        }
        newLog.push({ type: 'text', text: `${pokemon.name}'s ${form.triggerAbility || 'ability'} was triggered!` });
        console.log("Pokémon state BEFORE transformation:", JSON.parse(JSON.stringify(pokemon)));

        const oldMaxHp = pokemon.maxHp;
        const hpPercent = pokemon.currentHp / oldMaxHp;

        if (!pokemon.baseForm) {
            pokemon.baseForm = {
                name: pokemon.name,
                speciesName: pokemon.speciesName,
                baseStats: { ...pokemon.baseStats },
                types: [...pokemon.types],
                ability: pokemon.ability,
                sprites: { ...pokemon.sprites },
            };
        }

        Object.assign(pokemon, form.data);
        pokemon.name = form.formName;

        const newMaxHp = calculateStat(form.data.baseStats.hp, pokemon.level, true);
        pokemon.maxHp = newMaxHp;
        pokemon.currentHp = Math.floor(newMaxHp * hpPercent);
        console.log(`HP RECALCULATION: New Max HP is ${newMaxHp}. New Current HP is ${pokemon.currentHp}.`);

        pokemon.transformed = true;
        console.log("Pokémon state AFTER transformation:", JSON.parse(JSON.stringify(pokemon)));
        console.groupEnd();
        return true;
    };

    const revertFormChange = (pokemon, newLog) => {
        console.group(`--- INSIDE revertFormChange for ${pokemon.name} ---`);
        if (!pokemon.baseForm) {
            console.error("REVERT CHECK FAILED: Pokémon has no baseForm to revert to.");
            console.groupEnd();
            return false;
        }
        newLog.push({ type: 'text', text: `${pokemon.name} reverted to its base form!` });
        console.log("Pokémon state BEFORE reverting:", JSON.parse(JSON.stringify(pokemon)));

        const oldMaxHp = pokemon.maxHp;
        const hpPercent = pokemon.currentHp / oldMaxHp;

        Object.assign(pokemon, pokemon.baseForm);

        const newMaxHp = calculateStat(pokemon.baseStats.hp, pokemon.level, true);
        pokemon.maxHp = newMaxHp;
        pokemon.currentHp = Math.floor(newMaxHp * hpPercent);
        console.log(`HP RECALCULATION: Reverted Max HP is ${newMaxHp}. Reverted Current HP is ${pokemon.currentHp}.`);

        pokemon.transformed = false;
        delete pokemon.baseForm;
        console.log("Pokémon state AFTER reverting:", JSON.parse(JSON.stringify(pokemon)));
        console.groupEnd();
        return true;
    };
    const runOnSwitchIn = (pokemonArray, currentBattleState, newLog) => {
        pokemonArray.forEach(pokemon => {
            if (!pokemon || pokemon.fainted) return;

            // --- REFACTORED: ABILITY & ITEM HOOKS ---
            const abilityName = getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase();
            if (abilityEffects[abilityName]?.onSwitchIn) {
                // --- MODIFIED LINE: Pass handleTransform to the hook ---
                abilityEffects[abilityName].onSwitchIn(pokemon, currentBattleState, newLog, applyStatChange, handleTransform);
            }

            if (pokemon.fainted) return;

            // --- HAZARD LOGIC (with Magic Guard check) ---
            const teamKey = currentBattleState.teams.find(t => t.pokemon.some(p => p.id === pokemon.id))?.id === 'players' ? 'players' : 'opponent';
            const teamHazards = currentBattleState.field.hazards?.[teamKey];
            if (!teamHazards) return;

            const isGuarded = getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase() === 'magic-guard';
            const hasBoots = pokemon.heldItem?.name.toLowerCase() === 'heavy-duty-boots';

            // Check for Stealth Rock
            if (teamHazards['stealth-rock'] && !isGuarded && !hasBoots) {
                let effectiveness = 1;
                pokemon.types.forEach(type => {
                    effectiveness *= TYPE_CHART['rock']?.[type] ?? 1;
                });
                const damage = Math.floor(pokemon.maxHp * 0.125 * effectiveness);
                if (damage > 0) {
                    pokemon.currentHp = Math.max(0, pokemon.currentHp - damage);
                    newLog.push({ type: 'text', text: `Pointed stones dug into ${pokemon.name}!` });
                }
            }
            if (pokemon.currentHp === 0) { pokemon.fainted = true; newLog.push({ type: 'text', text: `${pokemon.name} fainted!` }); return; }

            // Check for Spikes, Toxic Spikes, Sticky Web
            const grounded = isGrounded(pokemon, currentBattleState);
            if (grounded && !hasBoots) { // The boots check now protects from all grounded hazards

                // Spikes Logic (already present)
                if (!isGuarded && teamHazards['spikes']) {
                    const damageFractions = [0, 1 / 8, 1 / 6, 1 / 4];
                    const damage = Math.floor(pokemon.maxHp * damageFractions[teamHazards['spikes']]);
                    pokemon.currentHp = Math.max(0, pokemon.currentHp - damage);
                    newLog.push({ type: 'text', text: `${pokemon.name} was hurt by the spikes!` });
                }
                if (pokemon.fainted) return; // Check for fainting after each hazard

                // --- NEW LOGIC for Toxic Spikes ---
                if (teamHazards['toxic-spikes']) {
                    // Poison-type Pokémon on the ground absorb the Toxic Spikes
                    if (pokemon.types.includes('poison')) {
                        teamHazards['toxic-spikes'] = 0; // Remove the hazard
                        newLog.push({ type: 'text', text: `${pokemon.name} absorbed the Toxic Spikes!` });
                    }
                    // Otherwise, if not immune and not already statused, apply poison
                    else if (!pokemon.types.includes('steel') && pokemon.status === 'None') {
                        if (teamHazards['toxic-spikes'] >= 2) {
                            pokemon.status = 'Badly Poisoned';
                            newLog.push({ type: 'text', text: `${pokemon.name} was badly poisoned by the Toxic Spikes!` });
                        } else {
                            pokemon.status = 'Poisoned';
                            newLog.push({ type: 'text', text: `${pokemon.name} was poisoned by the Toxic Spikes!` });
                        }
                    }
                }
                // --- END NEW LOGIC ---

                // --- NEW LOGIC for Sticky Web ---
                if (teamHazards['sticky-web']) {
                    // The 'contrary' check should ideally be part of applyStatChange
                    // but for simplicity, we check it here.
                    if (getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase() !== 'contrary') {
                        applyStatChange(pokemon, 'speed', -1, newLog, currentBattleState);
                        newLog.push({ type: 'text', text: `${pokemon.name} was caught in a Sticky Web!` });
                    }
                }
            }
            if (pokemon.currentHp === 0) { pokemon.fainted = true; newLog.push({ type: 'text', text: `${pokemon.name} fainted!` }); return; }
        });
    };
    const getActiveOpponents = (pokemon, currentBattleState) => {
        const { teams, activePokemonIndices } = currentBattleState;
        const pokemonTeam = teams.find(t => t.pokemon.some(p => p.id === pokemon.id));
        if (!pokemonTeam) return [];

        const opponentTeam = teams.find(t => t.id !== pokemonTeam.id);
        if (!opponentTeam) return [];

        const opponentActiveIndices = activePokemonIndices[opponentTeam.id] || [];
        return opponentTeam.pokemon.filter((p, i) => opponentActiveIndices.includes(i) && p && !p.fainted);
    };
    const runEndOfTurnPhase = (currentBattleState, newLog) => {
        const { teams, activePokemonIndices, field } = currentBattleState;

        const allActivePokemon = teams.flatMap((team) => {
            const activeIndicesForTeam = activePokemonIndices[team.id];
            // If there's no active index data for this team, return an empty array to prevent a crash.
            if (!activeIndicesForTeam) {
                return [];
            }
            return team.pokemon.filter((p, i) => activeIndicesForTeam.includes(i) && p && !p.fainted);
        });

        // Sort by speed for priority in effects, highest speed goes first
        allActivePokemon.sort((a, b) => {
            const speedA = a.stats.speed * getStatModifier(a.stat_stages.speed);
            const speedB = b.stats.speed * getStatModifier(b.stat_stages.speed);
            return speedB - speedA;
        });

        allActivePokemon.forEach(pokemon => {
            if (pokemon.fainted) return;

            const abilityName = getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase();
            const itemName = pokemon.heldItem?.name.toLowerCase();
            const isGuarded = abilityName === 'magic-guard';

            // HOOK RUNNERS
            if (abilityEffects[abilityName]?.onEndOfTurn) {
                // --- MODIFIED --- Pass applyStatChange to hooks that need it
                abilityEffects[abilityName].onEndOfTurn(pokemon, currentBattleState, newLog, applyStatChange);
            }
            let isUnnerved = false;
            if (pokemon.heldItem?.name.toLowerCase().includes('berry')) {
                const opponents = getActiveOpponents(pokemon, currentBattleState);
                if (opponents.some(opp => getEffectiveAbility(opp, currentBattleState)?.toLowerCase() === 'unnerve')) {
                    isUnnerved = true;
                    newLog.push({ type: 'text', text: `${pokemon.name} is unnerved and cannot eat its berry!` });
                }
            }

            if (currentBattleState.field.magicRoomTurns === 0 && !isUnnerved) {
                if (itemEffects[itemName]?.onEndOfTurn) {
                    itemEffects[itemName].onEndOfTurn(pokemon, currentBattleState, newLog);
                }
            }
            // --- NEW LOGIC FOR BINDING DAMAGE ---
            // Check if the Pokémon is Bound and not protected by Magic Guard
            const trappedStatus = pokemon.volatileStatuses.find(s => s.name === 'Trapped');
            if (trappedStatus && !isGuarded) {
                // --- Damage Calculation (no change here) ---
                let damageFraction = 1 / 8;
                const trapper = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === trappedStatus.sourceId);
                if (trapper && trapper.heldItem?.name.toLowerCase() === 'binding band') {
                    damageFraction = 1 / 6;
                }
                const trapDamage = Math.max(1, Math.floor(pokemon.maxHp * damageFraction));
                pokemon.currentHp = Math.max(0, pokemon.currentHp - trapDamage);
                newLog.push({ type: 'text', text: `${pokemon.name} is hurt by the trap!` });

                // --- NEW DURATION LOGIC ---
                trappedStatus.duration--;
                if (trappedStatus.duration === 0) {
                    pokemon.volatileStatuses = pokemon.volatileStatuses.filter(s => s.name !== 'Trapped');
                    newLog.push({ type: 'text', text: `${pokemon.name} was released from the trap.` });
                }
                // --- END NEW LOGIC ---
            }
            const leechSeedStatus = pokemon.volatileStatuses.find(s => s.name === 'Leech Seed');
            if (leechSeedStatus && !isGuarded) {
                const damageAmount = Math.max(1, Math.floor(pokemon.maxHp / 8));
                pokemon.currentHp = Math.max(0, pokemon.currentHp - damageAmount);
                newLog.push({ type: 'text', text: `${pokemon.name}'s health was sapped by Leech Seed!` });

                // Find the Pokémon that planted the seed
                const seeder = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === leechSeedStatus.sourceId);

                // Heal the seeder, if they are still on the field and not fainted
                if (seeder && !seeder.fainted) {
                    let healAmount = damageAmount;

                    // Check if the seeder is holding Big Root to increase healing
                    if (seeder.heldItem?.name.toLowerCase() === 'big root') {
                        healAmount = Math.floor(healAmount * 1.3);
                    }

                    seeder.currentHp = Math.min(seeder.maxHp, seeder.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${seeder.name} restored a little health!` });
                }
            }
            if (pokemon.volatileStatuses.includes('Cursed') && !isGuarded) {
                const curseDamage = Math.max(1, Math.floor(pokemon.maxHp / 4));
                pokemon.currentHp = Math.max(0, pokemon.currentHp - curseDamage);
                newLog.push({ type: 'text', text: `${pokemon.name} is afflicted by the curse!` });
            }
            if (pokemon.volatileStatuses.includes('Nightmare') && pokemon.status === 'Asleep' && !isGuarded) {
                const nightmareDamage = Math.max(1, Math.floor(pokemon.maxHp / 4));
                pokemon.currentHp = Math.max(0, pokemon.currentHp - nightmareDamage);
                newLog.push({ type: 'text', text: `${pokemon.name} is trapped in a nightmare!` });
            }
            // GENERIC STATUS/FIELD DAMAGE
            if (!isGuarded) {
                if (pokemon.status === 'Poisoned' || pokemon.status === 'Badly Poisoned') {
                    // The Poison Heal check prevents this block from running for that ability
                    if (abilityName !== 'poison-heal') {
                        const poisonDmg = pokemon.status === 'Badly Poisoned'
                            ? Math.floor((pokemon.maxHp / 16) * (pokemon.badlyPoisonedCounter || 1))
                            : Math.floor(pokemon.maxHp / 8);
                        pokemon.currentHp = Math.max(0, pokemon.currentHp - poisonDmg);
                        if (pokemon.status === 'Badly Poisoned') pokemon.badlyPoisonedCounter = (pokemon.badlyPoisonedCounter || 1) + 1;
                        newLog.push({ type: 'text', text: `${pokemon.name} was hurt by poison!` });
                    }
                }
                if (pokemon.status === 'Burned' && abilityName !== 'heatproof') {
                    const burnDmg = Math.floor(pokemon.maxHp / 16);
                    pokemon.currentHp = Math.max(0, pokemon.currentHp - burnDmg);
                    newLog.push({ type: 'text', text: `${pokemon.name} was hurt by its burn!` });
                }
                if (field?.weather === 'sandstorm') {
                    const isImmune = pokemon.types.includes('rock') || pokemon.types.includes('ground') || pokemon.types.includes('steel') || ['sand-veil', 'sand-rush', 'sand-force'].includes(abilityName);
                    if (!isImmune) {
                        const sandDamage = Math.max(1, Math.floor(pokemon.maxHp / 16));
                        pokemon.currentHp = Math.max(0, pokemon.currentHp - sandDamage);
                        newLog.push({ type: 'text', text: `${pokemon.name} is buffeted by the sandstorm!` });
                    }
                }
            }
            if (pokemon.currentHp === 0) { pokemon.fainted = true; newLog.push({ type: 'text', text: `${pokemon.name} fainted!` }); }
        });

        // FIELD STATE DECREMENT
        if (field?.weatherTurns > 0) {
            field.weatherTurns--;
            if (field.weatherTurns === 0) {
                newLog.push({ type: 'text', text: `The ${field.weather.replace('-', ' ')} stopped.` });
                field.weather = 'none';
            }
        }
        if (field?.terrainTurns > 0) {
            field.terrainTurns--;
            if (field.terrainTurns === 0) {
                newLog.push({ type: 'text', text: `The ${field.terrain.replace('-', ' ')} disappeared.` });
                field.terrain = 'none';
            }
        }
        if (field?.trickRoomTurns > 0) {
            field.trickRoomTurns--;
            if (field.trickRoomTurns === 0) {
                newLog.push({ type: 'text', text: 'The twisted dimensions returned to normal.' });
            }
        }
        if (field?.magicRoomTurns > 0) {
            field.magicRoomTurns--;
            if (field.magicRoomTurns === 0) {
                newLog.push({ type: 'text', text: 'The strange room returned to normal.' });
            }
        }
        if (field?.gravityTurns > 0) {
            field.gravityTurns--;
            if (field.gravityTurns === 0) {
                newLog.push({ type: 'text', text: 'The gravity returned to normal.' });
            }
        }
        if (field?.wonderRoomTurns > 0) {
            field.wonderRoomTurns--;
            if (field.wonderRoomTurns === 0) {
                newLog.push({ type: 'text', text: 'The weird dimensions returned to normal.' });
            }
        }
    };
    // In useBattleEngine.js

    const calculateDamage = (attacker, defender, move, isCritical, currentBattleState, newLog) => {
        const attackerAbility = getEffectiveAbility(attacker, currentBattleState)?.toLowerCase();
        const defenderAbility = getEffectiveAbility(defender, currentBattleState)?.toLowerCase();
        const isSpecial = move.damage_class.name === 'special';
        const moveForCalc = { ...move, isSpecial };

        // Ability-based immunities (not affected by Magic Room)
        if (abilityEffects[defenderAbility]?.onCheckImmunity?.(moveForCalc, defender, attackerAbility, newLog, applyStatChange, currentBattleState)) {
            return { damage: 0, effectiveness: 0 };
        }

        if (abilityEffects[attackerAbility]?.onModifyMove) {
            abilityEffects[attackerAbility].onModifyMove(moveForCalc, attacker, currentBattleState);
        }

        let initialEffectiveness = 1;
        defender.types.forEach(type => { initialEffectiveness *= TYPE_CHART[move.type]?.[type] ?? 1; });

        if (initialEffectiveness === 0) {
            const defenderItem = defender.heldItem?.name.toLowerCase();
            if (defenderItem === 'ring-target') {
                initialEffectiveness = 1; // The move now hits for neutral damage
                newLog.push({ type: 'text', text: `${defender.name}'s Ring Target made it vulnerable!` });
            } else {
                newLog.push({ type: 'text', text: `It had no effect on ${defender.name}...` });
                return { damage: 0, effectiveness: 0 };
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
        if (abilityEffects[attackerAbility]?.onModifyMove) abilityEffects[attackerAbility].onModifyMove(details, attacker);
        if (abilityEffects[attackerAbility]?.onModifyStat) details.attack = abilityEffects[attackerAbility].onModifyStat(attackStageKey, details.attack, attacker);
        if (abilityEffects[defenderAbility]?.onModifyStat) details.defense = abilityEffects[defenderAbility].onModifyStat(defenseStageKey, details.defense, defender, attacker);
        if (attacker.status?.toLowerCase() === 'burned' && !isSpecial && attackerAbility !== 'guts') details.attack /= 2;
        if (isCritical && !abilityEffects[defenderAbility]?.onCritImmunity?.(defender, move, attackerAbility)) details.critMultiplier = (attackerAbility === 'sniper') ? 2.25 : 1.5;

        // Item-based modifications (skipped if Magic Room is active)
        if (currentBattleState.field.magicRoomTurns === 0) {
            const attackerItem = attacker.heldItem?.name.toLowerCase();
            const defenderItem = defender.heldItem?.name.toLowerCase();

            if (itemEffects[attackerItem]?.onModifyMove) itemEffects[attackerItem].onModifyMove(details, attacker);
            if (itemEffects[attackerItem]?.onModifyStat) details.attack = itemEffects[attackerItem].onModifyStat(attackStageKey, details.attack, attacker);
            if (itemEffects[defenderItem]?.onModifyStat) details.defense = itemEffects[defenderItem].onModifyStat(defenseStageKey, details.defense, defender);
            if (itemEffects[attackerItem]?.onModifyDamage) itemEffects[attackerItem].onModifyDamage(details, attacker, move);
            if (itemEffects[defenderItem]?.onModifyDamage) itemEffects[defenderItem].onModifyDamage(details, defender, move);
            if (itemEffects['super-effective-berry']?.onModifyDamage) itemEffects['super-effective-berry'].onModifyDamage(details, defender, move);
        }

        details.finalMultiplier *= details.stabMultiplier;
        details.finalMultiplier *= details.critMultiplier;
        details.finalMultiplier *= details.effectiveness;

        // Final ability-based damage modifications
        if (abilityEffects[attackerAbility]?.onModifyDamage) abilityEffects[attackerAbility].onModifyDamage(details, attacker, move);
        if (abilityEffects[defenderAbility]?.onModifyDamage) abilityEffects[defenderAbility].onModifyDamage(details, defender, move, attackerAbility);

        let baseDamage = Math.floor(((((2 * attacker.level / 5 + 2) * details.power * (details.attack / details.defense)) / 50) + 2));
        let finalDamage = Math.floor(baseDamage * details.finalMultiplier);

        return { damage: Math.max(1, finalDamage), effectiveness: details.effectiveness, berryTriggered: details.berryTriggered, breakdown: details };
    };

    const saveFinalPokemonState = async (finalBattleState) => {
        const batch = writeBatch(db);
        const uniqueTrainerIds = [...new Set(finalBattleState.teams.flatMap(team => team.pokemon.map(p => p.originalTrainerId)))].filter(Boolean);
        if (uniqueTrainerIds.length === 0) return;
        try {
            const trainerPromises = uniqueTrainerIds.map(id => getDoc(doc(db, `artifacts/${appId}/public/data/trainers`, id)));
            const trainerDocSnaps = await Promise.all(trainerPromises);
            trainerDocSnaps.forEach(trainerDocSnap => {
                if (trainerDocSnap.exists()) {
                    const currentTrainerData = trainerDocSnap.data();
                    const trainerId = trainerDocSnap.id;
                    let rosterWasUpdated = false;
                    const newRoster = currentTrainerData.roster.map(rosterPoke => {
                        const battleVersion = finalBattleState.teams
                            .flatMap(team => team.pokemon)
                            .find(p => p.id === rosterPoke.id);
                        if (battleVersion) {
                            rosterWasUpdated = true;
                            return battleVersion;
                        }
                        return rosterPoke;
                    });
                    if (rosterWasUpdated) {
                        const trainerDocRef = doc(db, `artifacts/${appId}/public/data/trainers`, trainerId);
                        batch.update(trainerDocRef, { roster: newRoster });
                    }
                }
            });
            await batch.commit();
        } catch (error) {
            console.error("--- State Save Process FAILED ---", error);
        }
    };

    const findNextReplacement = (currentState) => {
        for (let teamIndex = 0; teamIndex < currentState.teams.length; teamIndex++) {
            const team = currentState.teams[teamIndex];
            const teamKey = team.id === 'players' ? 'players' : 'opponent';
            const activeIndices = currentState.activePokemonIndices[teamKey];

            for (let slotIndex = 0; slotIndex < activeIndices.length; slotIndex++) {
                const pokemonIndex = activeIndices[slotIndex];
                if (team.pokemon[pokemonIndex] && team.pokemon[pokemonIndex].fainted) {
                    const hasReplacements = team.pokemon.some((p, i) => p && !p.fainted && !activeIndices.includes(i));
                    if (hasReplacements) {
                        return { teamIndex, slotIndex };
                    }
                }
            }
        }
        return null;
    };

    const handlePhaseManagement = async (currentBattleState, newLog) => {
        const nextReplacement = findNextReplacement(currentBattleState);
        if (nextReplacement) {
            currentBattleState.phase = 'REPLACEMENT';
            currentBattleState.replacementInfo = nextReplacement;
        } else {
            const isPlayerTeamWiped = currentBattleState.teams[0].pokemon.every(p => p.fainted);
            const isOpponentTeamWiped = currentBattleState.teams[1].pokemon.every(p => p.fainted);
            if (isPlayerTeamWiped || isOpponentTeamWiped) {
                currentBattleState.phase = 'GAME_OVER';
                currentBattleState.gameOver = true;
                newLog.push({ type: 'text', text: 'The battle is over!' });
                await saveFinalPokemonState(currentBattleState);
            } else {
                currentBattleState.phase = 'ACTION_SELECTION';
                if (currentBattleState.turn) currentBattleState.turn += 1; else currentBattleState.turn = 1;
            }
        }
    };

    const handleSwitchIn = async (teamIndex, slotIndex, newPokemonId) => {
        let currentBattleState = JSON.parse(JSON.stringify(battleState));
        const teamKey = teamIndex === 0 ? 'players' : 'opponent';
        let newLog = [...currentBattleState.log];
        const pokemonToSwitchOut = currentBattleState.teams[teamIndex].pokemon[currentBattleState.activePokemonIndices[teamKey][slotIndex]];
        const originalTrainer = allTrainers.find(t => t.id === pokemonToSwitchOut.originalTrainerId);
        if (originalTrainer) {
            const originalPokemonData = originalTrainer.roster.find(p => p.id === pokemonToSwitchOut.id);
            // Reset the Pokémon's types to its original state.
            if (originalPokemonData) {
                pokemonToSwitchOut.types = [...originalPokemonData.types];
            }
        }
        pokemonToSwitchOut.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
        pokemonToSwitchOut.volatileStatuses = [];
        pokemonToSwitchOut.lockedMove = null;
        newLog.push({ type: 'text', text: `${pokemonToSwitchOut.name}'s stats and volatile conditions were reset.` });
        const newPokemonGlobalIndex = currentBattleState.teams[teamIndex].pokemon.findIndex(p => p.id === newPokemonId);
        const newPokemon = currentBattleState.teams[teamIndex].pokemon[newPokemonGlobalIndex];
        currentBattleState.activePokemonIndices[teamKey][slotIndex] = newPokemonGlobalIndex;
        currentBattleState.replacementInfo = null;
        newLog.push({ type: 'text', text: `${newPokemon.name} is sent out!` });
        // CORRECTED FUNCTION CALL
        runOnSwitchIn([newPokemon], currentBattleState, newLog);
        await handlePhaseManagement(currentBattleState, newLog);
        await updateDoc(battleDocRef, { ...currentBattleState, log: newLog });
    };

    const handleExecuteTurn = async () => {
        setIsProcessingTurn(true);
        let currentBattleState = JSON.parse(JSON.stringify(battleState));
        let allActions = { ...queuedActions };
        let newLog = [...currentBattleState.log, { type: 'text', text: `--- Turn ${battleState.turn} ---` }];
        currentBattleState.ejectQueue = [];
        currentBattleState.formChangeQueue = [];
        currentBattleState.forcedSwitchQueue = [];

        const sortedActions = Object.values(allActions).sort((a, b) => {
            let priorityA = (a.type === 'SWITCH' || a.type === 'ITEM') ? 10 : (a.move?.priority || 0);
            let priorityB = (b.type === 'SWITCH' || b.type === 'ITEM') ? 10 : (b.move?.priority || 0);

            // Check for priority-modifying items and statuses
            if (a.quickClawActivated) priorityA += 100;
            if (b.quickClawActivated) priorityB += 100;
            if (a.pokemon.custapBerryActivated) priorityA += 100;
            if (b.pokemon.custapBerryActivated) priorityB += 100;

            // Check for priority-modifying abilities
            if (a.type === 'FIGHT' && getEffectiveAbility(a.pokemon, currentBattleState)?.toLowerCase() === 'prankster') {
                if (a.move.damage_class.name === 'status') priorityA += 1;
            }
            if (b.type === 'FIGHT' && getEffectiveAbility(b.pokemon, currentBattleState)?.toLowerCase() === 'prankster') {
                if (b.move.damage_class.name === 'status') priorityB += 1;
            }
            // This is where you would add other ability priority checks like Gale Wings

            if (priorityA !== priorityB) return priorityB - priorityA;

            // If priority is the same, sort by speed
            const calculateTurnOrderSpeed = (pokemon) => {
                if (!pokemon) return 0;
                let speed = (pokemon.stats?.speed || 0) * getStatModifier(pokemon.stat_stages?.speed || 0);
                if (pokemon.boosterBoost?.stat === 'speed') {
                    speed *= pokemon.boosterBoost.multiplier;
                }
                // --- MODIFIED getEffectiveAbility CALLS ---
                const abilityName = getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase();

                // --- ADD THIS BLOCK for Unburden ---
                if (abilityName === 'unburden' && pokemon.originalHeldItem && !pokemon.heldItem) {
                    speed *= 2;
                }
                const itemName = pokemon.heldItem?.name.toLowerCase();
                if (pokemon.status === 'Paralyzed') { speed /= 2; }
                if (currentBattleState.field.magicRoomTurns === 0) {
                    if (itemName === 'choice scarf') { speed *= 1.5; }
                    if (itemName === 'iron ball') { speed *= 0.5; }
                }
                if (abilityName === 'stall' || itemName === 'lagging-tail' || itemName === 'full-incense') {
                    return -1; // Return a very low number to guarantee it moves last
                }
                return speed;
            };
            let speedA = calculateTurnOrderSpeed(a.pokemon);
            let speedB = calculateTurnOrderSpeed(b.pokemon);

            if (currentBattleState.field.trickRoomTurns > 0) {
                return speedA - speedB;
            }
            return speedB - speedA;
        });
        setTurnOrder(sortedActions);

        for (const action of sortedActions) {
            const actorData = action.pokemon;
            const actorTeamIndex = currentBattleState.teams.findIndex(t => t.pokemon.some(p => p.id === actorData.id));
            const actorTeamId = currentBattleState.teams[actorTeamIndex].id;
            const actorPokemonIndex = currentBattleState.teams[actorTeamIndex].pokemon.findIndex(p => p.id === actorData.id);
            const actor = currentBattleState.teams[actorTeamIndex].pokemon[actorPokemonIndex];
            currentBattleState.turnOrder = sortedActions.map(action => action.pokemon.id);
            if (actor.fainted) continue;

            if (actor.volatileStatuses.some(s => (s.name || s) === 'Confused')) {
                if (action.willSnapOutOfConfusion) {
                    actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Confused');
                    newLog.push({ type: 'text', text: `${actor.name} snapped out of its confusion!` });
                } else if (action.willHurtSelfInConfusion) {
                    newLog.push({ type: 'text', text: `${actor.name} hurt itself in its confusion!` });
                    const confusionMove = { power: 40, damage_class: { name: 'physical' }, type: 'internal' };
                    let { damage } = calculateDamage(actor, actor, confusionMove, false, currentBattleState, newLog);
                    actor.currentHp = Math.max(0, actor.currentHp - damage);
                    if (actor.currentHp === 0) {
                        actor.fainted = true;
                        newLog.push({ type: 'text', text: `${actor.name} fainted!` });
                    }
                    continue;
                }
            }

            if (actor.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
                const sourceOfLove = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === actor.infatuatedWith);
                if (!sourceOfLove || sourceOfLove.fainted) {
                    actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Infatuated');
                    actor.infatuatedWith = null;
                } else if (action.isImmobilizedByLove) {
                    newLog.push({ type: 'text', text: `${actor.name} is immobilized by love!` });
                    continue;
                }
            }

            let canMove = true;
            if (actor.status === 'Asleep') {
                if (action.willWakeUp) { newLog.push({ type: 'text', text: `${actor.name} woke up!` }); actor.status = 'None'; }
                else { newLog.push({ type: 'text', text: `${actor.name} is fast asleep.` }); canMove = false; }
            } else if (actor.status === 'Frozen') {
                if (action.willThaw) { newLog.push({ type: 'text', text: `${actor.name} thawed out!` }); actor.status = 'None'; }
                else { newLog.push({ type: 'text', text: `${actor.name} is frozen solid!` }); canMove = false; }
            } else if (actor.status === 'Paralyzed' && action.isFullyParalyzed) {
                newLog.push({ type: 'text', text: `${actor.name} is fully paralyzed!` }); canMove = false;
            }

            if (!canMove) continue;

            if (action.type === 'FIGHT') {



                const move = { ...actor.moves.find(m => m.name === action.move.name) };
                if (!move.name) continue;

                const moveNameLower = move.name.toLowerCase();
                const actorAbility = actor.ability?.toLowerCase();
                const itemName = actor.heldItem?.name.toLowerCase();

                if (abilityEffects[actorAbility]?.onBeforeMove) {
                    abilityEffects[actorAbility].onBeforeMove(actor, move, currentBattleState, newLog);
                }
                if (currentBattleState.field.magicRoomTurns === 0 && itemEffects[itemName]?.onBeforeMove) {
                    itemEffects[itemName].onBeforeMove(actor, move, currentBattleState, newLog);
                }

                const actorTeam = currentBattleState.teams[actorTeamIndex];

                if (moveNameLower === 'trick-room') {
                    if (currentBattleState.field.trickRoomTurns > 0) {
                        currentBattleState.field.trickRoomTurns = 0;
                        newLog.push({ type: 'text', text: `${actor.name} returned the twisted dimensions to normal!` });
                    } else {
                        currentBattleState.field.trickRoomTurns = 5;
                        newLog.push({ type: 'text', text: `${actor.name} twisted the dimensions!` });
                    }
                    continue;
                }
                if (moveNameLower === 'magic-room') {
                    if (currentBattleState.field.magicRoomTurns > 0) {
                        currentBattleState.field.magicRoomTurns = 0;
                        newLog.push({ type: 'text', text: 'The strange room disappeared.' });
                    } else {
                        currentBattleState.field.magicRoomTurns = 5;
                        newLog.push({ type: 'text', text: 'It created a strange room where items cant be used!' });
                    }
                    continue;
                }
                if (moveNameLower === 'gravity') {
                    if (currentBattleState.field.gravityTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                    else { currentBattleState.field.gravityTurns = 5; newLog.push({ type: 'text', text: 'Gravity intensified!' }); }
                    continue;
                }
                if (moveNameLower === 'wonder-room') {
                    if (currentBattleState.field.wonderRoomTurns > 0) {
                        currentBattleState.field.wonderRoomTurns = 0;
                        newLog.push({ type: 'text', text: 'The weird dimensions disappeared.' });
                    } else {
                        currentBattleState.field.wonderRoomTurns = 5;
                        newLog.push({ type: 'text', text: 'It created a weird room where Defense and Sp. Def stats are swapped!' });
                    }
                    continue;
                }
                if (REFLECT_TYPE_MOVES.has(moveNameLower)) {
                    if (actorTeam.reflectTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                    else { actorTeam.reflectTurns = (itemName === 'light clay') ? 8 : 5; newLog.push({ type: 'text', text: `A wall of light protected ${actorTeam.id}'s team!` }); }
                    continue;
                }
                if (LIGHT_SCREEN_TYPE_MOVES.has(moveNameLower)) {
                    if (actorTeam.lightScreenTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                    else { actorTeam.lightScreenTurns = (itemName === 'light clay') ? 8 : 5; newLog.push({ type: 'text', text: `A wall of light protected ${actorTeam.id}'s team from special attacks!` }); }
                    continue;
                }
                if (AURORA_VEIL_MOVE.has(moveNameLower)) {
                    if (currentBattleState.field.weather !== 'snow') { newLog.push({ type: 'text', text: 'But it failed!' }); }
                    else if (actorTeam.auroraVeilTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                    else { actorTeam.auroraVeilTurns = (itemName === 'light clay') ? 8 : 5; newLog.push({ type: 'text', text: `A shimmering veil protected ${actorTeam.id}'s team!` }); }
                    continue;
                }
                const terrainToSet = MOVE_TO_TERRAIN_MAP.get(moveNameLower);
                if (terrainToSet) {
                    if (currentBattleState.field.terrain !== 'none') { newLog.push({ type: 'text', text: 'But it failed!' }); }
                    else { currentBattleState.field.terrain = terrainToSet; currentBattleState.field.terrainTurns = (itemName === 'terrain extender') ? 8 : 5; newLog.push({ type: 'text', text: `The battlefield became ${terrainToSet.replace('-', ' ')}!` }); }
                    continue;
                }
                const weatherToSet = MOVE_TO_WEATHER_MAP.get(moveNameLower);
                if (weatherToSet) {
                    const strongWeathers = ['heavy-rain', 'harsh-sunshine', 'strong-winds'];
                    // The move fails if the weather is the same or if a strong weather is active
                    if (currentBattleState.field.weather === weatherToSet || strongWeathers.includes(currentBattleState.field.weather)) {
                        newLog.push({ type: 'text', text: 'But it failed!' });
                    } else {
                        const requiredRock = WEATHER_EXTENDING_ROCKS[weatherToSet];
                        const duration = (itemName === requiredRock) ? 8 : 5;

                        currentBattleState.field.weather = weatherToSet;
                        currentBattleState.field.weatherTurns = duration;

                        let weatherMessage = `It started to ${weatherToSet}!`;
                        if (weatherToSet === 'sunshine') weatherMessage = 'The sunlight turned harsh!';

                        newLog.push({ type: 'text', text: weatherMessage });
                    }
                    continue; // Skip to the next action in the turn
                }
                if (moveNameLower === CURSE_MOVE) {
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
                    } else {
                        newLog.push({ type: 'text', text: `${actor.name} used Curse!` });
                        applyStatChange(actor, 'speed', -1, newLog, currentBattleState);
                        applyStatChange(actor, 'attack', 1, newLog, currentBattleState);
                        applyStatChange(actor, 'defense', 1, newLog, currentBattleState);
                    }
                    continue;
                }
                if (moveNameLower === NIGHTMARE_MOVE) {
                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                    if (target && target.status === 'Asleep' && !target.volatileStatuses.some(s => (s.name || s) === 'Nightmare')) {
                        target.volatileStatuses.push('Nightmare');
                        newLog.push({ type: 'text', text: `${target.name} began having a nightmare!` });
                    } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                    continue;
                }
                if (moveNameLower === ENCORE_MOVE) {
                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                    if (target && target.lastMoveUsed && !target.volatileStatuses.some(s => (s.name || s) === 'Encore')) {
                        target.volatileStatuses.push('Encore');
                        target.encoredMove = target.lastMoveUsed;
                        target.encoreTurns = 3;
                        newLog.push({ type: 'text', text: `${target.name} received an encore!` });
                    } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                    continue;
                }
                if (moveNameLower === TAUNT_MOVE) {
                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                    if (target && !target.volatileStatuses.some(s => (s.name || s) === 'Taunt')) {
                        target.volatileStatuses.push('Taunt');
                        target.tauntTurns = 3;
                        newLog.push({ type: 'text', text: `${target.name} was taunted!` });
                    } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                    continue;
                }
                if (moveNameLower === INFATUATION_MOVE) {
                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                    if (target && actor.gender !== 'Genderless' && target.gender !== 'Genderless' && actor.gender !== target.gender && !target.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
                        target.volatileStatuses.push('Infatuated');
                        target.infatuatedWith = actor.id;
                        newLog.push({ type: 'text', text: `${target.name} fell in love with ${actor.name}!` });

                        // --- NEW DESTINY KNOT LOGIC ---
                        if (target.heldItem?.name.toLowerCase() === 'destiny knot') {
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
                    continue;
                }
                if (ABILITY_SUPPRESSING_MOVES.has(moveNameLower)) {
                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                    if (target) {
                        // Ability Shield protects the target
                        if (target.heldItem?.name.toLowerCase() === 'ability-shield') {
                            newLog.push({ type: 'text', text: `${target.name}'s Ability Shield protected it!` });
                        }
                        // Certain abilities cannot be suppressed
                        else if (['multitype', 'stance-change', 'schooling'].includes(getEffectiveAbility(target)?.toLowerCase())) {
                            newLog.push({ type: 'text', text: 'But it failed!' });
                        }
                        // Otherwise, apply the status
                        else {
                            target.volatileStatuses.push('Ability Suppressed');
                            newLog.push({ type: 'text', text: `${target.name}'s ability was suppressed!` });
                        }
                    }
                    continue; // Skip the rest of the normal move execution
                }
                const replacementAbility = ABILITY_REPLACEMENT_MOVES.get(moveNameLower);
                if (replacementAbility) {
                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                    if (target) {
                        // Ability Shield protects the target
                        if (target.heldItem?.name.toLowerCase() === 'ability-shield') {
                            newLog.push({ type: 'text', text: `${target.name}'s Ability Shield protected it!` });
                        }
                        // Certain abilities cannot be replaced
                        else if (['multitype', 'stance-change', 'schooling'].includes(getEffectiveAbility(target)?.toLowerCase())) {
                            newLog.push({ type: 'text', text: 'But it failed!' });
                        }
                        // Otherwise, replace the ability
                        else {
                            // Store the original ability if it hasn't been stored already
                            if (!target.originalAbility) {
                                target.originalAbility = target.ability;
                            }
                            target.ability = replacementAbility;
                            newLog.push({ type: 'text', text: `${target.name}'s ability was changed to ${replacementAbility}!` });
                        }
                    }
                    continue; // Skip the rest of the normal move execution
                }
                if (TWO_TURN_MOVES.has(moveNameLower)) {
                    if (actor.volatileStatuses.includes('Charging')) {
                        actor.volatileStatuses = actor.volatileStatuses.filter(s => s !== 'Charging');
                    } else if (!move.powerHerbBoosted) {
                        actor.volatileStatuses.push('Charging');
                        newLog.push({ type: 'text', text: `${actor.name} began charging its move!` });
                        continue;
                    }
                }
                const singleTargetMoves = ['specific-move', 'selected-pokemon-me-first', 'all-other-pokemon'];
                const attackerAbility = getEffectiveAbility(actor, currentBattleState)?.toLowerCase();

                // Check if the move is single-target AND the attacker does not have an ability that bypasses redirection
                if (singleTargetMoves.includes(move.target?.name) && attackerAbility !== 'stalwart' && attackerAbility !== 'propeller-tail') {
                    let redirector = null;
                    const allActivePokemon = currentBattleState.teams.flatMap(t => {
                        const activeIndices = currentBattleState.activePokemonIndices[t.id];
                        return t.pokemon.filter((p, i) => activeIndices.includes(i) && p && !p.fainted && p.id !== actor.id);
                    });

                    for (const potentialRedirector of allActivePokemon) {
                        const redirectorAbility = getEffectiveAbility(potentialRedirector, currentBattleState)?.toLowerCase();
                        const abilityHook = abilityEffects[redirectorAbility]?.onRedirect;
                        if (abilityHook && abilityHook(move)) {
                            redirector = potentialRedirector;
                            break;
                        }
                    }

                    if (redirector) {
                        newLog.push({ type: 'text', text: `${redirector.name} drew in the attack!` });
                        action.targetIds = [redirector.id];
                        action.hits = action.hits.map(hit => ({ ...hit, targetId: redirector.id }));
                    }
                }
                move.ownerId = actor.id;
                let lastDamageDealt = 0;

                for (const [i, hit] of action.hits.entries()) {
                    // The target can be different for each individual hit
                    const targetId = hit.targetId;

                    let currentTargetId = targetId;
                    let originalTarget = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === currentTargetId);

                    // Check for Magic Bounce
                    if (originalTarget && getEffectiveAbility(originalTarget)?.toLowerCase() === 'magic-bounce' && REFLECTABLE_MOVES.has(moveNameLower)) {
                        currentTargetId = actor.id;
                        newLog.push({ type: 'text', text: `${originalTarget.name} bounced the move back!` });
                    }

                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === currentTargetId);
                    if (!target || target.fainted) {
                        console.warn(`Missing or fainted target:`, {
                            hitIndex: i,
                            targetId,
                            hits: action.hits,
                            targetIds: action.targetIds,
                            actor: actor.name,
                            move: move.name
                        });
                        newLog.push({ type: 'text', text: 'But there was no target!' });
                        continue;
                    }

                    // Create a fresh attack log entry for each hit
                    const attackEntry = {
                        type: 'attack',
                        attackerName: actor.name,
                        moveName: move.name,
                        defenderName: target.name,
                        isCritical: action.isCritical,
                        damage: 0,
                        effectivenessText: '',
                        fainted: false,
                        breakdown: {},
                        moveType: move?.type ?? 'status',
                        moveCategory: (typeof move?.damage_class === 'object' ? move.damage_class.name : move.damage_class) ?? 'status',
                    };

                    if (action.willHit) {
                        let { damage, effectiveness, berryTriggered, breakdown } = calculateDamage(actor, target, move, action.isCritical, currentBattleState, newLog);
                        lastDamageDealt = damage; // Update last damage dealt for recoil/drain calculations
                        attackEntry.breakdown = breakdown;

                        if (effectiveness > 1) attackEntry.effectivenessText = "It's super effective!";
                        if (effectiveness < 1 && effectiveness > 0) attackEntry.effectivenessText = "It's not very effective...";
                        if (effectiveness === 0) attackEntry.effectivenessText = "It had no effect...";

                        const targetAbility = getEffectiveAbility(target, currentBattleState)?.toLowerCase();
                        const targetItem = target.heldItem?.name.toLowerCase();

                        // Apply damage modifiers from abilities/items for this specific hit
                        if (abilityEffects[targetAbility]?.onTakeDamage) {
                            // --- MODIFIED LINE: Add applyStatChange to the call ---
                            damage = abilityEffects[targetAbility].onTakeDamage(damage, target, move, currentBattleState, newLog, getEffectiveAbility(actor), applyStatChange);
                        }
                        if (itemEffects[targetItem]?.onTakeDamage) {
                            damage = itemEffects[targetItem].onTakeDamage(damage, target, move, currentBattleState, newLog, applyStatChange);
                        }

                        attackEntry.damage = damage;

                        if (damage > 0) {
                            target.currentHp = Math.max(0, target.currentHp - damage);
                            const itemPreventsContact = ['protective-pads', 'punching-glove'].includes(itemName);
                            if (CONTACT_MOVES.has(move.name.toLowerCase()) && !itemPreventsContact) {
                                if (abilityEffects[targetAbility]?.onDamagedByContact && action.applyContactEffect) {
                                    // --- MODIFIED LINE: Add applyStatChange and currentBattleState to the call ---
                                    abilityEffects[targetAbility].onDamagedByContact(target, actor, newLog, applyStatChange, currentBattleState);
                                }
                                if (itemEffects[targetItem]?.onDamagedByContact) {
                                    itemEffects[targetItem].onDamagedByContact(target, actor, currentBattleState, newLog);
                                }
                            }
                        }

                        if (target.currentHp === 0) {
                            target.fainted = true;
                            attackEntry.fainted = true;
                            if (abilityEffects[actorAbility]?.onAfterKO) {
                                abilityEffects[actorAbility].onAfterKO(actor, target, newLog, applyStatChange, currentBattleState);
                            }
                        }

                        // For the very FIRST hit, apply secondary effects like status, stat changes, etc.
                        if (i === 0) {
                            // Apply Trapping status
                            if (damage > 0 && BINDING_MOVES.has(moveNameLower)) {
                                if (!target.volatileStatuses.some(s => s.name === 'Trapped')) {
                                    // Determine duration: 7 for Grip Claw, otherwise 4-5 turns.
                                    const duration = itemName === 'grip-claw'
                                        ? 7
                                        : Math.random() < 0.5 ? 4 : 5;

                                    target.volatileStatuses.push({
                                        name: 'Trapped',
                                        sourceId: actor.id,
                                        duration: duration
                                    });
                                    newLog.push({ type: 'text', text: `${target.name} was trapped!` });
                                }
                            }

                            // Apply Leech Seed status
                            if (moveNameLower === LEECH_SEED_MOVE) {
                                if (target.types.includes('grass')) { newLog.push({ type: 'text', text: `It doesn't affect ${target.name}...` }); }
                                else if (target.volatileStatuses.some(s => s.name === 'Leech Seed')) { newLog.push({ type: 'text', text: `${target.name} is already seeded!` }); }
                                else {
                                    target.volatileStatuses.push({ name: 'Leech Seed', sourceId: actor.id });
                                    newLog.push({ type: 'text', text: `${target.name} was seeded!` });
                                }
                            }

                            // Apply Confusion status from a damaging move
                            if (damage > 0 && CONFUSION_INDUCING_MOVES.has(moveNameLower) && action.applyEffect) {
                                if (!target.volatileStatuses.some(s => (s.name || s) === 'Confused')) {
                                    target.volatileStatuses.push('Confused');
                                    newLog.push({ type: 'text', text: `${target.name} became confused!` });
                                }
                            }

                            // Apply non-volatile status ailments (Burn, Poison, etc.)
                            const ailment = move.meta?.ailment?.name;
                            const ailmentChance = move.meta?.ailment_chance;
                            if (ailment && ailment !== 'none' && ailmentChance > 0 && action.applyEffect && !move.sheerForceBoosted) {
                                if (target.heldItem?.name.toLowerCase() === 'covert-cloak') {
                                    newLog.push({ type: 'text', text: `${target.name}'s Covert Cloak protected it from the additional effect!` });
                                } else if (target.status === 'None') {
                                    const statusToApply = API_AILMENT_TO_STATUS_MAP[ailment];
                                    if (statusToApply) {
                                        const isImmune =
                                            (statusToApply === 'Burned' && target.types.includes('fire')) ||
                                            (statusToApply === 'Frozen' && target.types.includes('ice')) ||
                                            (statusToApply === 'Paralyzed' && target.types.includes('electric')) ||
                                            ((statusToApply === 'Poisoned' || statusToApply === 'Badly Poisoned') && (target.types.includes('poison') || target.types.includes('steel')));

                                        if (!isImmune) {
                                            target.status = statusToApply;
                                            newLog.push({ type: 'text', text: `${target.name} was afflicted with ${statusToApply.toLowerCase()}!` });
                                        }
                                    }
                                }
                            }
                            if (move.stat_changes && move.stat_changes.length > 0 && !move.sheerForceBoosted && action.applyEffect) {
                                for (const targetId of action.targetIds) {
                                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === targetId);
                                    if (target && !target.fainted) {
                                        // Check for Covert Cloak before applying effect
                                        if (target.heldItem?.name.toLowerCase() === 'covert cloak') {
                                            newLog.push({ type: 'text', text: `${target.name}'s Covert Cloak protected it from the additional effect!` });
                                            continue; // Skip to the next target
                                        }
                                        move.stat_changes.forEach(sc => {
                                            applyStatChange(target, sc.stat.name, sc.change, newLog, currentBattleState);
                                        });
                                    }
                                }
                            }
                        }

                    } else {
                        newLog.push({ type: 'text', text: `${actor.name}'s attack missed ${target.name}!` });
                        const itemNameOnMiss = actor.heldItem?.name.toLowerCase();
                        if (itemEffects[itemNameOnMiss]?.onMiss) {
                            itemEffects[itemNameOnMiss].onMiss(actor, move, currentBattleState, newLog, applyStatChange);
                        }
                        break; // If any hit misses, the entire move's sequence ends
                    }
                    newLog.push(attackEntry);
                }
                if (actorAbility === 'parental-bond' && lastDamageDealt > 0) {
                    newLog.push({ type: 'text', text: 'The parent hit again!' });
                    // The second hit does 25% of the original damage.
                    const secondHitMove = { ...move, power: move.power * 0.25 };

                    for (const targetId of action.targetIds) {
                        const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === targetId);
                        if (target && !target.fainted) {
                            let { damage: secondHitDamage } = calculateDamage(actor, target, secondHitMove, false, currentBattleState, newLog);
                            target.currentHp = Math.max(0, target.currentHp - secondHitDamage);
                            newLog.push({ type: 'text', text: `${target.name} took an additional ${secondHitDamage} damage!` });
                            if (target.currentHp === 0) {
                                target.fainted = true;
                                newLog.push({ type: 'text', text: `${target.name} fainted!` });
                            }
                        }
                    }
                }
                if (itemEffects[itemName]?.onAfterMove) { itemEffects[itemName].onAfterMove(actor, move, currentBattleState, newLog); }
                if (itemEffects[itemName]?.onAfterDamageDealt) {
                    itemEffects[itemName].onAfterDamageDealt(lastDamageDealt, actor, move, currentBattleState, newLog);
                }
                const moveNameKey = move.name.toLowerCase().replace(/\s/g, '-');
                if (RECOIL_MOVES.has(moveNameKey) && lastDamageDealt > 0 && actor.currentHp > 0 && actorAbility !== 'magic-guard') {
                    const recoilFraction = RECOIL_MOVES.get(moveNameKey);
                    const recoilDamage = Math.max(1, Math.floor(lastDamageDealt * recoilFraction));
                    actor.currentHp = Math.max(0, actor.currentHp - recoilDamage);
                    newLog.push({ type: 'text', text: `${actor.name} is damaged by recoil!` });
                    if (actor.currentHp === 0) {
                        actor.fainted = true;
                        newLog.push({ type: 'text', text: `${actor.name} fainted!` });
                    }
                }
                if (DRAIN_MOVES.has(moveNameKey) && actor.currentHp > 0 && actor.currentHp < actor.maxHp) {
                    let healFraction = DRAIN_MOVES.get(moveNameKey);
                    let healAmount = Math.max(1, Math.floor(lastDamageDealt * healFraction));

                    // Check for Big Root, which increases healing from drain moves
                    if (itemName === 'big root') {
                        healAmount = Math.floor(healAmount * 1.3);
                    }

                    actor.currentHp = Math.min(actor.maxHp, actor.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${actor.name} drained health!` });
                }
                if (move.gemBoosted) { newLog.push({ type: 'text', text: `${actor.name}'s ${actor.heldItem.name} made the move stronger!` }); actor.heldItem = null; }
                if (move.powerHerbBoosted) {
                    actor.lastConsumedItem = actor.heldItem;
                    actor.heldItem = null;
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
            } else if (action.type === 'Z_MOVE') {
                const { baseMove, pokemon: actor, isCritical } = action;
                const actorTeamId = currentBattleState.teams.find(t => t.pokemon.some(p => p.id === actor.id))?.id;
                if (!actorTeamId || currentBattleState.zMoveUsed[actorTeamId]) continue;

                currentBattleState.zMoveUsed[actorTeamId] = true;
                newLog.push({ type: 'text', text: `${actor.name} is unleashing its full-force Z-Move!` });

                const crystalData = Z_CRYSTAL_MAP[actor.heldItem?.name?.toLowerCase().replace(/\s/g, '-')];
                if (!crystalData) continue;

                const zMoveObject = {
                    name: crystalData.moveName,
                    power: getZMovePower(baseMove.power),
                    type: crystalData.type,
                    damage_class: baseMove.damage_class,
                    meta: {},
                };
                newLog.push({ type: 'attack', attackerName: actor.name, moveName: zMoveObject.name });

                action.targetIds.forEach(targetId => {
                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === targetId);
                    if (target && !target.fainted) {
                        let { damage, effectiveness } = calculateDamage(actor, target, zMoveObject, isCritical, currentBattleState, newLog);
                        target.currentHp = Math.max(0, target.currentHp - damage);
                        if (effectiveness > 1) newLog.push({ type: 'text', text: "It's super effective!" });
                        if (target.currentHp === 0) {
                            target.fainted = true;
                            newLog.push({ type: 'text', text: `${target.name} fainted!` });
                        }
                    }
                });
            } else if (action.type === 'SWITCH') {
                const trainer = allTrainers.find(t => t.id === actor.originalTrainerId);
                newLog.push({ type: 'text', text: `${trainer.name} withdraws ${actor.name}!` });
                if (actor.transformed && actor.basePokemonState) {
                    const originalName = actor.basePokemonState.name; // Keep name for log
                    // Restore the original state from the backup
                    Object.assign(actor, actor.basePokemonState);
                    // Clean up the transformation properties
                    delete actor.transformed;
                    delete actor.basePokemonState;
                    newLog.push({ type: 'text', text: `${originalName} reverted to its original form!` });
                }
                // --- Find original data to reset types ---
                const originalPokemonData = trainer.roster.find(p => p.id === actor.id);
                if (originalPokemonData) {
                    actor.types = [...originalPokemonData.types];
                }
                if (abilityEffects[getEffectiveAbility(actor)?.toLowerCase()]?.onSwitchOut) {
                    abilityEffects[getEffectiveAbility(actor).toLowerCase()].onSwitchOut(actor, currentBattleState, newLog);
                }

                // --- ADD THIS BLOCK TO RESTORE ABILITY ---
                if (actor.originalAbility) {
                    actor.ability = actor.originalAbility;
                    actor.originalAbility = null; // Clear the stored original ability
                }
                // --- NEW LOGIC: Remove effects from opponents ---
                const opponentTeam = currentBattleState.teams.find(t => t.id !== actorTeamId);
                if (opponentTeam) {
                    opponentTeam.pokemon.forEach(opponent => {
                        if (opponent.volatileStatuses.length > 0) {
                            // Remove any status where the source was the Pokémon switching out
                            opponent.volatileStatuses = opponent.volatileStatuses.filter(status => {
                                const shouldRemove = status.sourceId && status.sourceId === actor.id;
                                if (shouldRemove) {
                                    newLog.push({ type: 'text', text: `The ${status.name} effect wore off from ${opponent.name}!` });
                                }
                                return !shouldRemove;
                            });
                        }
                    });
                }
                // --- END NEW LOGIC ---

                // Clear the switching Pokémon's own statuses and stat changes
                actor.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
                actor.volatileStatuses = [];
                actor.lockedMove = null;
                const newPokemonGlobalIndex = currentBattleState.teams[actorTeamIndex].pokemon.findIndex(p => p.id === action.newPokemonId);
                currentBattleState.activePokemonIndices[actorTeamIndex === 0 ? 'players' : 'opponent'][action.slotIndex] = newPokemonGlobalIndex;
                const newPokemon = currentBattleState.teams[actorTeamIndex].pokemon[newPokemonGlobalIndex];
                newLog.push({ type: 'text', text: `${trainer.name} sends out ${newPokemon.name}!` });
                runOnSwitchIn([newPokemon], currentBattleState, newLog);
            } else if (action.type === 'ITEM') {
                // --- MODIFIED --- This block now uses applyStatChange
                const trainer = allTrainers.find(t => t.id === actor.originalTrainerId);
                const item = action.item;
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetId);
                if (!target || !trainer) continue;
                newLog.push({ type: 'text', text: `${trainer.name} used a ${item.name} on ${target.name}.` });
                const trainerData = allTrainers.find(t => t.id === target.originalTrainerId);
                if (trainerData) {
                    const itemInBag = trainerData.inventory.find(i => i.name === item.name);
                    if (itemInBag) {
                        itemInBag.quantity -= 1;
                        if (itemInBag.quantity === 0) {
                            trainerData.inventory = trainerData.inventory.filter(i => i.name !== item.name);
                        }
                    }
                }
                if (item.category === 'healing') {
                    if (target.currentHp === target.maxHp) {
                        newLog.push({ type: 'text', text: 'It had no effect...' });
                    } else {
                        const healAmount = item.healAmount || (target.maxHp / 2);
                        target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                        newLog.push({ type: 'text', text: `${target.name} recovered HP!` });
                    }
                } else if (item.category === 'revival') {
                    if (target.fainted) {
                        target.fainted = false;
                        target.currentHp = Math.floor(target.maxHp * (item.healPercent || 0.5));
                        newLog.push({ type: 'text', text: `${target.name} was revived!` });
                    }
                } else if (item.category === 'status-cure') {
                    const cureTarget = item.cures;
                    if (target.status === cureTarget) {
                        target.status = 'None';
                        newLog.push({ type: 'text', text: `${target.name} was cured of its ${cureTarget.toLowerCase()}!` });
                    } else if (cureTarget === 'All') {
                        target.status = 'None';
                        newLog.push({ type: 'text', text: `${target.name}'s status was fully restored!` });
                    }
                } else if (item.category === 'stat-boost') {
                    const statToBoost = item.stat;
                    const boostAmount = item.stages || 2;
                    if (target.stat_stages[statToBoost] < 6) {
                        // --- MODIFIED --- Use the new helper function here
                        applyStatChange(target, statToBoost, boostAmount, newLog, currentBattleState);
                        newLog.push({ type: 'text', text: `${target.name}'s ${statToBoost.replace('-', ' ')} rose sharply!` });
                    } else {
                        newLog.push({ type: 'text', text: `${target.name}'s stats won't go any higher!` });
                    }
                }
            }
        }

        runEndOfTurnPhase(currentBattleState, newLog);
        if (currentBattleState.forcedSwitchQueue.length > 0) {
            for (const forcedSwitch of currentBattleState.forcedSwitchQueue) {
                const { teamId, teamKey, slotIndex, pokemonToSwitchOutId, replacementId } = forcedSwitch;

                const team = currentBattleState.teams.find(t => t.id === teamId);
                const pokemonToSwitchOut = team.pokemon.find(p => p.id === pokemonToSwitchOutId);
                const trainer = allTrainers.find(t => t.id === pokemonToSwitchOut.originalTrainerId);

                newLog.push({ type: 'text', text: `${pokemonToSwitchOut.name} was dragged out!` });

                // Reset types and stats of the outgoing Pokémon
                const originalPokemonData = trainer.roster.find(p => p.id === pokemonToSwitchOut.id);
                if (originalPokemonData) {
                    pokemonToSwitchOut.types = [...originalPokemonData.types];
                }
                pokemonToSwitchOut.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
                pokemonToSwitchOut.volatileStatuses = [];

                // Perform the switch
                const newPokemonGlobalIndex = team.pokemon.findIndex(p => p.id === replacementId);
                currentBattleState.activePokemonIndices[teamKey][slotIndex] = newPokemonGlobalIndex;
                const newPokemon = team.pokemon[newPokemonGlobalIndex];

                newLog.push({ type: 'text', text: `${trainer.name} sends out ${newPokemon.name}!` });
                runOnSwitchIn([newPokemon], currentBattleState, newLog);
            }
        }

        if (currentBattleState.formChangeQueue.length > 0) {
            currentBattleState.formChangeQueue.forEach(change => {
                const pokemonInState = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === change.pokemon.id);
                if (pokemonInState) {
                    if (change.type === 'RESOLVE') {
                        resolveFormChange(pokemonInState, change.form, newLog);
                    } else if (change.type === 'REVERT') {
                        revertFormChange(pokemonInState, newLog);
                    }
                }
            });
        }

        await handlePhaseManagement(currentBattleState, newLog);
        await updateDoc(battleDocRef, { ...currentBattleState, log: newLog });
        setQueuedActions({});
        setTurnOrder([]);
        setIsProcessingTurn(false);
    };

    return { isProcessingTurn, handleExecuteTurn, handleSwitchIn };
};