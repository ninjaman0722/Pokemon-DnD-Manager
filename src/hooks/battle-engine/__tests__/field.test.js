import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon } from '../__helpers__/TestStateFactory';
// CORRECTED: Added the missing import for runOnSwitchIn
import { runOnSwitchIn } from '../fieldManager';
import { fetchPokemonData } from '../../../utils/api';

const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('Field Effects', () => {

    it('should deal 4x super-effective damage to a switching-in Pokémon', () => {
        // ARRANGE
        const charizard = createPokemon('Charizard', {
            types: ['fire', 'flying'],
            maxHp: 200,
            currentHp: 200,
        });

        const battleState = createBattleState(
            [charizard],
            [],
            {
                hazards: {
                    players: { 'stealth-rock': 1 }
                }
            }
        );

        const newLog = [];

        // ACT
        runOnSwitchIn([charizard], battleState, newLog);

        // ASSERT
        const expectedHp = charizard.maxHp - (charizard.maxHp * 0.5);
        expect(charizard.currentHp).toBe(expectedHp);
        expect(newLog.some(entry => entry.text.includes('Pointed stones dug into Charizard!'))).toBe(true);
    });

    it('should reverse the turn order when Trick Room is active', async () => {
        // ARRANGE
        const slowAttacker = createPokemon('Shuckle', {
            stats: { speed: 5 },
            moves: [{ id: 'rock-slide', name: 'Rock Slide', power: 75, damage_class: { name: 'physical' }, type: 'rock' }]
        });
        const fastOpponent = createPokemon('Electrode', {
            stats: { speed: 150 },
            moves: [{ id: 'thunderbolt', name: 'Thunderbolt', power: 90, damage_class: { name: 'special' }, type: 'electric' }]
        });
        const trickRoomSetter = createPokemon('Bronzong', {
            moves: [{ id: 'trick-room', name: 'Trick Room', priority: -7, damage_class: { name: 'status' }, type: 'psychic' }]
        });

        // ACT (Turn 1)
        let turn1State = createBattleState([trickRoomSetter], [fastOpponent]);
        let turn1Actions = {
            [trickRoomSetter.id]: {
                type: 'FIGHT',
                pokemon: trickRoomSetter,
                move: trickRoomSetter.moves[0],
                targetIds: [trickRoomSetter.id],
                hits: [{ targetId: trickRoomSetter.id }],
                willHit: true
            }
        };
        const { finalBattleState: turn2State } = await executeTurn(turn1State, turn1Actions, allTrainers);
        expect(turn2State.field.trickRoomTurns).toBeGreaterThan(0);

        // ARRANGE (Turn 2)
        turn2State.teams[0].pokemon = [slowAttacker];
        turn2State.teams[1].pokemon = [fastOpponent];
        turn2State.activePokemonIndices = { players: [0], opponent: [0] };

        let turn2Actions = {
            [slowAttacker.id]: { type: 'FIGHT', pokemon: slowAttacker, move: slowAttacker.moves[0], targetIds: [fastOpponent.id], hits: [{ targetId: fastOpponent.id }], willHit: true },
            [fastOpponent.id]: { type: 'FIGHT', pokemon: fastOpponent, move: fastOpponent.moves[0], targetIds: [slowAttacker.id], hits: [{ targetId: slowAttacker.id }], willHit: true }
        };

        // ACT (Turn 2)
        const { finalLog: turn2Log } = await executeTurn(turn2State, turn2Actions, allTrainers);

        // ASSERT (Turn 2)
        // CORRECTED: Find the structured attack log entry instead of a simple text log.
        const shuckleAttackIndex = turn2Log.findIndex(log => log.type === 'attack' && log.attackerName === 'Shuckle');
        const electrodeAttackIndex = turn2Log.findIndex(log => log.type === 'attack' && log.attackerName === 'Electrode');

        expect(shuckleAttackIndex).not.toBe(-1); // Ensure the log was found
        expect(electrodeAttackIndex).not.toBe(-1); // Ensure the log was found
        expect(shuckleAttackIndex).toBeLessThan(electrodeAttackIndex);
    });
    it('should absorb and remove Toxic Spikes when a grounded Poison-type switches in', async () => {
        // ARRANGE
        // 1. Fetch data for a grounded, Poison-type Pokémon. Nidoking is Poison/Ground.
        const baseNidokingData = await fetchPokemonData('Nidoking', 50);

        // 2. Create the Pokémon object.
        const nidoking = createPokemon('Nidoking', {
            stats: baseNidokingData.stats,
            baseStats: baseNidokingData.baseStats,
            types: baseNidokingData.types,
            maxHp: baseNidokingData.maxHp,
            currentHp: baseNidokingData.maxHp,
        });

        // 3. Create a battle state with two layers of Toxic Spikes on Nidoking's side.
        const battleState = createBattleState(
            [nidoking],
            [],
            {
                hazards: {
                    players: { 'toxic-spikes': 2 }
                }
            }
        );

        const newLog = [];

        // ACT
        // Call the function responsible for handling switch-in effects.
        runOnSwitchIn([nidoking], battleState, newLog);

        // ASSERT
        // The Toxic Spikes should be removed from the field.
        expect(battleState.field.hazards.players['toxic-spikes']).toBe(0);

        // Nidoking should not be poisoned.
        expect(nidoking.status).toBe('None');

        // The correct log message should have been generated.
        expect(newLog.some(entry => entry.text.includes('Nidoking absorbed the Toxic Spikes!'))).toBe(true);
    });
    it('should set Grassy Terrain on switch-in and heal grounded Pokémon at the end of the turn', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseRillaboomData = await fetchPokemonData('Rillaboom', 50);
        const baseMeowthData = await fetchPokemonData('Meowth', 50);

        // 2. Create the Pokémon. Rillaboom has Grassy Surge.
        // We'll set its HP slightly below max to clearly see the healing.
        const initialHp = baseRillaboomData.maxHp - 20;
        const grassySurger = createPokemon('Rillaboom', {
            stats: baseRillaboomData.stats,
            baseStats: baseRillaboomData.baseStats,
            types: baseRillaboomData.types,
            ability: { id: 'grassy-surge', name: 'Grassy Surge' },
            maxHp: baseRillaboomData.maxHp,
            currentHp: initialHp,
        });

        // The opponent will use a non-damaging move to not interfere with the HP check.
        const opponent = createPokemon('Meowth', {
            stats: baseMeowthData.stats,
            baseStats: baseMeowthData.baseStats,
            moves: [{ id: 'growl', name: 'Growl', damage_class: { name: 'status' }, type: 'normal' }]
        });

        // 3. Create a battle state. Grassy Surge should set the terrain automatically.
        const initialState = createBattleState([grassySurger], [opponent]);

        // The Rillaboom will do nothing to isolate the end-of-turn healing.
        const queuedActions = {
            [grassySurger.id]: { type: 'FIGHT', pokemon: grassySurger, move: { id: 'splash', name: 'Splash' }, willHit: false }, // Using a dummy move
            [opponent.id]: { type: 'FIGHT', pokemon: opponent, move: opponent.moves[0], targetIds: [grassySurger.id], hits: [{ targetId: grassySurger.id }], willHit: true }
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalRillaboom = findPokemon(finalBattleState, 'Rillaboom');

        // Assert that the terrain was set at the start of the battle.
        expect(finalLog.some(log => log.text?.includes('The battlefield became grassy!'))).toBe(true);

        // Assert that the Pokémon was healed by 1/16th of its max HP.
        const expectedHeal = Math.floor(grassySurger.maxHp / 16);
        expect(finalRillaboom.currentHp).toBe(initialHp + expectedHeal);

        // Assert that the healing message was logged.
        expect(finalLog.some(log => log.text?.includes('was healed by the Grassy Terrain!'))).toBe(true);
    });
        it('should lower the speed of a grounded Pokémon switching in', async () => {
        // ARRANGE
        // 1. Fetch data for a grounded Pokémon.
        const baseJolteonData = await fetchPokemonData('Jolteon', 50);

        // 2. Create the Pokémon object. Its initial speed stage is 0.
        const switchingInPokemon = createPokemon('Jolteon', {
            ...baseJolteonData,
            stat_stages: { speed: 0 } // Explicitly set starting stage
        });

        // 3. Create a battle state with Sticky Web on the player's side.
        const battleState = createBattleState(
            [switchingInPokemon],
            [],
            {
                hazards: {
                    players: { 'sticky-web': 1 }
                }
            }
        );

        const newLog = [];

        // ACT
        // We directly call runOnSwitchIn to test this specific mechanic in isolation.
        runOnSwitchIn([switchingInPokemon], battleState, newLog);

        // ASSERT
        // 1. The Pokémon's speed stage should now be -1.
        expect(switchingInPokemon.stat_stages.speed).toBe(-1);

        // 2. The correct message should have been logged.
        const webLogFound = newLog.some(entry => entry.text.includes('was caught in a Sticky Web!'));
        expect(webLogFound).toBe(true);
    });
});