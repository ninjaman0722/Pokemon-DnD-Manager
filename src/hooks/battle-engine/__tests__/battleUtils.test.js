import { getEffectiveAbility, isGrounded } from '../battleUtils';

describe('battleUtils', () => {
    describe('getEffectiveAbility', () => {
        it('should return null if another pokemon has Neutralizing Gas', () => {
            const pokemonWithAbility = { id: 'p1', ability: 'Intimidate', volatileStatuses: [] };
            const gasUser = { id: 'p2', ability: 'Neutralizing-Gas', fainted: false, volatileStatuses: [] };
            
            // CORRECTED BATTLE STATE STRUCTURE
            const battleState = {
                teams: [
                    { id: 'players', pokemon: [pokemonWithAbility] },
                    { id: 'opponent', pokemon: [gasUser] }
                ]
            };
            
            const effectiveAbility = getEffectiveAbility(pokemonWithAbility, battleState);
            expect(effectiveAbility).toBeNull();
        });

        it('should return the ability if Neutralizing Gas user is the pokemon itself', () => {
            // Add volatileStatuses to the mock object
            const gasUser = { id: 'p2', ability: 'Neutralizing-Gas', fainted: false, volatileStatuses: [] };
            const battleState = { teams: [[], [{ pokemon: [gasUser] }]] };

            const effectiveAbility = getEffectiveAbility(gasUser, battleState);
            expect(effectiveAbility).toBe('Neutralizing-Gas');
        });
    });

    // ... isGrounded tests remain the same ...
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