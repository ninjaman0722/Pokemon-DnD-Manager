import { getEffectiveAbility, isGrounded } from '../battleUtils';

describe('battleUtils', () => {

    describe('isGrounded', () => {
        it('should return false for a Flying-type pokemon', () => {
            const flyingPokemon = { types: ['flying'] };
            const battleState = { field: { gravityTurns: 0 } };
            expect(isGrounded(flyingPokemon, battleState)).toBe(false);
        });

        it('should return true for a Flying-type pokemon if Gravity is active', () => {
            const flyingPokemon = { types: ['flying'] };
            const battleState = { field: { gravityTurns: 1 } };
            expect(isGrounded(flyingPokemon, battleState)).toBe(true);
        });
    });
});