import { abilityEffects } from './abilityEffects';
import { ARMOR_TAIL_IGNORED_TARGETS } from '../../config/gameData';

export const getActiveAllies = (pokemon, battleState) => {
    // 1. Find the team the Pokémon belongs to.
    const pokemonTeam = battleState.teams.find(t => t.pokemon.some(p => p.id === pokemon.id));
    if (!pokemonTeam) return [];

    // 2. Get the indices of all Pokémon active on that team.
    const activeIndicesOnTeam = battleState.activePokemonIndices[pokemonTeam.id] || [];

    // 3. Return all active Pokémon on that team, excluding the Healer Pokémon itself.
    return pokemonTeam.pokemon.filter((p, i) =>
        activeIndicesOnTeam.includes(i) && // Is the Pokémon active?
        p &&                              // Does it exist?
        !p.fainted &&                     // Is it not fainted?
        p.id !== pokemon.id               // Is it not the user of the ability?
    );
};

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
    if (pokemon.volatileStatuses.some(s => (s.name || s) === 'Magnet Rise')) {
        return false;
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

/**
 * Checks if weather effects are currently active, accounting for Air Lock/Cloud Nine.
 * @param {object} battleState - The entire current battle state.
 * @returns {boolean} - True if weather effects should be applied, false otherwise.
 */
export const isWeatherActive = (battleState) => {
    if (battleState.field.weather === 'none') {
        return false;
    }

    const isAbilitySuppressingWeather = battleState.teams.some(team =>
        team.pokemon.some(p => {
            if (p && !p.fainted) {
                const abilityId = getEffectiveAbility(p, battleState)?.id;
                return abilityId === 'air-lock' || abilityId === 'cloud-nine';
            }
            return false;
        })
    );

    return !isAbilitySuppressingWeather;
};

/**
 * Checks if a Pokémon is legally able to switch out.
 * @param {object} pokemon - The Pokémon attempting to switch.
 * @param {object} battleState - The entire current battle state.
 * @returns {boolean} - True if the Pokémon can switch, false otherwise.
 */
export const canSwitchOut = (pokemon, battleState) => {
    // Ghost-types are always immune to trapping.
    if (pokemon.types.includes('ghost')) {
        return true;
    }
    // Shed Shell allows switching regardless of trapping abilities.
    if (pokemon.heldItem?.id === 'shed-shell') {
        return true;
    }

    const opponents = getActiveOpponents(pokemon, battleState);
    
    for (const opponent of opponents) {
        if (opponent.fainted) continue;

        const opponentAbilityId = getEffectiveAbility(opponent, battleState)?.id;

        // Check for Arena Trap
        if (opponentAbilityId === 'arena-trap') {
            // The trap does not work on the turn the trapper switches in.
            if (opponent.justSwitchedIn) continue;

            // The trap only affects grounded Pokémon.
            if (isGrounded(pokemon, battleState)) {
                return false; // This Pokémon is trapped.
            }
        }
    }

    // If no trapper was found, the Pokémon can switch.
    return true;
};

export const getPriorityMoveProtector = (target, battleState) => {
    const targetTeam = battleState.teams.find(t => t.pokemon.some(p => p.id === target.id));
    if (!targetTeam) return null;

    const activePokemonOnSide = targetTeam.pokemon.filter((p, i) => 
        battleState.activePokemonIndices[targetTeam.id]?.includes(i) && p && !p.fainted
    );

    const protectiveAbilities = ['armor-tail', 'queenly-majesty'];
    
    // Find the first Pokémon on that side of the field with a protective ability.
    return activePokemonOnSide.find(p => {
        const abilityId = getEffectiveAbility(p, battleState)?.id;
        return protectiveAbilities.includes(abilityId);
    }) || null;
};

export const checkMoveBlockingAbilities = (action, actor, currentBattleState) => {
    const move = action.move;

    let isPriorityMove = move.priority > 0;
    const actorAbilityId = getEffectiveAbility(actor, currentBattleState)?.id;
    if (actorAbilityId === 'prankster' && move.damage_class.name === 'status') {
        isPriorityMove = true;
    }

    if (isPriorityMove) {
        const isIgnoredTarget = ARMOR_TAIL_IGNORED_TARGETS.has(move.target.name);
        const canBypass = ['mold-breaker', 'teravolt', 'turboblaze'].includes(actorAbilityId);

        if (!isIgnoredTarget && !canBypass) {
            for (const hit of action.hits) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === hit.targetId);
                if (target && !target.fainted) {
                    const protector = getPriorityMoveProtector(target, currentBattleState);
                    if (protector) {
                        return protector; // Return the Pokémon that is providing protection.
                    }
                }
            }
        }
    }

    return null; // The move is not blocked.
};