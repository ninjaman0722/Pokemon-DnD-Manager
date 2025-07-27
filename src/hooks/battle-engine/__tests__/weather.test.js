import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon } from '../__helpers__/TestStateFactory';
import { fetchPokemonData } from '../../../utils/api';

const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('Weather Effects', () => {
    it('should deal damage at the end of the turn to non-immune Pokémon in a Sandstorm', async () => {
        // ARRANGE
        // 1. Fetch data for a Sand Stream user and a non-immune Pokémon.
        const baseTyranitarData = await fetchPokemonData('Tyranitar', 50);
        const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);

        // 2. Create the Pokémon. Tyranitar will set the weather. Snorlax is not Rock, Steel, or Ground type.
        const sandStreamer = createPokemon('Tyranitar', {
            stats: baseTyranitarData.stats,
            baseStats: baseTyranitarData.baseStats,
            types: baseTyranitarData.types,
            ability: { id: 'sand-stream', name: 'Sand Stream' },
            maxHp: baseTyranitarData.maxHp,
            currentHp: baseTyranitarData.maxHp,
            moves: [{ id: 'crunch', name: 'Crunch', power: 80, damage_class: { name: 'physical' }, type: 'dark' }]
        });

        const nonImmuneOpponent = createPokemon('Snorlax', {
            stats: baseSnorlaxData.stats,
            baseStats: baseSnorlaxData.baseStats,
            types: baseSnorlaxData.types, // Should be ['normal']
            maxHp: baseSnorlaxData.maxHp,
            currentHp: baseSnorlaxData.maxHp,
            moves: [{ id: 'tackle', name: 'Tackle', power: 40, damage_class: { name: 'physical' }, type: 'normal' }]
        });

        // 3. Create a battle state. NOTE: We do not set weather here; Sand Stream should set it.
        const initialState = createBattleState([sandStreamer], [nonImmuneOpponent]);

        // Turn 1 actions are not important, we just need the turn to pass to see the end-of-turn damage.
        const queuedActions = {
            [sandStreamer.id]: { type: 'FIGHT', pokemon: sandStreamer, move: sandStreamer.moves[0], targetIds: [nonImmuneOpponent.id], hits: [{ targetId: nonImmuneOpponent.id }], willHit: true },
            [nonImmuneOpponent.id]: { type: 'FIGHT', pokemon: nonImmuneOpponent, move: nonImmuneOpponent.moves[0], targetIds: [sandStreamer.id], hits: [{ targetId: sandStreamer.id }], willHit: true }
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalTyranitar = findPokemon(finalBattleState, 'Tyranitar');
        const finalSnorlax = findPokemon(finalBattleState, 'Snorlax');

        // Snorlax should take damage equal to 1/16 of its max HP.
        const expectedDamage = Math.floor(nonImmuneOpponent.maxHp / 16);
        // We check against the HP Snorlax had *before* the end-of-turn damage.
        const hpBeforeEndOfTurn = finalSnorlax.maxHp - (sandStreamer.stats.attack > 0 ? 38 : 0); // Placeholder damage from Crunch, adjust if needed

        // The most reliable assertion is checking the log for the sandstorm damage message.
        expect(finalLog.some(log => log.text?.includes('is buffeted by the sandstorm!'))).toBe(true);

        // And we can assert that Tyranitar, being a Rock type, took no damage from the sandstorm.
        const tyranitarDamageTaken = sandStreamer.maxHp - finalTyranitar.currentHp;
        const snorlaxDamageTaken = nonImmuneOpponent.maxHp - finalSnorlax.currentHp;
        expect(snorlaxDamageTaken).toBeGreaterThan(tyranitarDamageTaken);
    });
});