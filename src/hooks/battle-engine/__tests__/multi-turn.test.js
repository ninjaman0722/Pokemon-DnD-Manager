import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon } from '../__helpers__/TestStateFactory';
import { fetchPokemonData } from '../../../utils/api';

const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('Multi-Turn Moves', () => {
    it('should make the user semi-invulnerable on turn 1 and deal damage on turn 2 for Fly', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseCharizardData = await fetchPokemonData('Charizard', 50);
        const baseVenusaurData = await fetchPokemonData('Venusaur', 50);

        // 2. Create the Pokémon, giving Charizard the move Fly.
        const attacker = createPokemon('Charizard', {
            stats: baseCharizardData.stats,
            baseStats: baseCharizardData.baseStats,
            types: baseCharizardData.types,
            moves: [
                { id: 'fly', name: 'Fly', power: 90, damage_class: { name: 'physical' }, type: 'flying' }
            ]
        });

        const defender = createPokemon('Venusaur', {
            stats: baseVenusaurData.stats,
            baseStats: baseVenusaurData.baseStats,
            types: baseVenusaurData.types,
            maxHp: baseVenusaurData.maxHp,
            currentHp: baseVenusaurData.maxHp,
        });

        // --- Turn 1: Charizard uses Fly ---
        let turn1State = createBattleState([attacker], [defender]);
        let turn1Actions = {
            [attacker.id]: {
                type: 'FIGHT',
                pokemon: attacker,
                move: attacker.moves[0], // Fly
                targetIds: [defender.id],
                hits: [{ targetId: defender.id }],
                willHit: true,
            }
        };

        // ACT (Turn 1)
        const { finalBattleState: turn2State, finalLog: turn1Log } = await executeTurn(turn1State, turn1Actions, allTrainers);

        // ASSERT (Turn 1)
        const finalAttacker_Turn1 = findPokemon(turn2State, 'Charizard');
        const finalDefender_Turn1 = findPokemon(turn2State, 'Venusaur');

        // 1. Charizard should now have the "Charging" status.
        expect(finalAttacker_Turn1.volatileStatuses).toContain('Charging');
        // 2. No damage should have been dealt yet.
        expect(finalDefender_Turn1.currentHp).toBe(defender.maxHp);
        // 3. The correct log message should appear.
        expect(turn1Log.some(log => log.text?.includes('began charging its move!'))).toBe(true);


        // --- Turn 2: Charizard attacks from the sky ---
        // For Turn 2, we only need an action for the defender. The engine should
        // automatically handle Charizard's attack because it's in a charging state.
        let turn2Actions = {
            [defender.id]: {
                type: 'FIGHT', pokemon: defender, move: { id: 'splash', name: 'Splash' }, willHit: false
            }
        };

        // ACT (Turn 2)
        const { finalBattleState: turn3State } = await executeTurn(turn2State, turn2Actions, allTrainers);

        // ASSERT (Turn 2)
        const finalAttacker_Turn2 = findPokemon(turn3State, 'Charizard');
        const finalDefender_Turn2 = findPokemon(turn3State, 'Venusaur');
        const damageDealt = defender.maxHp - finalDefender_Turn2.currentHp;

        // 1. Charizard should no longer be in the "Charging" state.
        expect(finalAttacker_Turn2.volatileStatuses).not.toContain('Charging');
        // 2. Venusaur should have taken damage.
        // Calculation: Lvl 50 Charizard (89 Atk) vs Lvl 50 Venusaur (88 Def) with 90 Power Fly (2x effective, with STAB)
        // Base Damage = 42. Final Damage = floor(42 * 1.5 * 2) = 126.
        expect(damageDealt).toBe(126);
    });
    it('should lock the user into Outrage for 2 turns and then cause confusion', async () => {
        // --- THIS IS THE CORRECTED MOCKING LOGIC ---
        // 1. Use jest.spyOn to "watch" the Math.random function.
        const randomSpy = jest.spyOn(Math, 'random');
        // 2. Tell the spy to always return 0.1 for this test, forcing a 2-turn duration.
        randomSpy.mockReturnValue(0.1);
        // --- END CORRECTION ---

        const baseHaxorusData = await fetchPokemonData('Haxorus', 50);
        const baseAggronData = await fetchPokemonData('Aggron', 50);

        const attacker = createPokemon('Haxorus', {
            stats: baseHaxorusData.stats,
            baseStats: baseHaxorusData.baseStats,
            types: baseHaxorusData.types,
            moves: [
                { id: 'outrage', name: 'Outrage', power: 120, damage_class: { name: 'physical' }, type: 'dragon' }
            ]
        });
        const defender = createPokemon('Aggron', {
            stats: baseAggronData.stats,
            baseStats: baseAggronData.baseStats,
            maxHp: baseAggronData.maxHp,
            currentHp: baseAggronData.maxHp,
        });

        // --- Turn 1: Haxorus starts Outrage ---
        let turn1State = createBattleState([attacker], [defender]);
        let turn1Actions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true }
        };
        const { finalBattleState: turn2State } = await executeTurn(turn1State, turn1Actions, allTrainers);
        const finalAttacker_Turn1 = findPokemon(turn2State, 'Haxorus');
        expect(finalAttacker_Turn1.lockedMove).not.toBeNull();
        expect(finalAttacker_Turn1.lockedMove.id).toBe('outrage');
        expect(finalAttacker_Turn1.lockedMove.turns).toBe(1); // After 1 turn, 1 turn remains in a 2-turn rampage

        // --- Turn 2: Haxorus is forced to continue Outrage ---
        let turn2Actions = {
            [defender.id]: { type: 'FIGHT', pokemon: defender, move: { id: 'splash', name: 'Splash' }, willHit: false }
        };
        const { finalBattleState: turn3State } = await executeTurn(turn2State, turn2Actions, allTrainers);
        const finalAttacker_Turn2 = findPokemon(turn3State, 'Haxorus');
        expect(finalAttacker_Turn2.lockedMove).toBeNull();
        expect(finalAttacker_Turn2.volatileStatuses).toContain('Confused');

        // --- THIS IS THE CORRECTED RESTORE LOGIC ---
        // 3. Restore the original Math.random function.
        randomSpy.mockRestore();
        // --- END CORRECTION ---
    });
});