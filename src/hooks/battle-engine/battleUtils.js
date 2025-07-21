import { abilityEffects } from '../../config/abilityEffects';

export const getEffectiveAbility = (pokemon, currentBattleState) => {
    if (!pokemon || !pokemon.ability) {
        return null;
    }

    // Check for Neutralizing Gas on the field
    if (currentBattleState) {
        const gasUser = currentBattleState.teams
            .flatMap(t => t.pokemon)
            .find(p => p && !p.fainted && p.ability.toLowerCase() === 'neutralizing-gas');

        // If gas is active and this isn't the user of the gas, suppress the ability
        if (gasUser && gasUser.id !== pokemon.id) {
            return null;
        }
    }

    // Check for volatile statuses that suppress abilities
    if (pokemon.volatileStatuses.some(s => (s.name || s) === 'Ability Suppressed')) {
        return null;
    }

    return pokemon.ability;
};

export const getStatModifier = (stage) => {
    if (stage >= 0) { return (2 + stage) / 2; }
    return 2 / (2 - stage);
};

export const isGrounded = (pokemon, currentBattleState) => {
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

export const getActiveOpponents = (pokemon, currentBattleState) => {
        const { teams, activePokemonIndices } = currentBattleState;
        const pokemonTeam = teams.find(t => t.pokemon.some(p => p.id === pokemon.id));
        if (!pokemonTeam) return [];

        const opponentTeam = teams.find(t => t.id !== pokemonTeam.id);
        if (!opponentTeam) return [];

        const opponentActiveIndices = activePokemonIndices[opponentTeam.id] || [];
        return opponentTeam.pokemon.filter((p, i) => opponentActiveIndices.includes(i) && p && !p.fainted);
    };