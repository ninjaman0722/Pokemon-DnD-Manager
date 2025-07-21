import { calculateDamage } from '../damageCalculator';

describe('DEBUGGING TEST for damageCalculator', () => {
    it('should be able to call calculateDamage and show logs', () => {
        console.log('--- RUNNING DEBUG TEST ---');

        const mockAttacker = { name: 'Debug Attacker', heldItem: { name: 'life-orb' }, volatileStatuses: [], types: ['normal'], stats: {}, stat_stages: {} };
        const mockDefender = { name: 'Debug Defender', types: ['normal'], volatileStatuses: [], stats: {}, stat_stages: {} };
        const mockMove = { power: 50, type: 'normal', damage_class: { name: 'physical' } };
        const mockState = { field: {} };
        const mockLog = [];

        calculateDamage(mockAttacker, mockDefender, mockMove, false, mockState, mockLog);

        expect(true).toBe(true);
    });
});