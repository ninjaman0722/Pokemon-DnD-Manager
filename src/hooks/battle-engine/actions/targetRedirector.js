import { getEffectiveAbility, calculateTurnOrderSpeed } from '../battleUtils';
import { abilityEffects } from '../abilityEffects';
import { REDIRECTING_MOVES } from '../../../config/gameData';

// This function finds if there is a valid Pokémon on the field redirecting attacks.
export const findRedirector = (attacker, originalTarget, move, battleState) => {
    const attackerTeamId = battleState.teams.find(t => t.pokemon.some(p => p.id === attacker.id))?.id;
    if (!attackerTeamId) return null;

    // Get all other Pokémon on the field
    const allOtherPokemon = battleState.teams.flatMap(t =>
        t.pokemon.filter(p => p && !p.fainted && p.id !== attacker.id)
    );

    let potentialRedirectors = [];

    for (const pokemon of allOtherPokemon) {
        // Check for abilities like Storm Drain / Lightning Rod
        const abilityId = getEffectiveAbility(pokemon, battleState)?.id;
        if (abilityEffects[abilityId]?.onRedirect?.(move)) {
            potentialRedirectors.push(pokemon);
            continue; // Abilities have priority
        }

        // Check if the Pokémon is using a move like Follow Me
        const queuedAction = battleState.queuedActions[pokemon.id]; // We'll need to pass queuedActions down
        if (queuedAction?.type === 'FIGHT' && REDIRECTING_MOVES.has(queuedAction.move.id)) {
            // In doubles, redirection only affects opponents
            const isOpponent = battleState.teams.find(t => t.pokemon.some(p => p.id === pokemon.id))?.id !== attackerTeamId;
            if (isOpponent) {
                potentialRedirectors.push(pokemon);
            }
        }
    }

    if (potentialRedirectors.length === 0) {
        return null; // No redirection
    }

    // If there are multiple redirectors, the one with the highest speed goes first.
    potentialRedirectors.sort((a, b) => calculateTurnOrderSpeed(b, battleState) - calculateTurnOrderSpeed(a, battleState));
    
    return potentialRedirectors[0]; // Return the highest priority redirector
};