import { abilityEffects } from './abilityEffects';

export const getEffectiveAbility = (pokemon, currentBattleState) => {
    if (!pokemon || !pokemon.ability) {
        return null;
    }

    // Check for Neutralizing Gas on the field
    if (currentBattleState) {
        const gasUser = currentBattleState.teams
            .flatMap(t => t.pokemon)
            .find(p => p && !p.fainted && p.ability?.id === 'neutralizing-gas');

        // If gas is active and this isn't the user of the gas, suppress the ability
        if (gasUser && gasUser.id !== pokemon.id) {
            return null;
        }
    }

    // Check for volatile statuses that suppress abilities
    if (pokemon.volatileStatuses.some(s => (s.name || s) === 'Ability Suppressed')) {
        return null;
    }

    return pokemon.ability; // Return the full ability object { name, id }
};

export const getStatModifier = (stage) => {
    if (stage >= 0) { return (2 + stage) / 2; }
    return 2 / (2 - stage);
};

export const isGrounded = (pokemon, currentBattleState) => {
    // If Gravity is active, every Pokémon is grounded.
    if (currentBattleState.field.gravityTurns > 0) {
        return true;
    }
    // Check for Iron Ball using the new .id property
    if (pokemon.heldItem?.id === 'iron-ball') {
        return true;
    }

    // The rest of the logic only runs if Gravity is NOT active.
    if (currentBattleState.field.magicRoomTurns === 0 && pokemon.heldItem?.id === 'air-balloon') {
        return false;
    }

    if (pokemon.types.includes('flying')) return false;

    // Get the ability's functional ID
    const abilityId = getEffectiveAbility(pokemon, currentBattleState)?.id;
    // Use the ID as a key for the abilityEffects lookup
    if (abilityEffects[abilityId]?.onCheckImmunity?.({ type: 'ground' }, pokemon)) {
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
/**
 * Checks ONLY for a DM override for a given chance-based event.
 * @param {string} dmFlagKey - The key to check for in the battleState.dm object (e.g., 'willHit_move-id_on_target-id').
 * @param {object} battleState - The current battle state, which may contain the dm object.
 * @returns {boolean} - The DM's decision, or false if no decision was made.
 */
export const resolveChance = (dmFlagKey, battleState) => {
    return !!battleState.dm?.[dmFlagKey];
};
export const calculateTurnOrderSpeed = (pokemon, battleState) => {
    if (!pokemon) return 0;

    // Start with the base stat and apply stage modifiers
    let speed = (pokemon.stats?.speed || 0) * getStatModifier(pokemon.stat_stages?.speed || 0);

    // Factor in Protosynthesis / Quark Drive boosts
    if (pokemon.boosterBoost?.stat === 'speed') {
        speed *= pokemon.boosterBoost.multiplier;
    }

    const abilityId = getEffectiveAbility(pokemon, battleState)?.id;
    const itemId = pokemon.heldItem?.id;

    // Factor in abilities
    if (abilityId === 'unburden' && pokemon.originalHeldItem && !pokemon.heldItem) {
        speed *= 2;
    }
    if (abilityEffects[abilityId]?.onModifyStat) {
        speed = abilityEffects[abilityId].onModifyStat('speed', speed, pokemon, battleState);
    }

    // Factor in status conditions
    if (pokemon.status === 'Paralyzed') {
        speed /= 2;
    }

    // Factor in items
    if (battleState.field.magicRoomTurns === 0) {
        if (itemId === 'choice-scarf') speed *= 1.5;
        if (itemId === 'iron-ball') speed *= 0.5;
    }

    // Factor in abilities/items that guarantee moving last
    if (abilityId === 'stall' || (itemId && ['lagging-tail', 'full-incense'].includes(itemId))) {
        return -1; // Give it a speed of -1 to ensure it moves after everything else
    }

    return speed;
};