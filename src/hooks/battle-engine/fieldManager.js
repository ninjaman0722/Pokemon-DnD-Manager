import { TYPE_CHART } from '../../config/gameData';
import { abilityEffects } from '../../config/abilityEffects';
import { getEffectiveAbility, isGrounded } from './battleUtils';
import { calculateStatChange, handleTransform } from './stateModifiers';

export const runOnSwitchIn = (pokemonArray, currentBattleState, newLog) => {
    pokemonArray.forEach(pokemon => {
        if (!pokemon || pokemon.fainted) return;

        // --- REFACTORED: ABILITY & ITEM HOOKS ---
        const abilityName = getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase();
        const statChanger = (target, stat, change) => {
            const { updatedTarget, newLog: statLog } = calculateStatChange(target, stat, change, currentBattleState);
            Object.assign(target, updatedTarget);
            newLog.push(...statLog);
        };

        if (abilityEffects[abilityName]?.onSwitchIn) {
            abilityEffects[abilityName].onSwitchIn(pokemon, currentBattleState, newLog, statChanger, handleTransform);
        }
        if (abilityName === 'intimidate') {
            const opponents = getActiveOpponents(pokemon, currentBattleState);
            opponents.forEach(opp => {
                const oppItemName = opp.heldItem?.name.toLowerCase();
                // If the opponent has an item that reacts to being intimidated, call its hook.
                if (itemEffects[oppItemName]?.onIntimidated) {
                    itemEffects[oppItemName].onIntimidated(opp, currentBattleState, newLog, statChanger);
                }
            });
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
                if (getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase() !== 'contrary') {
                    // --- UPDATED PATTERN ---
                    const { updatedTarget, newLog: statLog } = calculateStatChange(pokemon, 'speed', -1, currentBattleState);
                    Object.assign(pokemon, updatedTarget); // Update the pokemon directly
                    newLog.push(...statLog);
                    newLog.push({ type: 'text', text: `${pokemon.name} was caught in a Sticky Web!` });
                }
            }
        }
        if (pokemon.currentHp === 0) { pokemon.fainted = true; newLog.push({ type: 'text', text: `${pokemon.name} fainted!` }); return; }
    });
};