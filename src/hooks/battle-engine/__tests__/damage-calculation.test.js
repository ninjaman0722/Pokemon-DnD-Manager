// src/hooks/battle-engine/__tests__/damage-calculation.test.js

import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon } from '../__helpers__/TestStateFactory';
import { fetchPokemonData } from '../../../utils/api';

const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('Damage Calculation Mechanics', () => {
    it('should deal 0 damage when a move is used against an immune type', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseHaxorusData = await fetchPokemonData('Haxorus', 50);
        const baseCharizardData = await fetchPokemonData('Charizard', 50);

        // 2. Create the Pokémon. Haxorus has a Ground move.
        const attacker = createPokemon('Haxorus', {
            ...baseHaxorusData,
            moves: [{ id: 'earthquake', name: 'Earthquake', power: 100, type: 'ground', damage_class: { name: 'physical' } }]
        });

        // Charizard is part Flying type, making it immune to Ground moves.
        const immuneDefender = createPokemon('Charizard', {
            ...baseCharizardData,
            moves: [{ id: 'flamethrower', name: 'Flamethrower', power: 90, type: 'fire', damage_class: { name: 'special' } }]
        });

        // 3. Create the battle state.
        const initialState = createBattleState([attacker], [immuneDefender]);

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [immuneDefender.id], hits: [{ targetId: immuneDefender.id }], willHit: true },
            // Add the 'hits' property to the defender's action to prevent the error
            [immuneDefender.id]: { type: 'FIGHT', pokemon: immuneDefender, move: immuneDefender.moves[0], hits: [], willHit: false }
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalDefender = findPokemon(finalBattleState, 'Charizard');
        const damageDealt = immuneDefender.maxHp - finalDefender.currentHp;

        // 1. Primary Assertion: No damage should have been dealt.
        expect(damageDealt).toBe(0);

        // 2. Secondary Assertion: The log should contain the correct effectiveness message.
        // We look for the structured log entry from the damage calculation.
        const attackLogEntry = finalLog.find(log => log.type === 'attack' && log.attackerName === 'Haxorus');
        expect(attackLogEntry).toBeDefined();
        expect(attackLogEntry.effectivenessText).toBe("It had no effect...");
    });
    it('should deal 1.5x damage and ignore stat changes on a critical hit', async () => {
        // ARRANGE
        // 1. Fetch data for Pokémon at the same level.
        const baseLucarioData = await fetchPokemonData('Lucario', 50);
        const baseAggronData = await fetchPokemonData('Aggron', 50);

        // 2. Create the Pokémon.
        const attacker = createPokemon('Lucario', {
            ...baseLucarioData,
            moves: [{ id: 'close-combat', name: 'Close Combat', power: 120, type: 'fighting', damage_class: { name: 'physical' } }]
        });

        // 3. Give Aggron a non-interfering ability to prevent Sturdy from activating.
        const defender = createPokemon('Aggron', {
            ...baseAggronData,
            ability: { id: 'rock-head', name: 'Rock Head' }
        });

        // 4. Manually apply stat changes.
        attacker.stat_stages.attack = -2;
        defender.stat_stages.defense = +2;

        // 5. Create the battle state.
        const initialState = createBattleState([attacker], [defender]);

        const queuedActions = {
            [attacker.id]: {
                type: 'FIGHT',
                pokemon: attacker,
                move: attacker.moves[0],
                targetIds: [defender.id],
                hits: [{ targetId: defender.id }],
                isCritical: true, // Manually trigger the critical hit
                willHit: true
            },
            [defender.id]: { type: 'FIGHT', pokemon: defender, move: { id: 'tackle' }, hits: [], willHit: false }
        };

        // ACT
        const { finalBattleState } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalDefender = findPokemon(finalBattleState, 'Aggron');
        const damageDealt = defender.maxHp - finalDefender.currentHp;

        // With a Lvl 50 Lucario vs Lvl 50 Aggron, the correct crit damage is 315.
        // Sturdy will not interfere, so the full damage will be dealt (capping at Aggron's max HP).
        const expectedDamage = Math.min(315, defender.maxHp);

        expect(damageDealt).toBe(expectedDamage);
    });
    it('should halve the damage of a physical move if the attacker is Burned', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseHaxorusData = await fetchPokemonData('Haxorus', 50);
        const baseAggronData = await fetchPokemonData('Aggron', 50);

        // 2. Create the Pokémon.
        const attacker = createPokemon('Haxorus', {
            ...baseHaxorusData,
            moves: [{ id: 'dragon-claw', name: 'Dragon Claw', power: 80, type: 'dragon', damage_class: { name: 'physical' } }]
        });
        const defender = createPokemon('Aggron', { ...baseAggronData });

        // --- CONTROL: Calculate damage when NOT burned ---
        const controlState = createBattleState([attacker], [defender]);
        const controlActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };
        const { finalLog: controlLog } = await executeTurn(controlState, controlActions, allTrainers);
        const normalDamage = controlLog.find(log => log.type === 'attack')?.damage || 0;

        // Ensure some damage was dealt in the control case.
        expect(normalDamage).toBeGreaterThan(0);

        // --- TEST: Calculate damage WHEN burned ---
        // Create a fresh attacker and apply the burn status.
        const burnedAttacker = createPokemon('Haxorus', {
            ...baseHaxorusData,
            status: 'Burned', // Apply the burn
            moves: [{ id: 'dragon-claw', name: 'Dragon Claw', power: 80, type: 'dragon', damage_class: { name: 'physical' } }]
        });

        const testState = createBattleState([burnedAttacker], [defender]);
        const testActions = {
            [burnedAttacker.id]: { type: 'FIGHT', pokemon: burnedAttacker, move: burnedAttacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalLog: testLog } = await executeTurn(testState, testActions, allTrainers);
        const burnedDamage = testLog.find(log => log.type === 'attack')?.damage || 0;

        // ASSERT
        // The damage when burned should be 50% of the normal damage, rounded down.
        expect(burnedDamage).toBe(Math.floor(normalDamage / 2));
    });
});