// turnExecution.test.js

import { executeTurn } from '../turnExecution';
import gutsFixture from './fixtures/guts-facade-test.json';
import allTrainers from './fixtures/all-trainers.json';

describe('Battle Engine: Ability-Move Synergy', () => {
    it('should correctly calculate damage for a burned Guts user with Facade', async () => {
        // ARRANGE
        const conkeldurr = gutsFixture.teams[0].pokemon[0];
        const aggron = gutsFixture.teams[1].pokemon[0];

        const queuedActions = {
            [conkeldurr.id]: {
                type: 'FIGHT',
                pokemon: conkeldurr,
                move: conkeldurr.moves[0], // Facade
                targetIds: [aggron.id],
                hits: [{ targetId: aggron.id }],
                willHit: true,
            },
        };

        // ACT
        const { finalBattleState } = await executeTurn(gutsFixture, queuedActions, allTrainers);

        // ASSERT
        const finalAggron = finalBattleState.teams[1].pokemon[0];
        const damageDealt = aggron.currentHp - finalAggron.currentHp;

        // --- FIX: Corrected Assertions ---
        // The original comment noted damage should be ~93.
        // We will assert a range to confirm the boosts were applied correctly without being brittle.
        expect(damageDealt).toBeGreaterThan(90);
        expect(damageDealt).toBeLessThan(100);
    });
});