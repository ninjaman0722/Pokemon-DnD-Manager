import { resolveChance, getEffectiveAbility } from '../battleUtils';
import { calculateDamage } from '../damageCalculator';
import { revertFormChange, calculateStatChange } from '../stateModifiers'; // Added calculateStatChange
import { abilityEffects } from '../abilityEffects';
import { handleFightAction } from '../actions/handleFightAction';

const preMoveChecks = (actor, battleState, newLog) => {
    if (actor.isLoafing) {
        // The log message is already added in startOfTurn, so we just block the move.
        return false; // Cannot move
    }
    if (actor.volatileStatuses.includes('Flinched')) {
        actor.volatileStatuses = actor.volatileStatuses.filter(s => s !== 'Flinched'); // Flinch is consumed after one turn.
        newLog.push({ type: 'text', text: `${actor.name} flinched and couldn't move!` });
        return false; // Cannot move
    }

    // 2. Check for Infatuation
    if (actor.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
        const sourceOfLove = battleState.teams.flatMap(t => t.pokemon).find(p => p.id === actor.infatuatedWith);
        if (!sourceOfLove || sourceOfLove.fainted) {
            actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Infatuated');
            actor.infatuatedWith = null;
            newLog.push({ type: 'text', text: `${actor.name} snapped out of its infatuation!` });
        } else {
            const dmFlagKey = `isImmobilizedByLove_${actor.id}`;
            if (resolveChance(50, dmFlagKey, battleState)) {
                newLog.push({ type: 'text', text: `${actor.name} is immobilized by love!` });
                return false; // Cannot move
            }
        }
    }

    // 3. Check for Confusion
    if (actor.volatileStatuses.some(s => (s.name || s) === 'Confused')) {
        newLog.push({ type: 'text', text: `${actor.name} is confused!` });
        const dmSnapOutKey = `willSnapOutOfConfusion_${actor.id}`;
        if (resolveChance(33.3, dmSnapOutKey, battleState)) {
            actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Confused');
            newLog.push({ type: 'text', text: `${actor.name} snapped out of its confusion!` });
        } else {
            const dmHurtSelfKey = `willHurtSelfInConfusion_${actor.id}`;
            if (resolveChance(33.3, dmHurtSelfKey, battleState)) {
                newLog.push({ type: 'text', text: `It hurt itself in its confusion!` });
                const confusionMove = { power: 40, damage_class: { name: 'physical' }, type: 'internal' };
                const { damage } = calculateDamage(actor, actor, confusionMove, false, battleState, newLog);
                actor.currentHp = Math.max(0, actor.currentHp - damage);
                if (actor.currentHp === 0) {
                    actor.fainted = true;
                    newLog.push({ type: 'text', text: `${actor.name} fainted!` });
                }
                return false; // Cannot move
            }
        }
    }

    // 4. Check for Sleep, Freeze, and Paralysis
    if (actor.status === 'Asleep') {
        const dmFlagKey = `willWakeUp_${actor.id}`;
        if (resolveChance(33.3, dmFlagKey, battleState)) {
            actor.status = 'None';
            newLog.push({ type: 'text', text: `${actor.name} woke up!` });
        } else {
            newLog.push({ type: 'text', text: `${actor.name} is fast asleep.` });
            return false; // Cannot move
        }
    } else if (actor.status === 'Frozen') {
        const dmFlagKey = `willThaw_${actor.id}`;
        if (resolveChance(20, dmFlagKey, battleState)) {
            actor.status = 'None';
            newLog.push({ type: 'text', text: `${actor.name} thawed out!` });
        } else {
            newLog.push({ type: 'text', text: `${actor.name} is frozen solid!` });
            return false; // Cannot move
        }
    } else if (actor.status === 'Paralyzed') {
        const dmFlagKey = `isFullyParalyzed_${actor.id}`;
        if (resolveChance(25, dmFlagKey, battleState)) {
            newLog.push({ type: 'text', text: `${actor.name} is fully paralyzed!` });
            return false; // Cannot move
        }
    }

    // If none of the above conditions prevented movement, the Pokémon can act.
    return true;
};

export const runMainActionPhase = (currentBattleState, sortedActions, redirectionMap, allTrainers, newLog, allQueuedActions) => {
    console.log("BEGIN: Main Action Phase");

    for (const action of sortedActions) {
        let actor = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.pokemon.id);
        if (!actor || actor.fainted) continue;

        const actorTeam = currentBattleState.teams.find(t => t.pokemon.some(p => p.id === actor.id));

        if (!preMoveChecks(actor, currentBattleState, newLog)) {
            continue;
        }

        if (action.type === 'FIGHT') {
            // --- UPDATE THIS LINE ---
            // Pass 'sortedActions' down so the Flinch check can use it.
            handleFightAction(action, currentBattleState, allTrainers, redirectionMap, allQueuedActions, newLog, sortedActions);
        } else if (action.type === 'SWITCH') {
            const trainer = allTrainers.find(t => t.id === actor.originalTrainerId);
            const trainerName = trainer ? trainer.name : 'The wild';
            newLog.push({ type: 'text', text: `${trainerName} withdraws ${actor.name}!` });

            if (actor.transformed && actor.baseForm) {
                revertFormChange(actor, newLog);
            }
            if (trainer) {
                const originalPokemonData = trainer.roster.find(p => p.id === actor.id);
                if (originalPokemonData) actor.types = [...originalPokemonData.types];
            }
            const onSwitchOutEffect = abilityEffects[getEffectiveAbility(actor, currentBattleState)?.id]?.onSwitchOut;
            if (onSwitchOutEffect) onSwitchOutEffect(actor, currentBattleState, newLog);
            if (actor.originalAbility) {
                actor.ability = actor.originalAbility;
                actor.originalAbility = null;
            }
            actor.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
            actor.volatileStatuses = [];
            actor.lockedMove = null;

            const newPokemonGlobalIndex = actorTeam.pokemon.findIndex(p => p.id === action.newPokemonId);
            if (newPokemonGlobalIndex !== -1) {
                const oldPokemonGlobalIndex = actorTeam.pokemon.findIndex(p => p.id === actor.id);
                const teamKey = actorTeam.id;
                const slotToUpdate = currentBattleState.activePokemonIndices[teamKey].indexOf(oldPokemonGlobalIndex);

                if (slotToUpdate !== -1) {
                    currentBattleState.activePokemonIndices[teamKey][slotToUpdate] = newPokemonGlobalIndex;
                }
                const newPokemon = actorTeam.pokemon[newPokemonGlobalIndex];
                if (newPokemon) {
                    newPokemon.switchInEffectsResolved = false;
                    redirectionMap.set(actor.id, newPokemon.id);
                    newLog.push({ type: 'text', text: `${trainerName} sends out ${newPokemon.name}!` });
                }
            }
        } else if (action.type === 'ITEM') {
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
                    const { updatedTarget, newLog: statLog } = calculateStatChange(target, statToBoost, boostAmount, currentBattleState);
                    Object.assign(target, updatedTarget);
                    newLog.push(...statLog);
                    newLog.push({ type: 'text', text: `${target.name}'s ${statToBoost.replace('-', ' ')} rose sharply!` });
                } else {
                    newLog.push({ type: 'text', text: `${target.name}'s stats won't go any higher!` });
                }
            }
        }
    }

    if (currentBattleState.forcedSwitchQueue.length > 0) {
        for (const forcedSwitch of currentBattleState.forcedSwitchQueue) {
            const { teamId, teamKey, slotIndex, pokemonToSwitchOutId, replacementId } = forcedSwitch;
            const team = currentBattleState.teams.find(t => t.id === teamId);
            const pokemonToSwitchOut = team.pokemon.find(p => p.id === pokemonToSwitchOutId);
            if (!pokemonToSwitchOut) continue;

            revertFormChange(pokemonToSwitchOut, newLog); // Revert form on forced switch
            pokemonToSwitchOut.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
            pokemonToSwitchOut.volatileStatuses = [];

            const newPokemonGlobalIndex = team.pokemon.findIndex(p => p.id === replacementId);
            currentBattleState.activePokemonIndices[teamKey][slotIndex] = newPokemonGlobalIndex;
            const newPokemon = team.pokemon[newPokemonGlobalIndex];

            newPokemon.switchInEffectsResolved = false;
            newLog.push({ type: 'text', text: `${pokemonToSwitchOut.name} was dragged out!` });
            newLog.push({ type: 'text', text: `Go! ${newPokemon.name}!` });
        }
        currentBattleState.forcedSwitchQueue = [];
    }

    console.log("END: Main Action Phase");
};