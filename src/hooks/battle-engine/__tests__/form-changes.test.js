import { abilityEffects } from '../../../config/abilityEffects';
import { officialFormsData } from '../../../config/officialFormsData';

describe('Form Change Tests: Stance Change', () => {
    it("should queue a form change to Blade Forme when using an attacking move", () => {
        // ARRANGE
        const aegislash = {
            name: 'Aegislash',
            transformed: false, // Starts in Shield Forme
            forms: officialFormsData['aegislash'] // Give it the form data
        };
        const attackingMove = { damage_class: { name: 'physical' } };
        const mockLog = [];
        const mockBattleState = { formChangeQueue: [] };

        // ACT
        abilityEffects['stance-change'].onBeforeMove(aegislash, attackingMove, mockBattleState, mockLog);

        // ASSERT: Check if the correct form change was added to the queue
        expect(mockBattleState.formChangeQueue.length).toBe(1);
        expect(mockBattleState.formChangeQueue[0].form.formName).toBe('aegislash-blade');
    });
});