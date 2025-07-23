// battleUtils.test.js

import { getEffectiveAbility, isGrounded } from '../battleUtils';
// --- FIX: Import the test state factory ---
import { createPokemon, createBattleState } from '../__helpers__/TestStateFactory';

describe('battleUtils', () => {
    describe('getEffectiveAbility', () => {
        it('should return null if another pokemon has Neutralizing Gas', () => {
            // ARRANGE: Use the factory to create realistic test objects
            const pokemonWithAbility = createPokemon('Corviknight', { ability: 'Pressure' });
            const gasUser = createPokemon('Weezing', { ability: 'Neutralizing-Gas' });
            const battleState = createBattleState([pokemonWithAbility], [gasUser]);

            // ACT
            const effectiveAbility = getEffectiveAbility(pokemonWithAbility, battleState);
            
            // ASSERT
            expect(effectiveAbility).toBeNull();
        });

        it('should return the ability if Neutralizing Gas user is the pokemon itself', () => {
            // ARRANGE: Use the factory to ensure a correctly structured state
            const gasUser = createPokemon('Weezing', { id: 'p2', ability: 'Neutralizing-Gas' });
            const otherPokemon = createPokemon('Pikachu');
            // --- FIX: Use createBattleState for a valid structure ---
            const battleState = createBattleState([gasUser], [otherPokemon]);
            
            // ACT
            const effectiveAbility = getEffectiveAbility(gasUser, battleState);
            
            // ASSERT
            expect(effectiveAbility).toBe('Neutralizing-Gas');
        });
    });

    describe('isGrounded', () => {
        it('should return false for a Flying-type pokemon', () => {
            const flyingPokemon = createPokemon('Corviknight', { types: ['flying', 'steel'] });
            const battleState = createBattleState([flyingPokemon], []);
            expect(isGrounded(flyingPokemon, battleState)).toBe(false);
        });

        it('should return true for a Flying-type pokemon if Gravity is active', () => {
            const flyingPokemon = createPokemon('Corviknight', { types: ['flying', 'steel'] });
            const battleState = createBattleState([flyingPokemon], [], { gravityTurns: 1 });
            expect(isGrounded(flyingPokemon, battleState)).toBe(true);
        });
    });
});