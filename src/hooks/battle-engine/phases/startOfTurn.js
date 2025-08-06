import { calculateTurnOrderSpeed, getEffectiveAbility } from '../battleUtils';
import { resolveFormChange } from '../stateModifiers';
import { runOnSwitchIn } from '../fieldManager';
import { abilityEffects } from '../abilityEffects';

// --- PHASE 1: START OF TURN ---
export const runStartOfTurnPhase = (battleState, sortedActions, newLog) => {
    console.log("BEGIN: Start of Turn Phase");
    const allActivePokemon = battleState.teams.flatMap(t =>
        t.pokemon.filter((p, i) => battleState.activePokemonIndices[t.id]?.includes(i) && p && !p.fainted)
    );

    // Sort all active Pokémon by their current speed, fastest first.
    allActivePokemon.sort((a, b) => calculateTurnOrderSpeed(b, battleState) - calculateTurnOrderSpeed(a, battleState));

    for (const pokemon of allActivePokemon) {
        if (!pokemon.switchInEffectsResolved) {
            runOnSwitchIn([pokemon], battleState, newLog);
            pokemon.switchInEffectsResolved = true;
        }
        const abilityId = getEffectiveAbility(pokemon, battleState)?.id;
        if (abilityEffects[abilityId]?.onStartOfTurn) {
            abilityEffects[abilityId].onStartOfTurn(pokemon, battleState, newLog);
        }
        // Handle Mega Evolution
        const megaEvolveFlagKey = `willMegaEvolve_${pokemon.id}`;
        if (battleState.dm?.[megaEvolveFlagKey] && !pokemon.transformed) {
            const megaForm = pokemon.forms?.find(f => f.changeMethod === 'BATTLE' && f.triggerItem && pokemon.heldItem?.id === f.triggerItem);
            if (megaForm) {
                resolveFormChange(pokemon, megaForm, newLog);
                newLog.push({ type: 'text', text: `${pokemon.name} has Mega Evolved!` });
            }
        }
    }

    // Process any form changes queued by switch-in effects (i.e., Primal Reversion).
    if (battleState.formChangeQueue.length > 0) {
        battleState.formChangeQueue.forEach(change => {
            const pokemonInState = battleState.teams.flatMap(t => t.pokemon).find(p => p.id === change.pokemon.id);
            if (pokemonInState && change.type === 'RESOLVE') {
                resolveFormChange(pokemonInState, change.form, newLog);
            }
        });
        battleState.formChangeQueue = [];
    }
    console.log("END: Start of Turn Phase");
};