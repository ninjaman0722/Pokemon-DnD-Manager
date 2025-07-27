import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon } from '../__helpers__/TestStateFactory';
import { fetchPokemonData } from '../../../utils/api';

const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('End-of-Turn Volatile Status Effects', () => {
    it('should sap health with Leech Seed and heal the opponent at the end of the turn', async () => {
        // ARRANGE
        const baseVenusaurData = await fetchPokemonData('Venusaur', 50);
        const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);

        const seeder = createPokemon('Venusaur', {
            ...baseVenusaurData,
            currentHp: 100,
            moves: [{ id: 'leech-seed', name: 'Leech Seed', damage_class: { name: 'status' }, type: 'grass' }]
        });
        const initialSeederHp = seeder.currentHp;

        const target = createPokemon('Snorlax', { ...baseSnorlaxData });
        const initialTargetHp = target.currentHp;

        let initialState = createBattleState([seeder], [target]);
        const turn1Actions = {
            [seeder.id]: { type: 'FIGHT', pokemon: seeder, move: seeder.moves[0], targetIds: [target.id], hits: [{ targetId: target.id }], willHit: true },
        };

        // Execute Turn 1 to apply Leech Seed. With our fix, no damage will be dealt here.
        const { finalBattleState: turn2State } = await executeTurn(initialState, turn1Actions, allTrainers);

        // **CORRECTION**: Check the state after Turn 1. No damage should have been dealt yet.
        const midTurnTarget = findPokemon(turn2State, 'Snorlax');
        expect(midTurnTarget.currentHp).toBe(initialTargetHp);

        // ACT
        // Execute Turn 2. The end-of-turn effects will now resolve for the first time.
        const { finalBattleState, finalLog } = await executeTurn(turn2State, {}, allTrainers);

        // ASSERT
        const finalSeeder = findPokemon(finalBattleState, 'Venusaur');
        const finalTarget = findPokemon(finalBattleState, 'Snorlax');

        const expectedDamage = Math.floor(target.maxHp / 8);
        const expectedHeal = expectedDamage;

        // Target should take damage.
        expect(finalTarget.currentHp).toBe(initialTargetHp - expectedDamage);
        
        // Seeder should heal.
        expect(finalSeeder.currentHp).toBe(initialSeederHp + expectedHeal);
        
        expect(finalLog.some(log => log.text?.includes("health was sapped by Leech Seed!"))).toBe(true);
        expect(finalLog.some(log => log.text?.includes("Venusaur restored a little health!"))).toBe(true);
    });

    it('should cause a Pokémon to faint after its Perish Song count reaches zero', async () => {
        // ARRANGE
        const singer = createPokemon('Lapras', {
            moves: [{ id: 'perish-song', name: 'Perish Song', damage_class: { name: 'status' } }]
        });
        const target = createPokemon('Pikachu');

        // Turn 1: Use Perish Song
        let battleState = createBattleState([singer], [target]);
        let actions = {
            [singer.id]: { type: 'FIGHT', pokemon: singer, move: singer.moves[0], willHit: true }
        };
        ({ finalBattleState: battleState } = await executeTurn(battleState, actions, allTrainers));

        // **CORRECTION**: The counter should still be 3 after the turn of application.
        let targetStatus = findPokemon(battleState, 'Pikachu').volatileStatuses.find(s => s.name === 'Perish Song');
        expect(targetStatus.turnsLeft).toBe(3);

        // ACT & ASSERT (Subsequent turns)
        // End of Turn 2: Counter becomes 2
        ({ finalBattleState: battleState } = await executeTurn(battleState, {}, allTrainers));
        targetStatus = findPokemon(battleState, 'Pikachu').volatileStatuses.find(s => s.name === 'Perish Song');
        expect(targetStatus.turnsLeft).toBe(2);

        // End of Turn 3: Counter becomes 1
        ({ finalBattleState: battleState } = await executeTurn(battleState, {}, allTrainers));
        targetStatus = findPokemon(battleState, 'Pikachu').volatileStatuses.find(s => s.name === 'Perish Song');
        expect(targetStatus.turnsLeft).toBe(1);

        // End of Turn 4: Counter becomes 0 and the Pokémon faints.
        const { finalBattleState, finalLog } = await executeTurn(battleState, {}, allTrainers);
        const finalTarget = findPokemon(finalBattleState, 'Pikachu');

        expect(finalTarget.fainted).toBe(true);
        expect(finalTarget.currentHp).toBe(0);
        expect(finalLog.some(log => log.text?.includes("Perish Song count is now 0!"))).toBe(true);
    });
});