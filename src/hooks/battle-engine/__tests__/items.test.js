import { itemEffects } from '../../../config/itemEffects';
import { TYPE_CHART } from '../../../config/gameData';

describe('Item Tests: Weakness Policy', () => {
    it('should sharply raise Attack and Sp. Atk when hit by a super-effective move', () => {
        // ARRANGE: Create a pokemon holding the item with initial stats
        const pokemon = {
            name: 'Tyranitar',
            types: ['rock', 'dark'],
            heldItem: { name: 'weakness-policy' },
            stat_stages: { 'attack': 0, 'special-attack': 0 }
        };
        // Create a super-effective move (Fighting vs. Rock/Dark)
        const move = { type: 'fighting' };
        const mockLog = [];
        
        // ACT: Call the item's specific hook function directly
        itemEffects['weakness-policy'].onTakeDamage(100, pokemon, move, {}, mockLog);

        // ASSERT: Check if the stats were raised and the item was consumed
        expect(pokemon.stat_stages['attack']).toBe(2);
        expect(pokemon.stat_stages['special-attack']).toBe(2);
        expect(pokemon.heldItem).toBeNull();
        expect(mockLog.some(l => l.text.includes('Weakness Policy was activated'))).toBe(true);
    });
});