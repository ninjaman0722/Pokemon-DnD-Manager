// items.test.js

import { itemEffects } from '../../../config/itemEffects';
import { TYPE_CHART } from '../../../config/gameData';
// --- FIX: Import the test state factory ---
import { createPokemon } from '../__helpers__/TestStateFactory';

describe('Item Tests: Weakness Policy', () => {
    it('should sharply raise Attack and Sp. Atk when hit by a super-effective move', () => {
        // ARRANGE: Use the factory to create the test Pokémon
        // --- FIX: Use createPokemon for a realistic and consistent object ---
        const pokemon = createPokemon('Tyranitar', {
            types: ['rock', 'dark'],
            heldItem: { name: 'weakness-policy' },
        });
        
        const move = { type: 'fighting' };
        const mockLog = [];
        
        // ACT
        itemEffects['weakness-policy'].onTakeDamage(100, pokemon, move, {}, mockLog);

        // ASSERT
        expect(pokemon.stat_stages['attack']).toBe(2);
        expect(pokemon.stat_stages['special-attack']).toBe(2);
        expect(pokemon.heldItem).toBeNull();
        expect(mockLog.some(l => l.text.includes('Weakness Policy was activated'))).toBe(true);
    });
});