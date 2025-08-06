import { TYPE_CHART } from '../../config/gameData';
import { abilityEffects } from './abilityEffects';
import { itemEffects } from './itemEffects';
import { getEffectiveAbility, isGrounded, getActiveOpponents } from './battleUtils';
import { calculateStatChange, handleTransform } from './stateModifiers';

export const runOnSwitchIn = (pokemonArray, currentBattleState, newLog) => {

    console.log("--- runOnSwitchIn TRIGGERED ---");
    if (pokemonArray && pokemonArray.length > 0) {
        console.log("Processing the following Pokémon:", pokemonArray.map(p => `${p.name} (Ability: ${p.ability?.id})`).join(', '));
    } else {
        console.error("FAILURE: runOnSwitchIn was called with an empty or invalid pokemonArray.");
        return; // Stop execution if there are no Pokémon
    }

    pokemonArray.forEach(pokemon => {
        if (!pokemon || pokemon.fainted) return;

        // --- REFACTORED: ABILITY & ITEM HOOKS ---
        // Use the ability's ID for lookups and logic
        const abilityId = getEffectiveAbility(pokemon, currentBattleState)?.id;
        const statChanger = (target, stat, change) => {
            const { updatedTarget, newLog: statLog } = calculateStatChange(target, stat, change, currentBattleState);
            Object.assign(target, updatedTarget);
            newLog.push(...statLog);
        };

        if (abilityEffects[abilityId]?.onSwitchIn) {
            abilityEffects[abilityId].onSwitchIn(pokemon, currentBattleState, newLog, statChanger, handleTransform);
        }
        
        // Special interaction check for Intimidate + Adrenaline Orb
        if (abilityId === 'intimidate') {
            const opponents = getActiveOpponents(pokemon, currentBattleState);
            opponents.forEach(opp => {
                // Use the opponent's item ID for the check
                const oppItemId = opp.heldItem?.id;
                if (itemEffects[oppItemId]?.onIntimidated) {
                    itemEffects[oppItemId].onIntimidated(opp, currentBattleState, newLog, statChanger);
                }
            });
        }
        if (pokemon.fainted) return;

        // --- HAZARD LOGIC (with Magic Guard check) ---
        const teamKey = currentBattleState.teams.find(t => t.pokemon.some(p => p.id === pokemon.id))?.id === 'players' ? 'players' : 'opponent';
        const teamHazards = currentBattleState.field.hazards?.[teamKey];
        if (!teamHazards) return;

        const isGuarded = getEffectiveAbility(pokemon, currentBattleState)?.id === 'magic-guard';
        const hasBoots = pokemon.heldItem?.id === 'heavy-duty-boots';

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

        const grounded = isGrounded(pokemon, currentBattleState);
        if (grounded && !hasBoots) {

            if (!isGuarded && teamHazards['spikes']) {
                const damageFractions = [0, 1 / 8, 1 / 6, 1 / 4];
                const damage = Math.floor(pokemon.maxHp * damageFractions[teamHazards['spikes']]);
                pokemon.currentHp = Math.max(0, pokemon.currentHp - damage);
                newLog.push({ type: 'text', text: `${pokemon.name} was hurt by the spikes!` });
            }
            if (pokemon.fainted) return;

            if (teamHazards['toxic-spikes']) {
                if (pokemon.types.includes('poison')) {
                    teamHazards['toxic-spikes'] = 0;
                    newLog.push({ type: 'text', text: `${pokemon.name} absorbed the Toxic Spikes!` });
                }
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

            if (teamHazards['sticky-web']) {
                // Use ability ID for the Contrary check
                if (getEffectiveAbility(pokemon, currentBattleState)?.id !== 'contrary') {
                    const { updatedTarget, newLog: statLog } = calculateStatChange(pokemon, 'speed', -1, currentBattleState);
                    Object.assign(pokemon, updatedTarget);
                    newLog.push(...statLog);
                    newLog.push({ type: 'text', text: `${pokemon.name} was caught in a Sticky Web!` });
                }
            }
        }
        if (pokemon.currentHp === 0) { pokemon.fainted = true; newLog.push({ type: 'text', text: `${pokemon.name} fainted!` }); return; }
    });
};