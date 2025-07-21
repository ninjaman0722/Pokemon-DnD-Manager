import { calculateStatChange } from '../stateModifiers';

describe('stateModifiers', () => {
    describe('calculateStatChange', () => {
        const mockState = { field: { magicRoomTurns: 0 }, teams: [] };

        it("should double the stat change for a pokemon with the 'Simple' ability", () => {
            // Add volatileStatuses
            const pokemon = { ability: 'Simple', stat_stages: { attack: 0 }, volatileStatuses: [] };
            const { updatedTarget } = calculateStatChange(pokemon, 'attack', 1, mockState);
            expect(updatedTarget.stat_stages.attack).toBe(2);
        });

        it("should invert the stat change for a pokemon with the 'Contrary' ability", () => {
            // Add volatileStatuses
            const pokemon = { ability: 'Contrary', stat_stages: { defense: 0 }, volatileStatuses: [] };
            const { updatedTarget } = calculateStatChange(pokemon, 'defense', 2, mockState);
            expect(updatedTarget.stat_stages.defense).toBe(-2);
        });
        
        it("should prevent stat drops for a pokemon holding a 'Clear Amulet'", () => {
            const pokemon = { heldItem: { name: 'clear-amulet' }, stat_stages: { speed: 0 } };
            const { updatedTarget, newLog } = calculateStatChange(pokemon, 'speed', -1, mockState);
            
            expect(updatedTarget.stat_stages.speed).toBe(0);
            expect(newLog.some(log => log.text.includes('Clear Amulet'))).toBe(true);
        });
    });
});