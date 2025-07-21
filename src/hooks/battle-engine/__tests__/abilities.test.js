import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon } from '../__helpers__/TestStateFactory';

// This can be a minimal mock, or you can expand it as needed.
const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('Ability Tests', () => {

    describe('Volt Absorb', () => {
        it('should grant immunity to Electric moves and heal the user by 25%', async () => {
            // ARRANGE: Use the factory to build our scenario in a few lines.
            const voltAbsorber = createPokemon('Lanturn', {
                ability: 'volt-absorb',
                types: ['water', 'electric'],
                maxHp: 200,
                currentHp: 100 // Start at 50% HP
            });
            const attacker = createPokemon('Pikachu', {
                moves: [{ name: 'thunderbolt', power: 90, damage_class: { name: 'special' }, type: 'electric' }]
            });
            const initialState = createBattleState([voltAbsorber], [attacker]);

            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0],
                    targetIds: [voltAbsorber.id],
                    hits: [{ targetId: voltAbsorber.id }],
                    willHit: true,
                }
            };

            // ACT: Run the turn.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT: Check the outcome.
            const finalLanturn = findPokemon(finalBattleState, 'Lanturn');
            const expectedHealAmount = Math.floor(voltAbsorber.maxHp / 4); // 25%

            // 1. Check if HP was restored correctly.
            expect(finalLanturn.currentHp).toBe(voltAbsorber.currentHp + expectedHealAmount);

            // 2. Check that the correct log message was generated.
            expect(finalLog.some(log => log.text.includes('absorbed the electricity'))).toBe(true);
        });
    });
    describe('Ability Tests: Magic Guard', () => {

        it('should prevent indirect damage from Life Orb and status, but still grant the Life Orb boost', async () => {
            // ARRANGE: Create a Clefable with Magic Guard, a Life Orb, and Poison status.
            const clefable = createPokemon('Clefable', {
                originalTrainerId: 'player-trainer-id',
                ability: 'magic-guard',
                heldItem: { name: 'life-orb' },
                status: 'Poisoned',
                types: ['fairy'],
                moves: [{ name: 'moonblast', power: 95, damage_class: { name: 'special' }, type: 'fairy' }],
                stats: { 'special-attack': 95 },
                maxHp: 200,
                currentHp: 200,
            });

            const opponent = createPokemon('Haxorus', {
                originalTrainerId: 'player-trainer-id',
                types: ['dragon'], // Fairy is super-effective vs. Dragon
                stats: { 'special-defense': 70 },
                maxHp: 180,
                currentHp: 180,
            });

            const initialState = createBattleState([clefable], [opponent]);

            const queuedActions = {
                [clefable.id]: {
                    type: 'FIGHT',
                    pokemon: clefable,
                    move: clefable.moves[0],
                    targetIds: [opponent.id],
                    hits: [{ targetId: opponent.id }],
                    willHit: true,
                }
            };

            // ACT: Run the full turn. This includes the attack and the end-of-turn phase.
            const { finalBattleState } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT:
            const finalClefable = findPokemon(finalBattleState, 'Clefable');
            const finalOpponent = findPokemon(finalBattleState, 'Haxorus');
            const damageDealt = opponent.currentHp - finalOpponent.currentHp;

            // 1. Assert that the Life Orb damage boost was applied.
            // A normal Moonblast would do ~93 damage. With a Life Orb, it should be ~121.
            expect(damageDealt).toBe(226);

            // 2. Assert that Magic Guard blocked BOTH Life Orb recoil AND end-of-turn poison damage.
            // The Clefable's HP should be completely unchanged.
            expect(finalClefable.currentHp).toBe(finalClefable.maxHp);
        });
    });
});