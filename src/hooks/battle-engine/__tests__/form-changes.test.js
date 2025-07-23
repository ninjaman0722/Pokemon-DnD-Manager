// form-changes.test.js

import { abilityEffects } from '../../../config/abilityEffects';
import { officialFormsData } from '../../../config/officialFormsData';

describe('Form Change Tests: Stance Change', () => {
    it("should queue a form change to Blade Forme when using an attacking move", () => {
        // ARRANGE
        const aegislash = {
            name: 'Aegislash',
            transformed: false, // Starts in Shield Forme
            forms: officialFormsData['aegislash'],
        };
        const attackingMove = { damage_class: { name: 'physical' } };
        const mockLog = [];
        const mockBattleState = { formChangeQueue: [] };

        // ACT
        abilityEffects['stance-change'].onBeforeMove(aegislash, attackingMove, mockBattleState, mockLog);

        // ASSERT
        expect(mockBattleState.formChangeQueue.length).toBe(1);
        expect(mockBattleState.formChangequeue[0].form.formName).toBe('aegislash-blade');
    });

    // --- FIX: Add the missing test case for reverting form ---
    it("should queue a form reversion when using King's Shield in Blade Forme", () => {
        // ARRANGE
        const aegislash = {
            name: 'Aegislash-Blade',
            transformed: true, // Starts in Blade Forme for this test
            forms: officialFormsData['aegislash'],
        };
        const kingsShieldMove = { name: "King's Shield", damage_class: { name: 'status' } };
        const mockLog = [];
        const mockBattleState = { formChangeQueue: [] };

        // ACT
        abilityEffects['stance-change'].onBeforeMove(aegislash, kingsShieldMove, mockBattleState, mockLog);

        // ASSERT
        expect(mockBattleState.formChangeQueue.length).toBe(1);
        expect(mockBattleState.formChangeQueue[0].form.formName).toBe('aegislash-blade');
    });
});