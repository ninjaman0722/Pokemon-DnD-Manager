// src/hooks/battle-engine/__tests__/turn-order.test.js

import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon } from '../__helpers__/TestStateFactory';
import { fetchPokemonData } from '../../../utils/api';

const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('Turn Order Mechanics', () => {
    it('should allow a slow Pokémon with a priority move to attack before a faster Pokémon', async () => {
        // ARRANGE
        // 1. Fetch data for a slow and a fast Pokémon.
        const baseSnorlaxData = await fetchPokemonData('Snorlax', 50); // Speed: 30
        const baseJolteonData = await fetchPokemonData('Jolteon', 50); // Speed: 130

        // 2. Create the Pokémon. Give Snorlax the priority move.
        const slowWithPriority = createPokemon('Snorlax', {
            ...baseSnorlaxData,
            moves: [{ id: 'quick-attack', name: 'Quick Attack', power: 40, priority: 1, damage_class: { name: 'physical' }, type: 'normal' }]
        });

        const fastWithStandard = createPokemon('Jolteon', {
            ...baseJolteonData,
            moves: [{ id: 'tackle', name: 'Tackle', power: 40, priority: 0, damage_class: { name: 'physical' }, type: 'normal' }]
        });

        // 3. Create the battle state.
        const initialState = createBattleState([slowWithPriority], [fastWithStandard]);

        const queuedActions = {
            [slowWithPriority.id]: { type: 'FIGHT', pokemon: slowWithPriority, move: slowWithPriority.moves[0], targetIds: [fastWithStandard.id], hits: [{ targetId: fastWithStandard.id }], willHit: true },
            [fastWithStandard.id]: { type: 'FIGHT', pokemon: fastWithStandard, move: fastWithStandard.moves[0], targetIds: [slowWithPriority.id], hits: [{ targetId: slowWithPriority.id }], willHit: true }
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // Find the index of each attack in the log. The priority move should come first.
        const snorlaxAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Snorlax');
        const jolteonAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Jolteon');

        // Ensure both attacks were found in the log
        expect(snorlaxAttackIndex).not.toBe(-1);
        expect(jolteonAttackIndex).not.toBe(-1);

        // The core assertion: Snorlax's priority attack should have a lower index (occur earlier)
        expect(snorlaxAttackIndex).toBeLessThan(jolteonAttackIndex);
    });
    it('should make a fast Pokémon with a negative priority move attack after a slower Pokémon', async () => {
        // ARRANGE
        // 1. Fetch data for a fast and a slow Pokémon.
        const baseJolteonData = await fetchPokemonData('Jolteon', 50); // Speed: 130
        const baseSnorlaxData = await fetchPokemonData('Snorlax', 50); // Speed: 30

        // 2. Create the Pokémon. Give the fast Pokémon the negative priority move.
        const fastWithNegativePrio = createPokemon('Jolteon', {
            ...baseJolteonData,
            moves: [{ id: 'vital-throw', name: 'Vital Throw', power: 70, priority: -1, type: 'fighting', damage_class: { name: 'physical' } }]
        });

        const slowWithStandardPrio = createPokemon('Snorlax', {
            ...baseSnorlaxData,
            moves: [{ id: 'tackle', name: 'Tackle', power: 40, priority: 0, type: 'normal', damage_class: { name: 'physical' } }]
        });

        // 3. Create the battle state.
        const initialState = createBattleState([fastWithNegativePrio], [slowWithStandardPrio]);

        const queuedActions = {
            [fastWithNegativePrio.id]: { type: 'FIGHT', pokemon: fastWithNegativePrio, move: fastWithNegativePrio.moves[0], targetIds: [slowWithStandardPrio.id], hits: [{ targetId: slowWithStandardPrio.id }], willHit: true },
            [slowWithStandardPrio.id]: { type: 'FIGHT', pokemon: slowWithStandardPrio, move: slowWithStandardPrio.moves[0], targetIds: [fastWithNegativePrio.id], hits: [{ targetId: fastWithNegativePrio.id }], willHit: true }
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // Find the index of each attack in the log. The negative priority move should come last.
        const jolteonAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Jolteon');
        const snorlaxAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Snorlax');

        // Ensure both attacks were found in the log
        expect(jolteonAttackIndex).not.toBe(-1);
        expect(snorlaxAttackIndex).not.toBe(-1);

        // The core assertion: Snorlax's standard move should have a lower index (occur earlier)
        // than Jolteon's negative priority move.
        expect(snorlaxAttackIndex).toBeLessThan(jolteonAttackIndex);
    });
    it('should halve a Pokémon\'s speed for turn order calculation when it is Paralyzed', async () => {
        // ARRANGE
        // 1. Fetch data for a fast Pokémon (Gengar) and a slightly slower one (Vaporeon).
        const baseGengarData = await fetchPokemonData('Gengar', 50);     // Speed: 110
        const baseVaporeonData = await fetchPokemonData('Vaporeon', 50); // Speed: 65

        // 2. Create the Pokémon. Vaporeon has a move to paralyze Gengar.
        const fastPokemon = createPokemon('Gengar', {
            ...baseGengarData,
            moves: [{ id: 'tackle', name: 'Tackle', priority: 0, damage_class: { name: 'physical' } }]
        });

        const slowerPokemon = createPokemon('Vaporeon', {
            ...baseVaporeonData,
            moves: [{
                id: 'thunder-wave',
                name: 'Thunder Wave',
                priority: 0,
                damage_class: { name: 'status' },
                meta: { ailment: { name: 'paralysis' }, ailment_chance: 100 }
            }]
        });

        // --- TURN 1: The slower Pokémon paralyzes the faster one ---
        let turn1State = createBattleState([fastPokemon], [slowerPokemon]);
        const turn1Actions = {
            [slowerPokemon.id]: { type: 'FIGHT', pokemon: slowerPokemon, move: slowerPokemon.moves[0], targetIds: [fastPokemon.id], hits: [{ targetId: fastPokemon.id }], applyEffect: true, willHit: true },
            [fastPokemon.id]: { type: 'FIGHT', pokemon: fastPokemon, move: fastPokemon.moves[0], hits: [], willHit: false },
        };
        const { finalBattleState: turn2State } = await executeTurn(turn1State, turn1Actions, allTrainers);

        // ASSERT (Turn 1) - Verify Gengar is now paralyzed.
        const paralyzedPokemon_Turn1 = findPokemon(turn2State, 'Gengar');
        expect(paralyzedPokemon_Turn1.status).toBe('Paralyzed');

        // --- TURN 2: Verify the turn order is reversed ---
        // Gengar's paralyzed speed (110 / 2 = 55) is now less than Vaporeon's speed (65).
        const paralyzedPokemon = findPokemon(turn2State, 'Gengar');
        const opponentForTurn2 = findPokemon(turn2State, 'Vaporeon');

        const turn2Actions = {
            [paralyzedPokemon.id]: { type: 'FIGHT', pokemon: paralyzedPokemon, move: paralyzedPokemon.moves[0], targetIds: [opponentForTurn2.id], hits: [{ targetId: opponentForTurn2.id }], willHit: true },
            [opponentForTurn2.id]: { type: 'FIGHT', pokemon: opponentForTurn2, move: opponentForTurn2.moves[0], targetIds: [paralyzedPokemon.id], hits: [{ targetId: paralyzedPokemon.id }], willHit: true }
        };
        const { finalLog: turn2Log } = await executeTurn(turn2State, turn2Actions, allTrainers);

        // ASSERT (Turn 2)
        const gengarAttackIndex = turn2Log.findIndex(log => log.type === 'attack' && log.attackerName === 'Gengar');
        const vaporeonAttackIndex = turn2Log.findIndex(log => log.type === 'attack' && log.attackerName === 'Vaporeon');

        expect(gengarAttackIndex).not.toBe(-1);
        expect(vaporeonAttackIndex).not.toBe(-1);

        // Verify the originally faster Gengar now moves after Vaporeon.
        expect(vaporeonAttackIndex).toBeLessThan(gengarAttackIndex);
    });
    it('should allow a priority move to ignore the turn-reversing effect of Trick Room', async () => {
        // ARRANGE
        // 1. Fetch data for a slow and a fast Pokémon.
        const baseSnorlaxData = await fetchPokemonData('Snorlax', 50); // Speed: 30
        const baseJolteonData = await fetchPokemonData('Jolteon', 50); // Speed: 130

        // 2. Create the Pokémon. The slow Pokémon has the priority move.
        const slowWithPriority = createPokemon('Snorlax', {
            ...baseSnorlaxData,
            moves: [{ id: 'quick-attack', name: 'Quick Attack', power: 40, priority: 1, damage_class: { name: 'physical' }, type: 'normal' }]
        });

        const fastWithStandard = createPokemon('Jolteon', {
            ...baseJolteonData,
            moves: [{ id: 'tackle', name: 'Tackle', power: 40, priority: 0, damage_class: { name: 'physical' }, type: 'normal' }]
        });

        // 3. Create a battle state where Trick Room is already active.
        const initialState = createBattleState(
            [slowWithPriority],
            [fastWithStandard],
            { trickRoomTurns: 4 } // Trick Room is active
        );

        const queuedActions = {
            [slowWithPriority.id]: { type: 'FIGHT', pokemon: slowWithPriority, move: slowWithPriority.moves[0], targetIds: [fastWithStandard.id], hits: [{ targetId: fastWithStandard.id }], willHit: true },
            [fastWithStandard.id]: { type: 'FIGHT', pokemon: fastWithStandard, move: fastWithStandard.moves[0], targetIds: [slowWithPriority.id], hits: [{ targetId: slowWithPriority.id }], willHit: true }
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const snorlaxAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Snorlax');
        const jolteonAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Jolteon');

        // Verify the slow Pokémon with the priority move still attacked first, ignoring Trick Room.
        expect(snorlaxAttackIndex).toBeLessThan(jolteonAttackIndex);
    });
    it('should correctly calculate turn order when multiple speed modifiers are active', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseGengarData = await fetchPokemonData('Gengar', 50);     // Speed: 110
        const baseManectricData = await fetchPokemonData('Manectric', 50); // Speed: 105
        const baseVaporeonData = await fetchPokemonData('Vaporeon', 50); // Speed: 65

        // 2. Create the Pokémon. Gengar holds a Choice Scarf. Vaporeon has Thunder Wave.
        const fastScarfedPokemon = createPokemon('Gengar', {
            ...baseGengarData,
            heldItem: 'choice-scarf',
            moves: [{ id: 'tackle', name: 'Tackle', priority: 0, damage_class: { name: 'physical' } }]
        });

        const paralzer = createPokemon('Vaporeon', {
            ...baseVaporeonData,
            moves: [{
                id: 'thunder-wave',
                name: 'Thunder Wave',
                priority: 0,
                damage_class: { name: 'status' },
                meta: { ailment: { name: 'paralysis' }, ailment_chance: 100 }
            }]
        });

        // --- TURN 1: The fast, scarfed Pokémon gets paralyzed ---
        let turn1State = createBattleState([fastScarfedPokemon], [paralzer]);
        const turn1Actions = {
            [paralzer.id]: { type: 'FIGHT', pokemon: paralzer, move: paralzer.moves[0], targetIds: [fastScarfedPokemon.id], hits: [{ targetId: fastScarfedPokemon.id }], applyEffect: true, willHit: true },
            [fastScarfedPokemon.id]: { type: 'FIGHT', pokemon: fastScarfedPokemon, move: fastScarfedPokemon.moves[0], hits: [], willHit: false },
        };

        const { finalBattleState: turn2State } = await executeTurn(turn1State, turn1Actions, allTrainers);

        // ASSERT (Turn 1) - Verify Gengar is now paralyzed.
        const paralyzedPokemon_Turn1 = findPokemon(turn2State, 'Gengar');
        expect(paralyzedPokemon_Turn1.status).toBe('Paralyzed');

        // --- TURN 2: Verify the new, combined speed calculation ---
        // Gengar's new speed: (110 / 2 for paralysis) * 1.5 for scarf = 82.5
        // We will pit it against Manectric, with a speed of 105.
        // The paralyzed Gengar should now be slower.
        const opponentForTurn2 = createPokemon('Manectric', {
            ...baseManectricData,
            moves: [{ id: 'tackle', name: 'Tackle', priority: 0, damage_class: { name: 'physical' } }]
        });

        turn2State.teams[1].pokemon = [opponentForTurn2];
        const paralyzedPokemon = findPokemon(turn2State, 'Gengar');

        const turn2Actions = {
            [paralyzedPokemon.id]: { type: 'FIGHT', pokemon: paralyzedPokemon, move: paralyzedPokemon.moves[0], targetIds: [opponentForTurn2.id], hits: [{ targetId: opponentForTurn2.id }], willHit: true },
            [opponentForTurn2.id]: { type: 'FIGHT', pokemon: opponentForTurn2, move: opponentForTurn2.moves[0], targetIds: [paralyzedPokemon.id], hits: [{ targetId: paralyzedPokemon.id }], willHit: true }
        };

        // ACT (Turn 2)
        const { finalLog: turn2Log } = await executeTurn(turn2State, turn2Actions, allTrainers);

        // ASSERT (Turn 2)
        const gengarAttackIndex = turn2Log.findIndex(log => log.type === 'attack' && log.attackerName === 'Gengar');
        const manectricAttackIndex = turn2Log.findIndex(log => log.type === 'attack' && log.attackerName === 'Manectric');

        expect(gengarAttackIndex).not.toBe(-1);
        expect(manectricAttackIndex).not.toBe(-1);

        // Verify the originally faster Gengar now moves AFTER Manectric.
        expect(manectricAttackIndex).toBeLessThan(gengarAttackIndex);
    });
});