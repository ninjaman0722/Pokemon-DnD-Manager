// src/hooks/battle-engine/chanceGatherers.js
import { CONTACT_MOVES } from '../../config/gameData';
import { getEffectiveAbility, getActiveAllies } from './battleUtils';
import { itemEffects } from './itemEffects';

export const getEffectChances = (attacker, target, move, chanceQueue) => {
    const ailment = move.meta?.ailment;
    const ailmentChance = move.meta?.ailment_chance;

    // We only care about SECONDARY effects here.
    // Primary effects of status moves are handled by the main "Hit?" chance.
    if (ailment?.name !== 'none' && ailmentChance > 0) {
        const isGuaranteed = ailmentChance === 100;
        chanceQueue.push({
            key: `willApplyEffect_${move.id}_on_${target.id}`,
            label: `Will ${move.name} apply '${ailment.name}' to ${target.name}?`,
            chance: ailmentChance,
            type: 'Move Effect',
            sourceId: attacker.id,
            isGuaranteed: isGuaranteed,
            sourceMoveName: move.name,
            targetName: target.name,
            effectName: ailment.name
        });
    }
};

export const getContactAbilities = (attacker, target, move, chanceQueue) => {
    if (!CONTACT_MOVES.has(move.id)) return; // Only proceed for contact moves

    const targetAbilityId = getEffectiveAbility(target)?.id;

    const contactAbilities = {
        'static': { chance: 30, label: `Will ${target.name}'s Static paralyze ${attacker.name}?` },
        'poison-point': { chance: 30, label: `Will ${target.name}'s Poison Point poison ${attacker.name}?` },
        'flame-body': { chance: 30, label: `Will ${target.name}'s Flame Body burn ${attacker.name}?` },
        'cute-charm': { chance: 30, label: `Will ${target.name}'s Cute Charm infatuate ${attacker.name}?` },
        'effect-spore': { chance: 30, label: `Will ${target.name}'s Effect Spore inflict a status on ${attacker.name}?` },
    };

    if (contactAbilities[targetAbilityId]) {
        const { chance, label } = contactAbilities[targetAbilityId];
        chanceQueue.push({
            key: `willTrigger${targetAbilityId.charAt(0).toUpperCase() + targetAbilityId.slice(1)}_${target.id}_on_${attacker.id}`,
            label: label,
            chance: chance,
            type: 'Ability Trigger',
            sourceId: target.id,
        });
    }
};
export const getEndOfTurnChances = (pokemon, battleState, chanceQueue) => {
    // Helper function to check if a status-applying effect is targeting our Pokémon in the queue
    const willReceiveStatusThisTurn = (pkmn, status, queue) => {
        return queue.some(chance => 
            chance.key.startsWith('willApplyEffect_') && 
            chance.key.includes(pkmn.id) &&
            chance.label.toLowerCase().includes(status)
        );
    };

    const heldItem = pokemon.heldItem;
    if (heldItem) {
        const itemEffect = itemEffects[heldItem.id];
        if (itemEffect?.onEndOfTurn) {
            // Check current status OR potential status from the queue
            const willBeConsumed = 
                (heldItem.id === 'lum-berry' && (pokemon.status !== 'None' || pokemon.volatileStatuses.includes('Confused') || willReceiveStatusThisTurn(pokemon, 'status', chanceQueue))) ||
                (heldItem.id === 'cheri-berry' && (pokemon.status === 'Paralyzed' || willReceiveStatusThisTurn(pokemon, 'paralysis', chanceQueue))) ||
                (heldItem.id === 'chesto-berry' && (pokemon.status === 'Asleep' || willReceiveStatusThisTurn(pokemon, 'sleep', chanceQueue))) ||
                (heldItem.id === 'pecha-berry' && ((pokemon.status === 'Poisoned' || pokemon.status === 'Badly Poisoned') || willReceiveStatusThisTurn(pokemon, 'poison', chanceQueue))) ||
                (heldItem.id === 'rawst-berry' && (pokemon.status === 'Burned' || willReceiveStatusThisTurn(pokemon, 'burn', chanceQueue))) ||
                (heldItem.id === 'aspear-berry' && (pokemon.status === 'Frozen' || willReceiveStatusThisTurn(pokemon, 'freeze', chanceQueue)));
            
            if (willBeConsumed) {
                // On our temporary copy, simulate the berry being eaten
                pokemon.lastConsumedItem = heldItem;
                pokemon.heldItem = null;
            }
        }
    }

    const abilityId = getEffectiveAbility(pokemon, battleState)?.id;

    if (abilityId === 'moody') {
        const allStats = ['attack', 'defense', 'special-attack', 'special-defense', 'speed', 'accuracy', 'evasion'];
        const statsToBoost = allStats.filter(stat => pokemon.stat_stages[stat] < 6);
        const statsToLower = allStats.filter(stat => pokemon.stat_stages[stat] > -6);

        if (statsToBoost.length > 0 && statsToLower.length > 1) {
            chanceQueue.push({
                key: `moodyChange_${pokemon.id}`,
                label: `Choose Moody stat changes for ${pokemon.name}.`,
                type: 'Stat Choice', // A new type for the modal to handle differently
                sourceId: pokemon.id,
                options: {
                    boost: statsToBoost,
                    lower: statsToLower
                }
            });
        }
    }

    if (abilityId === 'healer') {
        // Find allies with status conditions
        const allies = getActiveAllies(pokemon, battleState); // You'll need to import getActiveAllies
        allies.forEach(ally => {
            if (ally.status !== 'None') {
                chanceQueue.push({
                    key: `healer_proc_${pokemon.id}_on_${ally.id}`,
                    label: `Will ${pokemon.name}'s Healer cure ${ally.name}?`,
                    chance: 30,
                    type: 'End-of-Turn Effect',
                    sourceId: pokemon.id
                });
            }
        });
    }

    if (abilityId === 'harvest' && pokemon.lastConsumedItem && !pokemon.heldItem) {
        const isSun = battleState.field.weather === 'sunshine' || battleState.field.weather === 'harsh-sunshine';
        if (!isSun) {
             chanceQueue.push({
                key: `willTriggerHarvest_${pokemon.id}`,
                label: `Will ${pokemon.name} harvest a new berry?`,
                chance: 50,
                type: 'End-of-Turn Effect',
                sourceId: pokemon.id
            });
        }
    }
};
export const getTurnOrderChances = (pokemon, chanceQueue) => {
    // Check for Quick Claw
    if (pokemon.heldItem?.id === 'quick-claw') {
        chanceQueue.push({
            key: `willActivateQuickClaw_${pokemon.id}`,
            label: `Will ${pokemon.name}'s Quick Claw activate?`,
            chance: 20,
            type: 'Turn Order Effect',
            sourceId: pokemon.id
        });
    }
    // You can add logic for Custap Berry here in the future
};