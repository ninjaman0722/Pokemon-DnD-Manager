// src/hooks/battle-engine/__tests__/moves.test.js

import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon } from '../__helpers__/TestStateFactory';
import { fetchPokemonData } from '../../../utils/api';
import { officialFormsData } from '../../../config/officialFormsData';

const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('Move Mechanics', () => {
    it('should allow the DM to assign hits from a single multi-hit move to different targets', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon. We need one attacker and two defenders.
        const baseCinccinoData = await fetchPokemonData('Cinccino', 50);
        const baseCharmanderData = await fetchPokemonData('Charmander', 50);
        const baseSquirtleData = await fetchPokemonData('Squirtle', 50);

        // 2. Create the attacker with Skill Link to guarantee 5 hits.
        const attacker = createPokemon('Cinccino', {
            ...baseCinccinoData,
            ability: { id: 'skill-link', name: 'Skill Link' },
            moves: [{ id: 'tail-slap', name: 'Tail Slap', power: 25, type: 'normal', damage_class: { name: 'physical' } }]
        });

        // 3. Create the two defenders.
        const defenderA = createPokemon('Charmander', { ...baseCharmanderData });
        const defenderB = createPokemon('Squirtle', { ...baseSquirtleData });

        // 4. Create a 1v2 battle state.
        const initialState = createBattleState(
            [attacker], // Player team
            [defenderA, defenderB] // Opponent team
        );

        // 5. Manually construct the 'hits' array to simulate the DM's choice.
        // We will assign 3 hits to Charmander and 2 hits to Squirtle.
        const queuedActions = {
            [attacker.id]: {
                type: 'FIGHT',
                pokemon: attacker,
                move: attacker.moves[0],
                targetIds: [defenderA.id, defenderB.id], // Both are potential targets
                hits: [
                    { targetId: defenderA.id }, // Hit 1 -> Charmander
                    { targetId: defenderA.id }, // Hit 2 -> Charmander
                    { targetId: defenderB.id }, // Hit 3 -> Squirtle
                    { targetId: defenderA.id }, // Hit 4 -> Charmander
                    { targetId: defenderB.id }, // Hit 5 -> Squirtle
                ],
                willHit: true
            },
            // Actions for defenders are not important for this test.
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // Filter the log for attacks against Charmander.
        const hitsOnDefenderA = finalLog.filter(log =>
            log.type === 'attack' && log.defenderName === 'Charmander'
        );

        // Filter the log for attacks against Squirtle.
        const hitsOnDefenderB = finalLog.filter(log =>
            log.type === 'attack' && log.defenderName === 'Squirtle'
        );

        // Verify that the hits were distributed exactly as we specified.
        expect(hitsOnDefenderA.length).toBe(3);
        expect(hitsOnDefenderB.length).toBe(2);
    });
    it('should heal the attacker for 50% of the damage dealt by a drain move', async () => {
        // ARRANGE
        const baseVenusaurData = await fetchPokemonData('Venusaur', 50);
        const baseRhydonData = await fetchPokemonData('Rhydon', 50);

        const attacker = createPokemon('Venusaur', {
            ...baseVenusaurData,
            currentHp: 50,
            moves: [{ id: 'giga-drain', name: 'Giga Drain', power: 75, type: 'grass', damage_class: { name: 'special' } }]
        });
        const initialAttackerHp = attacker.currentHp;
        const defender = createPokemon('Rhydon', { ...baseRhydonData });
        const initialDefenderHp = defender.currentHp;

        const initialState = createBattleState([attacker], [defender]);

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
            [defender.id]: { type: 'FIGHT', pokemon: defender, move: { id: 'tackle' }, hits: [], willHit: false }
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Venusaur');
        const finalDefender = findPokemon(finalBattleState, 'Rhydon');

        const damageDealt = initialDefenderHp - finalDefender.currentHp;

        const expectedHealAmount = Math.max(1, Math.floor(damageDealt / 2));

        const expectedFinalHp = Math.min(attacker.maxHp, initialAttackerHp + expectedHealAmount);

        // 4. Assert that the attacker's HP matches the expected final HP.
        expect(finalAttacker.currentHp).toBe(expectedFinalHp);

        // 5. Assert that the correct log message was generated.
        const drainLogFound = finalLog.some(log => log.text?.includes('drained health!'));
        expect(drainLogFound).toBe(true);
    });
    it('should make the attacker take 1/3 recoil damage after using Brave Bird', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseStaraptorData = await fetchPokemonData('Staraptor', 50);
        const baseMetagrossData = await fetchPokemonData('Metagross', 50);

        // 2. Create the attacker with a recoil move.
        const attacker = createPokemon('Staraptor', {
            ...baseStaraptorData,
            moves: [{ id: 'brave-bird', name: 'Brave Bird', power: 120, type: 'flying', damage_class: { name: 'physical' } }]
        });
        const initialAttackerHp = attacker.currentHp;

        // 3. Create a bulky defender to ensure it survives the hit.
        const defender = createPokemon('Metagross', { ...baseMetagrossData });
        const initialDefenderHp = defender.currentHp;

        const initialState = createBattleState([attacker], [defender]);

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Staraptor');
        const finalDefender = findPokemon(finalBattleState, 'Metagross');

        // 1. Calculate how much damage was actually dealt to the defender.
        const damageDealt = initialDefenderHp - finalDefender.currentHp;
        expect(damageDealt).toBeGreaterThan(0);

        // 2. Calculate the expected recoil damage (Brave Bird is 1/3).
        const expectedRecoil = Math.max(1, Math.floor(damageDealt / 3));

        // 3. Determine the attacker's expected final HP.
        const expectedFinalHp = initialAttackerHp - expectedRecoil;

        // 4. Assert that the attacker's HP was reduced correctly.
        expect(finalAttacker.currentHp).toBe(expectedFinalHp);

        // 5. Assert that the correct log message was generated.
        const recoilLogFound = finalLog.some(log => log.text?.includes('is damaged by recoil!'));
        expect(recoilLogFound).toBe(true);
    });
    it('should lower the user\'s stats after using a self-stat-lowering move', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseLucarioData = await fetchPokemonData('Lucario', 50);
        const baseAggronData = await fetchPokemonData('Aggron', 50);

        // 2. Create the attacker with a move like Close Combat.
        // Close Combat lowers the user's Defense and Sp. Def by 1 stage.
        const attacker = createPokemon('Lucario', {
            ...baseLucarioData,
            moves: [{ id: 'close-combat', name: 'Close Combat', power: 120, type: 'fighting', damage_class: { name: 'physical' } }]
        });

        const defender = createPokemon('Aggron', { ...baseAggronData });
        const initialState = createBattleState([attacker], [defender]);

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalBattleState } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Lucario');

        // 1. Verify that Defense and Special Defense were lowered by one stage.
        expect(finalAttacker.stat_stages.defense).toBe(-1);
        expect(finalAttacker.stat_stages['special-defense']).toBe(-1);

        // 2. Verify that other stats were not changed.
        expect(finalAttacker.stat_stages.attack).toBe(0);
    });
    it('should deal damage for the number of hits specified by the DM', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseCinccinoData = await fetchPokemonData('Cinccino', 50);
        const baseAggronData = await fetchPokemonData('Aggron', 50);

        // 2. Create the attacker with a multi-hit move.
        const attacker = createPokemon('Cinccino', {
            ...baseCinccinoData,
            moves: [{ id: 'rock-blast', name: 'Rock Blast', power: 25, type: 'rock', damage_class: { name: 'physical' } }]
        });

        const defender = createPokemon('Aggron', { ...baseAggronData });
        const initialState = createBattleState([attacker], [defender]);

        // 3. Simulate the DM's decision that the move will hit 3 times.
        const queuedActions = {
            [attacker.id]: {
                type: 'FIGHT',
                pokemon: attacker,
                move: attacker.moves[0],
                targetIds: [defender.id],
                // The DM has decided the move hits 3 times.
                hits: [
                    { targetId: defender.id },
                    { targetId: defender.id },
                    { targetId: defender.id },
                ],
                willHit: true
            },
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // Filter the log to find only the attack entries from Cinccino's Rock Blast.
        const rockBlastHits = finalLog.filter(log =>
            log.type === 'attack' &&
            log.attackerName === 'Cinccino' &&
            log.moveName === 'Rock Blast'
        );

        // The number of attack entries should be exactly 3, matching the DM's input.
        expect(rockBlastHits.length).toBe(3);
    });
    it('should correctly execute a Z-Move and consume the teams Z-Move for the battle', async () => {
        // ARRANGE
        const attacker = createPokemon('Snorlax', {
            heldItem: { id: 'snorlium-z', name: 'Snorlium-Z' },
            moves: [{ id: 'giga-impact', name: 'Giga Impact', power: 150, damage_class: { name: 'physical' }, type: 'normal' }]
        });
        const defender = createPokemon('Pikachu', { maxHp: 150, currentHp: 150 });

        const initialState = createBattleState([attacker], [defender]);
        // The zMoveUsed flag for the player's team should start as false.
        initialState.zMoveUsed = { players: false, opponent: false };

        // This action simulates the user selecting a Z-Move in the UI.
        const queuedActions = {
            [attacker.id]: {
                type: 'Z_MOVE',
                pokemon: attacker,
                baseMove: attacker.moves[0],
                targetIds: [defender.id],
                hits: [{ targetId: defender.id }],
                isCritical: false
            }
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalDefender = findPokemon(finalBattleState, 'Pikachu');
        const zMoveLog = finalLog.find(log => log.moveName === 'Pulverizing Pancake');

        // 1. Verify the Z-Move's name was correctly logged in an attack entry.
        expect(zMoveLog).toBeDefined();

        // 2. Verify damage was dealt. Pulverizing Pancake has 210 base power.
        expect(finalDefender.currentHp).toBeLessThan(defender.maxHp);

        // 3. Verify the team's Z-Move has been consumed for the battle.
        expect(finalBattleState.zMoveUsed.players).toBe(true);
    });
    it('should always land as a critical hit unless blocked by an ability (Frost Breath)', async () => {
        // ARRANGE
        const attacker = createPokemon('Glaceon', {
            moves: [{ id: 'frost-breath', name: 'Frost Breath', power: 60, damage_class: { name: 'special' }, type: 'ice' }]
        });
        const normalDefender = createPokemon('Dragonite');
        const immuneDefender = createPokemon('Kingler', {
            ability: { id: 'shell-armor', name: 'Shell Armor' }
        });

        // --- TEST 1: Against a normal defender ---
        const testState1 = createBattleState([attacker], [normalDefender]);
        const actions1 = {
            [attacker.id]: {
                type: 'FIGHT',
                pokemon: attacker,
                move: attacker.moves[0],
                targetIds: [normalDefender.id],
                hits: [{ targetId: normalDefender.id }],
                willHit: true,
                isCritical: false // Manually set to false to prove the move overrides it.
            }
        };

        // ACT 1
        const { finalLog: log1 } = await executeTurn(testState1, actions1, allTrainers);

        // ASSERT 1
        const attackLog1 = log1.find(log => log.type === 'attack');
        expect(attackLog1.isCritical).toBe(true);

        // --- TEST 2: Against a Shell Armor defender ---
        const testState2 = createBattleState([attacker], [immuneDefender]);
        const actions2 = {
            [attacker.id]: {
                type: 'FIGHT',
                pokemon: attacker,
                move: attacker.moves[0],
                targetIds: [immuneDefender.id],
                hits: [{ targetId: immuneDefender.id }],
                willHit: true
                // isCritical flag is irrelevant here, but we can omit it
            }
        };

        // ACT 2
        const { finalLog: log2 } = await executeTurn(testState2, actions2, allTrainers);

        // ASSERT 2
        const attackLog2 = log2.find(log => log.type === 'attack');
        expect(attackLog2.isCritical).toBe(false);
    });
});