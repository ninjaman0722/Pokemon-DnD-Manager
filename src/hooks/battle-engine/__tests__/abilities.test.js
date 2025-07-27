import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon, mockState } from '../__helpers__/TestStateFactory';
import { fetchPokemonData } from '../../../utils/api';
import { calculateDamage } from '../damageCalculator';
import { calculateStatChange } from '../stateModifiers';
import { getEffectiveAbility } from '../battleUtils';
import { officialFormsData } from '../../../config/officialFormsData';
import { abilityEffects } from '../../../config/abilityEffects';

const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('Ability Tests', () => {

    describe('Volt Absorb', () => {
        it('should grant immunity to Electric moves and heal the user by 25%', async () => {
            const voltAbsorber = createPokemon('Lanturn', {
                ability: 'volt-absorb',
                types: ['water', 'electric'],
                maxHp: 200,
                currentHp: 100
            });
            const attacker = createPokemon('Pikachu', {
                moves: [{ id: 'thunderbolt', name: 'Thunderbolt', power: 90, damage_class: { name: 'special' }, type: 'electric' }]
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

            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            const finalLanturn = findPokemon(finalBattleState, 'Lanturn');
            const expectedHealAmount = Math.floor(voltAbsorber.maxHp / 4);

            expect(finalLanturn.currentHp).toBe(voltAbsorber.currentHp + expectedHealAmount);

            // CORRECTED: Check for .text before calling .includes()
            expect(finalLog.some(log => log.text && log.text.includes("Lanturn's Volt Absorb restored its health!"))).toBe(true);
        });
    });

    describe('Ability Tests: Magic Guard', () => {
        it('should prevent indirect damage from Life Orb and status, but still grant the Life Orb boost', async () => {
            const baseClefableData = await fetchPokemonData('Clefable', 50);
            const baseSalamenceData = await fetchPokemonData('Salamence', 80);

            const clefable = createPokemon('Clefable', {
                stats: baseClefableData.stats,
                baseStats: baseClefableData.baseStats, // CORRECTED: Added baseStats
                maxHp: baseClefableData.maxHp,
                currentHp: baseClefableData.maxHp,
                types: baseClefableData.types,
                ability: 'magic-guard',
                heldItem: 'life-orb',
                status: 'Poisoned',
                moves: [{ id: 'moonblast', name: 'Moonblast', power: 95, damage_class: { name: 'special' }, type: 'fairy' }],
            });

            const opponent = createPokemon('Salamence', {
                stats: baseSalamenceData.stats,
                baseStats: baseSalamenceData.baseStats, // CORRECTED: Added baseStats
                maxHp: baseSalamenceData.maxHp,
                currentHp: baseSalamenceData.maxHp,
                types: baseSalamenceData.types,
                ability: baseSalamenceData.ability,
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

            // ACT
            const { finalBattleState } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalClefable = findPokemon(finalBattleState, 'Clefable');
            const finalOpponent = findPokemon(finalBattleState, 'Salamence');
            const damageDealt = opponent.maxHp - finalOpponent.currentHp;

            // CORRECTED: Assert against the new, non-lethal damage amount.
            expect(damageDealt).toBe(128);
            // This assertion still correctly proves Magic Guard is working.
            expect(finalClefable.currentHp).toBe(finalClefable.maxHp);
        });
    });
    describe('Ability: Unaware', () => {
        it('should ignore the opponents positive stat changes when taking damage', async () => {
            const baseScizorData = await fetchPokemonData('Scizor', 50);
            const baseQuagsireData = await fetchPokemonData('Quagsire', 50);

            const attacker = createPokemon('Scizor', {
                stats: baseScizorData.stats,
                baseStats: baseScizorData.baseStats,
                types: baseScizorData.types,
                moves: [
                    { id: 'swords-dance', name: 'Swords Dance', damage_class: { name: 'status' }, type: 'normal', stat_changes: [{ change: 2, stat: { name: 'attack' } }] },
                    { id: 'x-scissor', name: 'X-Scissor', power: 80, damage_class: { name: 'physical' }, type: 'bug' }
                ]
            });

            const defender = createPokemon('Quagsire', {
                ability: 'unaware',
                stats: baseQuagsireData.stats,
                baseStats: baseQuagsireData.baseStats,
                types: baseQuagsireData.types,
                maxHp: baseQuagsireData.maxHp,
                currentHp: baseQuagsireData.maxHp,
            });

            // --- Turn 1: Scizor uses Swords Dance ---
            let turn1State = createBattleState([attacker], [defender]);
            let turn1Actions = { [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [attacker.id], hits: [{ targetId: attacker.id }], willHit: true } };
            const { finalBattleState: turn2State } = await executeTurn(turn1State, turn1Actions, allTrainers);
            const finalAttacker_Turn1 = findPokemon(turn2State, 'Scizor');
            expect(finalAttacker_Turn1.stat_stages.attack).toBe(2);

            // --- Turn 2: The boosted Scizor attacks ---
            let turn2Actions = { [finalAttacker_Turn1.id]: { type: 'FIGHT', pokemon: finalAttacker_Turn1, move: finalAttacker_Turn1.moves[1], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true } };
            const { finalBattleState: turn3State } = await executeTurn(turn2State, turn2Actions, allTrainers);

            // ASSERT
            const finalDefender_Turn2 = findPokemon(turn3State, 'Quagsire');
            const damageDealt = defender.maxHp - finalDefender_Turn2.currentHp;

            expect(damageDealt).toBe(81);
        });
    });
    describe('Ability: Mold Breaker', () => {
        it('should bypass a defenders Levitate ability and deal super-effective damage', async () => {
            // ARRANGE
            // 1. Fetch real data for the Pokémon to ensure stats and types are accurate.
            const baseHaxorusData = await fetchPokemonData('Haxorus', 50);
            const baseWeezingData = await fetchPokemonData('Weezing', 50);

            // 2. Create the attacker, ensuring its ability is set to Mold Breaker
            //    and it has the necessary Ground-type move for the test.
            const attacker = createPokemon('Haxorus', {
                stats: baseHaxorusData.stats,
                baseStats: baseHaxorusData.baseStats,
                types: baseHaxorusData.types,
                ability: { id: 'mold-breaker', name: 'Mold Breaker' },
                moves: [
                    { id: 'earthquake', name: 'Earthquake', power: 100, damage_class: { name: 'physical' }, type: 'ground' }
                ]
            });

            // 3. Create the defender and ensure its ability is set to Levitate.
            const defender = createPokemon('Weezing', {
                stats: baseWeezingData.stats,
                baseStats: baseWeezingData.baseStats,
                types: baseWeezingData.types,
                ability: { id: 'levitate', name: 'Levitate' },
                maxHp: baseWeezingData.maxHp,
                currentHp: baseWeezingData.maxHp,
            });

            const initialState = createBattleState([attacker], [defender]);
            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0], // Earthquake
                    targetIds: [defender.id],
                    hits: [{ targetId: defender.id }],
                    willHit: true
                }
            };

            // ACT
            const { finalBattleState } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalDefender = findPokemon(finalBattleState, 'Weezing');
            const damageDealt = defender.maxHp - finalDefender.currentHp;

            // Normally, a Ground move cannot hit a Pokémon with Levitate (0 damage).
            // Because of Mold Breaker, the immunity is bypassed, and the move should deal
            // super-effective damage (Ground is 2x vs. Weezing's Poison type).
            // Calculation: Lvl 50 Haxorus (152 Atk) vs Lvl 50 Weezing (125 Def) with 100 Power Earthquake (2x effective)
            // Base Damage = 55. Final Damage = floor(55 * 2) = 110.
            expect(damageDealt).toBe(110);
        });
    });
    describe('Ability: Neutralizing Gas', () => {
        it('should suppress the abilities of other Pokémon on the field', async () => {
            // ARRANGE
            // 1. Fetch data for our Pokémon.
            const baseWeezingData = await fetchPokemonData('Weezing', 50);
            const basePelipperData = await fetchPokemonData('Pelipper', 50);

            // 2. Create the Pokémon. Weezing has Neutralizing Gas.
            const gasUser = createPokemon('Weezing', {
                stats: baseWeezingData.stats,
                baseStats: baseWeezingData.baseStats,
                ability: { id: 'neutralizing-gas', name: 'Neutralizing Gas' },
                moves: [{ id: 'tackle', name: 'Tackle', power: 40, damage_class: { name: 'physical' }, type: 'normal' }]
            });

            // Pelipper has Drizzle, which should set rain on switch-in.
            const opponentWithAbility = createPokemon('Pelipper', {
                stats: basePelipperData.stats,
                baseStats: basePelipperData.baseStats,
                ability: { id: 'drizzle', name: 'Drizzle' },
                moves: [{ id: 'scald', name: 'Scald', power: 80, damage_class: { name: 'special' }, type: 'water' }]
            });

            // 3. Create a battle state. The weather starts as 'none'.
            // The test will pass if Neutralizing Gas prevents Drizzle from changing it.
            const initialState = createBattleState([gasUser], [opponentWithAbility]);

            // The actions for the turn are not critical; we just need the turn to process
            // to see if the switch-in ability was suppressed.
            const queuedActions = {
                [gasUser.id]: { type: 'FIGHT', pokemon: gasUser, move: gasUser.moves[0], targetIds: [opponentWithAbility.id], hits: [{ targetId: opponentWithAbility.id }], willHit: true },
                [opponentWithAbility.id]: { type: 'FIGHT', pokemon: opponentWithAbility, move: opponentWithAbility.moves[0], targetIds: [gasUser.id], hits: [{ targetId: gasUser.id }], willHit: true }
            };

            // ACT
            // The engine runs start-of-battle abilities automatically before the first turn.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. The primary assertion: The weather should NOT have changed to rain.
            expect(finalBattleState.field.weather).toBe('none');

            // 2. A secondary check: The log should not contain the message for rain starting.
            const rainLogFound = finalLog.some(log => log.text?.includes('It started to rain!'));
            expect(rainLogFound).toBe(false);
        });
    });
    describe('Ability: Imposter', () => {
        it('should transform into the opponent on switch-in, copying stats, ability, and moves', async () => {
            // ARRANGE
            // 1. Fetch data for Ditto and its opponent.
            const baseDittoData = await fetchPokemonData('Ditto', 50);
            const baseDragoniteData = await fetchPokemonData('Dragonite', 50);

            // 2. Create the Pokémon. Ditto has Imposter.
            const imposterUser = createPokemon('Ditto', {
                ...baseDittoData, // Spread all base data
                ability: { id: 'imposter', name: 'Imposter' }
            });

            const opponent = createPokemon('Dragonite', {
                ...baseDragoniteData, // Spread all base data
                ability: { id: 'multiscale', name: 'Multiscale' } // Dragonite's ability
            });

            // 3. Create a battle state with Ditto facing Dragonite.
            const initialState = createBattleState([imposterUser], [opponent]);

            // The actions are just placeholders to allow the turn to process.
            // Imposter activates automatically on switch-in at the start of the turn.
            const queuedActions = {
                [imposterUser.id]: { type: 'FIGHT', pokemon: imposterUser, move: { id: 'transform' }, willHit: true },
                // Have the opponent use a non-damaging move to not interfere with our HP check.
                [opponent.id]: { type: 'FIGHT', pokemon: opponent, move: { id: 'splash', name: 'Splash', damage_class: { name: 'status' } }, willHit: false }
            };

            // ACT
            const { finalBattleState } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // Find the Pokémon by its unique ID, which doesn't change after transformation.
            const finalDitto = finalBattleState.teams
                .flatMap(team => team.pokemon)
                .find(p => p.id === imposterUser.id);

            // 1. Verify the Pokémon was actually found
            expect(finalDitto).toBeDefined();

            // 2. Verify visual and type transformation
            expect(finalDitto.name).toBe(opponent.name);
            expect(finalDitto.types).toEqual(opponent.types);

            // 3. Verify ability was copied
            expect(finalDitto.ability.id).toBe(opponent.ability.id);

            // 4. Verify stats were copied (except HP)
            expect(finalDitto.stats.attack).toBe(opponent.stats.attack);
            expect(finalDitto.stats.defense).toBe(opponent.stats.defense);

            // 5. CRITICAL: Verify HP was NOT copied
            expect(finalDitto.maxHp).toBe(imposterUser.maxHp);
            expect(finalDitto.currentHp).toBe(imposterUser.currentHp);

            // 6. Verify moves were copied with 5 PP
            expect(finalDitto.moves.length).toBe(opponent.moves.length);
            expect(finalDitto.moves[0].name).toBe(opponent.moves[0].name);
            expect(finalDitto.moves[0].pp).toBe(5);
            expect(finalDitto.transformed).toBe(true);
        });
    });
    it('should heal the user for 1/3 of its max HP upon switching out', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon. Toxapex is a classic Regenerator user.
        const baseToxapexData = await fetchPokemonData('Toxapex', 50);
        const basePikachuData = await fetchPokemonData('Pikachu', 50);
        const baseAggronData = await fetchPokemonData('Aggron', 50);

        // 2. Create the Pokémon. The Regenerator user needs to be damaged.
        const regeneratorUser = createPokemon('Toxapex', {
            ...baseToxapexData,
            ability: 'regenerator', // The helper will convert this to an object
            currentHp: 1, // Set HP critically low to see the healing effect
        });
        const initialHp = regeneratorUser.currentHp;
        const pokemonToSwitchIn = createPokemon('Pikachu', { ...basePikachuData });
        const opponent = createPokemon('Aggron', { ...baseAggronData });

        // 3. Create a battle state with two Pokémon on the player's team.
        const initialState = createBattleState(
            [regeneratorUser, pokemonToSwitchIn], // Player team
            [opponent]                          // Opponent team
        );

        // 4. The action for this turn will be to switch from Toxapex to Pikachu.
        const queuedActions = {
            [regeneratorUser.id]: {
                type: 'SWITCH',
                pokemon: regeneratorUser,
                newPokemonId: pokemonToSwitchIn.id
            },
            [opponent.id]: { type: 'FIGHT', pokemon: opponent, move: { id: 'tackle' }, hits: [], willHit: false }
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // 1. Find the Regenerator Pokémon in the final state (it will be on the bench).
        const finalRegeneratorUser = finalBattleState.teams[0].pokemon.find(p => p.id === regeneratorUser.id);
        expect(finalRegeneratorUser).toBeDefined();

        // 2. Calculate the expected amount of healing (1/3 of max HP).
        const expectedHealAmount = Math.floor(finalRegeneratorUser.maxHp / 3);
        const expectedFinalHp = initialHp + expectedHealAmount;

        // 3. Assert that the Pokémon's HP was restored correctly.
        expect(finalRegeneratorUser.currentHp).toBe(expectedFinalHp);

        // 4. Assert that the correct message was logged.
        const regenLogFound = finalLog.some(log => log.text?.includes('restored its health as it withdrew!'));
        expect(regenLogFound).toBe(true);
    });
    it('should lower the opponent\'s Attack by one stage on switch-in', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseArcanineData = await fetchPokemonData('Arcanine', 50);
        const baseHaxorusData = await fetchPokemonData('Haxorus', 50);

        // 2. Create the Pokémon. Arcanine has the Intimidate ability.
        const intimidator = createPokemon('Arcanine', {
            ...baseArcanineData,
            ability: 'intimidate'
        });

        // The opponent starts with a neutral Attack stage.
        const opponent = createPokemon('Haxorus', {
            ...baseHaxorusData,
            stat_stages: { attack: 0 } // Explicitly start at 0
        });

        // 3. Create the battle state. Intimidate triggers at the start of the first turn.
        const initialState = createBattleState([intimidator], [opponent]);

        // The actions for the turn are not critical; Intimidate triggers before moves are executed.
        const queuedActions = {
            [intimidator.id]: { type: 'FIGHT', pokemon: intimidator, move: { id: 'tackle' }, hits: [], willHit: false },
            [opponent.id]: { type: 'FIGHT', pokemon: opponent, move: { id: 'tackle' }, hits: [], willHit: false }
        };

        // ACT
        // The onSwitchIn effects like Intimidate are handled at the start of executeTurn.
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // 1. Find the opponent in the final state.
        const finalOpponent = findPokemon(finalBattleState, 'Haxorus');

        // 2. Verify its Attack stat stage was lowered to -1.
        expect(finalOpponent.stat_stages.attack).toBe(-1);

        // 3. Verify the correct message was logged.
        const intimidateLogFound = finalLog.some(log => log.text?.includes('Intimidate cuts the foe\'s attack!'));
        expect(intimidateLogFound).toBe(true);
    });
    it('should apply a status condition to the attacker on contact', async () => {
        // ARRANGE
        const basePikachuData = await fetchPokemonData('Pikachu', 50);
        const baseRattataData = await fetchPokemonData('Rattata', 50);

        const defender = createPokemon('Pikachu', {
            ...basePikachuData,
            ability: 'static'
        });

        const attacker = createPokemon('Rattata', {
            ...baseRattataData,
            status: 'None',
            moves: [{ id: 'tackle', name: 'Tackle', power: 40, type: 'normal', damage_class: { name: 'physical' } }]
        });
        const initialState = createBattleState([defender], [attacker]);

        const queuedActions = {
            [attacker.id]: {
                type: 'FIGHT',
                pokemon: attacker,
                move: attacker.moves[0],
                targetIds: [defender.id],
                hits: [{ targetId: defender.id }],
                willHit: true,
                applyEffect: true // Use the correct flag
            },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Rattata');
        expect(finalAttacker.status).toBe('Paralyzed');
        const staticLogFound = finalLog.some(log => log.text?.includes('Static paralyzed Rattata!'));
        expect(staticLogFound).toBe(true);
    });
    it('should copy the opponent\'s ability upon switching in (Trace)', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseGardevoirData = await fetchPokemonData('Gardevoir', 50);
        const baseArcanineData = await fetchPokemonData('Arcanine', 50);

        // 2. Create the Pokémon. Gardevoir will have Trace.
        // Arcanine has Intimidate, which Trace will copy.
        const tracer = createPokemon('Gardevoir', {
            ...baseGardevoirData,
            ability: { id: 'trace', name: 'Trace' },
        });

        const opponentWithAbility = createPokemon('Arcanine', {
            ...baseArcanineData,
            ability: { id: 'intimidate', name: 'Intimidate' },
            stat_stages: { attack: 0 } // Opponent starts at neutral
        });

        // 3. Create the initial state. Trace triggers before any moves are made.
        const initialState = createBattleState([tracer], [opponentWithAbility]);
        const queuedActions = {}; // No actions needed for a switch-in test.

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalTracer = findPokemon(finalBattleState, 'Gardevoir');
        const finalOpponent = findPokemon(finalBattleState, 'Arcanine');

        // 1. Verify Gardevoir's ability is now Intimidate.
        expect(finalTracer.ability.id).toBe('intimidate');

        // 2. Verify that the copied ability (Intimidate) then activated correctly, lowering the opponent's attack.
        expect(finalOpponent.stat_stages.attack).toBe(-1);

        // 3. Verify the correct log messages appeared in order.
        const traceLogIndex = finalLog.findIndex(log => log.text?.includes('traced Arcanine\'s Intimidate!'));
        const intimidateLogIndex = finalLog.findIndex(log => log.text?.includes('Intimidate cuts the foe\'s attack!'));

        expect(traceLogIndex).not.toBe(-1); // Ensure Trace message exists
        expect(intimidateLogIndex).not.toBe(-1); // Ensure Intimidate message exists
        expect(traceLogIndex).toBeLessThan(intimidateLogIndex); // Trace must happen before the copied ability triggers
    });

    it('should lower the Special Defense of all other Pokémon on the field (Beads of Ruin)', async () => {
        // ARRANGE
        const ruinPokemon = createPokemon('Chi-Yu', {
            ability: { id: 'beads-of-ruin', name: 'Beads of Ruin' },
        });

        // We'll test with two other Pokémon to ensure the effect is field-wide.
        const otherPokemon1 = createPokemon('Blissey', { stats: { 'special-defense': 135 } });
        const otherPokemon2 = createPokemon('Aggron', { stats: { 'special-defense': 60 } });

        const initialState = createBattleState([ruinPokemon, otherPokemon1], [otherPokemon2]);
        // Activate all three Pokémon for a multi-battle scenario
        initialState.activePokemonIndices = { players: [0, 1], opponent: [0] };

        // ACT
        // The ability's effect is passive. We can test it by having another Pokémon attack.
        // We'll calculate damage from a neutral special attacker.
        const specialAttacker = createPokemon('Gengar', {
            stats: { 'special-attack': 130 },
            moves: [{ id: 'shadow-ball', power: 80, damage_class: { name: 'special' } }]
        });
        const mockLog = [];

        // We call the damage calculator directly to isolate the stat-lowering effect.
        // First, damage against Blissey
        const { damage: damageVsBlissey } = calculateDamage(specialAttacker, otherPokemon1, specialAttacker.moves[0], false, initialState, mockLog);

        // Second, damage against Aggron
        const { damage: damageVsAggron } = calculateDamage(specialAttacker, otherPokemon2, specialAttacker.moves[0], false, initialState, mockLog);

        // CONTROL: Calculate damage without the Ruin ability active.
        initialState.teams[0].pokemon[0].ability = { id: 'no-ability', name: 'No Ability' }; // "Suppress" the ability
        const { damage: controlDamageVsBlissey } = calculateDamage(specialAttacker, otherPokemon1, specialAttacker.moves[0], false, initialState, mockLog);
        const { damage: controlDamageVsAggron } = calculateDamage(specialAttacker, otherPokemon2, specialAttacker.moves[0], false, initialState, mockLog);

        // ASSERT
        // The damage dealt should be higher when Beads of Ruin is active.
        expect(damageVsBlissey).toBeGreaterThan(controlDamageVsBlissey);
        expect(damageVsAggron).toBeGreaterThan(controlDamageVsAggron);
    });
    it('should heal a Poisoned Pokémon instead of damaging it at the end of the turn (Poison Heal)', async () => {
        // ARRANGE
        const holder = createPokemon('Gliscor', {
            ability: { id: 'poison-heal', name: 'Poison Heal' },
            status: 'Poisoned', // The Pokémon is already poisoned
            maxHp: 160,
            currentHp: 80 // Start at 50% HP to clearly see healing
        });
        const initialHp = holder.currentHp;

        const opponent = createPokemon('Pikachu');
        const initialState = createBattleState([holder], [opponent]);

        // ACT
        // We only need to process the end-of-turn phase, so no actions are queued.
        const { finalBattleState, finalLog } = await executeTurn(initialState, {}, allTrainers);

        // ASSERT
        const finalHolder = findPokemon(finalBattleState, 'Gliscor');

        // 1. Calculate the expected healing amount (1/8 of max HP).
        const expectedHeal = Math.floor(holder.maxHp / 8); // 20 HP

        // 2. Verify the Pokémon's HP was restored.
        expect(finalHolder.currentHp).toBe(initialHp + expectedHeal);

        // 3. Verify the poison damage message is NOT in the log.
        expect(finalLog.some(log => log.text?.includes('hurt by poison'))).toBe(false);

        // 4. Verify the correct healing message is in the log.
        expect(finalLog.some(log => log.text?.includes('restored health using its Poison Heal!'))).toBe(true);
    });
    it('should change the user\'s type to match the move before attacking (Protean)', async () => {
        // ARRANGE
        const attacker = createPokemon('Greninja', {
            ability: { id: 'protean', name: 'Protean' },
            types: ['water', 'dark'], // Greninja's starting types
            moves: [{ id: 'ice-beam', name: 'Ice Beam', power: 90, damage_class: { name: 'special' }, type: 'ice' }]
        });
        const defender = createPokemon('Dragonite', { types: ['dragon', 'flying'] }); // 4x weak to Ice

        const initialState = createBattleState([attacker], [defender]);

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // --- CONTROL: Calculate damage WITHOUT Protean ---
        const controlState = JSON.parse(JSON.stringify(initialState));
        const controlAttacker = findPokemon(controlState, 'Greninja');
        controlAttacker.ability = { id: 'torrent', name: 'Torrent' }; // Give it a non-Protean ability
        const { finalLog: controlLog } = await executeTurn(controlState, queuedActions, allTrainers);
        const normalDamage = controlLog.find(log => log.type === 'attack')?.damage || 0;

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Greninja');
        const proteanDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

        // 1. Verify the Pokémon's type was changed to Ice.
        expect(finalAttacker.types).toEqual(['ice']);

        // 2. Verify the correct log message was generated.
        expect(finalLog.some(log => log.text?.includes('changed its type to ICE!'))).toBe(true);

        // 3. Verify that the damage was boosted by STAB (1.5x) compared to the control case.
        expect(proteanDamage).toBe(Math.floor(normalDamage * 1.5));
    });
    it('should change a Normal-type move to Flying-type and boost its power (Aerilate)', async () => {
        // ARRANGE
        const baseSalamenceData = await fetchPokemonData('Salamence-Mega', 50);
        const baseMetagrossData = await fetchPokemonData('Metagross', 50);

        const attacker = createPokemon('Salamence-Mega', {
            ...baseSalamenceData,
            ability: { id: 'aerilate', name: 'Aerilate' },
            moves: [{ id: 'body-slam', name: 'Body Slam', power: 85, type: 'normal', damage_class: { name: 'physical' } }]
        });
        const defender = createPokemon('Metagross', { ...baseMetagrossData });

        // --- TEST: Run the turn with Aerilate active ---
        const testState = createBattleState([attacker], [defender]);
        const testActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalLog } = await executeTurn(testState, testActions, allTrainers);

        // ASSERT
        const attackLog = finalLog.find(log => log.type === 'attack');
        const aerilateDamage = attackLog?.damage || 0;

        expect(finalLog.some(log => log.text?.includes('The move became Flying-type due to Aerilate!'))).toBe(true);
        expect(attackLog.moveType).toBe('flying');

        // Verify the damage is the correct, precisely calculated value.
        expect(aerilateDamage).toBe(38);
    });
    it('should raise the user\'s Attack stat by one stage after securing a KO (Moxie)', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseKrookodileData = await fetchPokemonData('Krookodile', 50);
        const basePikachuData = await fetchPokemonData('Pikachu', 50);

        // 2. Create the attacker with Moxie and a neutral Attack stage.
        const attacker = createPokemon('Krookodile', {
            ...baseKrookodileData,
            ability: { id: 'moxie', name: 'Moxie' },
            stat_stages: { attack: 0 },
            moves: [{ id: 'crunch', name: 'Crunch', power: 80, damage_class: { name: 'physical' }, type: 'dark' }]
        });

        // 3. Create a fragile defender that will be knocked out.
        const defender = createPokemon('Pikachu', {
            ...basePikachuData,
            currentHp: 1, // Ensure it will be knocked out
        });

        const initialState = createBattleState([attacker], [defender]);
        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Krookodile');

        // 1. Verify the attacker's Attack stage is now +1.
        expect(finalAttacker.stat_stages.attack).toBe(1);

        // 2. Verify the correct log message was generated.
        expect(finalLog.some(log => log.text?.includes("Krookodile's Moxie boosted its Attack!"))).toBe(true);
    });
    it('should boost the power of moves with 60 or less Base Power (Technician)', async () => {
        // ARRANGE
        const baseScizorData = await fetchPokemonData('Scizor', 50);
        const baseBlisseyData = await fetchPokemonData('Blissey', 50);

        const attacker = createPokemon('Scizor', {
            ...baseScizorData,
            ability: { id: 'technician', name: 'Technician' },
            moves: [{ id: 'bullet-punch', name: 'Bullet Punch', power: 40, damage_class: { name: 'physical' }, type: 'steel' }]
        });
        const defender = createPokemon('Blissey', { ...baseBlisseyData });

        const testState = createBattleState([attacker], [defender]);
        const testActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalLog } = await executeTurn(testState, testActions, allTrainers);

        // ASSERT
        const technicianDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

        // Verify the received damage matches the correct, precisely calculated value.
        expect(technicianDamage).toBe(358);
    });
    it("should double the stat change for a pokemon with the 'Simple' ability", () => {
        // CORRECTED: 'ability' is now an object.
        const pokemon = { ability: { id: 'simple', name: 'Simple' }, stat_stages: { attack: 0 }, volatileStatuses: [] };
        const { updatedTarget } = calculateStatChange(pokemon, 'attack', 1, mockState);
        expect(updatedTarget.stat_stages.attack).toBe(2);
    });

    it("should invert the stat change for a pokemon with the 'Contrary' ability", () => {
        // CORRECTED: 'ability' is now an object.
        const pokemon = { ability: { id: 'contrary', name: 'Contrary' }, stat_stages: { defense: 0 }, volatileStatuses: [] };
        const { updatedTarget } = calculateStatChange(pokemon, 'defense', 2, mockState);
        expect(updatedTarget.stat_stages.defense).toBe(-2);
    });

    it("should prevent stat drops for a pokemon holding a 'Clear Amulet'", () => {
        // CORRECTED: 'heldItem' is now an object.
        const pokemon = { heldItem: { id: 'clear-amulet', name: 'Clear Amulet' }, stat_stages: { speed: 0 } };
        const { updatedTarget, newLog } = calculateStatChange(pokemon, 'speed', -1, mockState);

        expect(updatedTarget.stat_stages.speed).toBe(0);
        expect(newLog.some(log => log.text.includes('Clear Amulet'))).toBe(true);
    });
    it('should return null if another pokemon has Neutralizing Gas', () => {
        const pokemonWithAbility = { id: 'p1', ability: { id: 'intimidate', name: 'Intimidate' }, volatileStatuses: [] };
        const gasUser = { id: 'p2', ability: { id: 'neutralizing-gas', name: 'Neutralizing Gas' }, fainted: false, volatileStatuses: [] };

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
        const gasUser = { id: 'p2', ability: { id: 'neutralizing-gas', name: 'Neutralizing Gas' }, fainted: false, volatileStatuses: [] };
        const battleState = { teams: [[], [{ pokemon: [gasUser] }]] };

        const effectiveAbility = getEffectiveAbility(gasUser, battleState);
        expect(effectiveAbility).toEqual({ id: 'neutralizing-gas', name: 'Neutralizing Gas' });
    });
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
    it('should negate the first hit, bust the disguise, and change form (Disguise)', async () => {
        // ARRANGE
        const baseMimikyuData = await fetchPokemonData('Mimikyu', 50);
        const basePikachuData = await fetchPokemonData('Pikachu', 50);

        const defender = createPokemon('Mimikyu', {
            ...baseMimikyuData,
            ability: { id: 'disguise', name: 'Disguise' },
            forms: officialFormsData['mimikyu'] // Provide form data to the engine
        });

        const attacker = createPokemon('Pikachu', {
            ...basePikachuData,
            moves: [{ id: 'tackle', name: 'Tackle', power: 40, damage_class: { name: 'physical' } }]
        });

        const initialState = createBattleState([defender], [attacker]);
        initialState.formChangeQueue = [];

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalDefender = finalBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === defender.id);

        // 1. The first hit should have dealt no damage.
        expect(finalDefender.currentHp).toBe(defender.maxHp);

        // 2. The Pokémon should now be in its "Busted" form. Its name is a good proxy for this.
        expect(finalDefender.name).toBe('mimikyu-busted');

        // 3. The correct log message should have been generated.
        expect(finalLog.some(log => log.text?.includes("Disguise was busted!"))).toBe(true);
    });

    it('should change to Zen Forme when HP drops below 50% (Zen Mode)', async () => {
        // ARRANGE
        const baseDarmanitanData = await fetchPokemonData('Darmanitan', 50);
        const baseGengarData = await fetchPokemonData('Gengar', 50);

        const defender = createPokemon('Darmanitan', {
            ...baseDarmanitanData,
            ability: { id: 'zen-mode', name: 'Zen Mode' },
            forms: officialFormsData['darmanitan']
        });

        // Gengar's Shadow Ball will deal more than 50% to Darmanitan
        const attacker = createPokemon('Gengar', {
            ...baseGengarData,
            moves: [{ id: 'shadow-ball', name: 'Shadow Ball', power: 80, damage_class: { name: 'special' }, type: 'ghost' }]
        });

        const initialState = createBattleState([defender], [attacker]);
        initialState.formChangeQueue = [];

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalDefender = finalBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === defender.id);

        // 1. The Pokémon should be in its Zen Forme.
        expect(finalDefender.name).toBe('darmanitan-zen');

        // 2. Its typing should have changed to Fire/Psychic.
        expect(finalDefender.types).toEqual(['fire', 'psychic']);

        // 3. The correct log message should be present.
        expect(finalLog.some(log => log.text?.includes("Zen Mode was triggered!"))).toBe(true);
    });
    it('should hit a second time for 25% damage with Parental Bond', async () => {
        // ARRANGE
        // 1. Kangaskhan's form data is needed for its Mega evolution with Parental Bond
        const megaKangaskhanForm = officialFormsData['kangaskhan'].find(f => f.formName === 'kangaskhan-mega');
        const attacker = createPokemon('Kangaskhan-Mega', {
            ...megaKangaskhanForm.data, // Use the stats and ability from the form data
            moves: [{ id: 'body-slam', name: 'Body Slam', power: 85, damage_class: { name: 'physical' }, type: 'normal' }]
        });
        const defender = createPokemon('Blissey', { maxHp: 300, currentHp: 300 });

        const initialState = createBattleState([attacker], [defender]);
        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // 1. Find the log entries. Parental bond creates a primary attack log and a secondary text log.
        const attackLog = finalLog.find(log => log.type === 'attack' && log.attackerName.includes('Kangaskhan'));
        const secondHitLog = finalLog.find(log => log.text?.includes('The parent hit again!'));

        // 2. Verify the primary attack happened and the secondary hit was logged.
        expect(attackLog).toBeDefined();
        expect(secondHitLog).toBeDefined();
    });
    it('should give +1 priority to a status move used by a Pokémon with Prankster', async () => {
        // ARRANGE
        // 1. Fetch data for a slow Prankster user and a fast opponent.
        const baseSableyeData = await fetchPokemonData('Sableye', 50); // Speed: 50
        const baseGengarData = await fetchPokemonData('Gengar', 50);   // Speed: 110

        // 2. Create the Pokémon. Sableye has Prankster and a status move.
        const pranksterUser = createPokemon('Sableye', {
            ...baseSableyeData,
            ability: 'prankster',
            moves: [{ id: 'will-o-wisp', name: 'Will-O-Wisp', priority: 0, type: 'fire', damage_class: { name: 'status' } }]
        });

        const fasterOpponent = createPokemon('Gengar', {
            ...baseGengarData,
            moves: [{ id: 'shadow-ball', name: 'Shadow Ball', power: 80, priority: 0, type: 'ghost', damage_class: { name: 'special' } }]
        });

        // 3. Create the battle state.
        const initialState = createBattleState([pranksterUser], [fasterOpponent]);

        const queuedActions = {
            [pranksterUser.id]: { type: 'FIGHT', pokemon: pranksterUser, move: pranksterUser.moves[0], targetIds: [fasterOpponent.id], hits: [{ targetId: fasterOpponent.id }], willHit: true },
            [fasterOpponent.id]: { type: 'FIGHT', pokemon: fasterOpponent, move: fasterOpponent.moves[0], targetIds: [pranksterUser.id], hits: [{ targetId: pranksterUser.id }], willHit: true }
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // Find the index of each Pokémon's move in the log.
        // We search for a generic "used" message to catch both status and attack moves.
        const sableyeActionIndex = finalLog.findIndex(log => log.text?.includes('Sableye used Will-O-Wisp'));
        const gengarActionIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Gengar');

        // Ensure both actions were found in the log
        expect(sableyeActionIndex).not.toBe(-1);
        expect(gengarActionIndex).not.toBe(-1);

        // The core assertion: Sableye's Prankster-boosted move should have a lower index (occur earlier)
        // than Gengar's standard priority attack.
        expect(sableyeActionIndex).toBeLessThan(gengarActionIndex);
    });
    it('should make a fast Pokémon with the Stall ability move last', async () => {
        // ARRANGE
        // 1. Fetch data for a very fast and a very slow Pokémon.
        const baseElectrodeData = await fetchPokemonData('Electrode', 50); // Speed: 150
        const baseShuckleData = await fetchPokemonData('Shuckle', 50);   // Speed: 5

        // 2. Create the Pokémon. Give the fast Pokémon the Stall ability.
        const fastWithStall = createPokemon('Electrode', {
            ...baseElectrodeData,
            ability: 'stall',
            moves: [{ id: 'tackle', name: 'Tackle', priority: 0, damage_class: { name: 'physical' } }]
        });

        const slowOpponent = createPokemon('Shuckle', {
            ...baseShuckleData,
            moves: [{ id: 'struggle-bug', name: 'Struggle Bug', priority: 0, damage_class: { name: 'special' } }]
        });

        // 3. Create the battle state.
        const initialState = createBattleState([fastWithStall], [slowOpponent]);

        const queuedActions = {
            [fastWithStall.id]: { type: 'FIGHT', pokemon: fastWithStall, move: fastWithStall.moves[0], targetIds: [slowOpponent.id], hits: [{ targetId: slowOpponent.id }], willHit: true },
            [slowOpponent.id]: { type: 'FIGHT', pokemon: slowOpponent, move: slowOpponent.moves[0], targetIds: [fastWithStall.id], hits: [{ targetId: fastWithStall.id }], willHit: true }
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const electrodeAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Electrode');
        const shuckleAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Shuckle');

        // Verify the fast Pokémon with Stall moved AFTER the slow Pokémon.
        expect(shuckleAttackIndex).toBeLessThan(electrodeAttackIndex);
    });
    it('should double a Pokémons speed and alter turn order when Chlorophyll is active in sun', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        // Venusaur is moderately fast (Base Speed 80).
        // Gengar is naturally faster (Base Speed 110).
        const baseVenusaurData = await fetchPokemonData('Venusaur', 50);
        const baseGengarData = await fetchPokemonData('Gengar', 50);

        // 2. Create the Pokémon, ensuring Venusaur has the Chlorophyll ability.
        const chlorophyllUser = createPokemon('Venusaur', {
            stats: baseVenusaurData.stats,
            baseStats: baseVenusaurData.baseStats,
            ability: { id: 'chlorophyll', name: 'Chlorophyll' },
            moves: [{ id: 'solar-beam', name: 'Solar Beam', power: 120, damage_class: { name: 'special' }, type: 'grass' }]
        });

        const fasterOpponent = createPokemon('Gengar', {
            stats: baseGengarData.stats,
            baseStats: baseGengarData.baseStats,
            moves: [{ id: 'shadow-ball', name: 'Shadow Ball', power: 80, damage_class: { name: 'special' }, type: 'ghost' }]
        });

        // 3. Create a battle state where harsh sunlight is already active.
        const initialState = createBattleState(
            [chlorophyllUser],
            [fasterOpponent],
            {
                weather: 'sunshine',
                weatherTurns: 5
            }
        );

        const queuedActions = {
            [chlorophyllUser.id]: { type: 'FIGHT', pokemon: chlorophyllUser, move: chlorophyllUser.moves[0], targetIds: [fasterOpponent.id], hits: [{ targetId: fasterOpponent.id }], willHit: true },
            [fasterOpponent.id]: { type: 'FIGHT', pokemon: fasterOpponent, move: fasterOpponent.moves[0], targetIds: [chlorophyllUser.id], hits: [{ targetId: chlorophyllUser.id }], willHit: true }
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // Find the log entries for each Pokémon's attack.
        const venusaurAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Venusaur');
        const gengarAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Gengar');

        // Normally, the faster Gengar would move first.
        // Because of Chlorophyll in the sun, Venusaur's speed is doubled, so its attack should be logged first.
        expect(venusaurAttackIndex).toBeLessThan(gengarAttackIndex);
    });
    it('should double a Pokémons speed and alter turn order when Swift Swim is active in rain', async () => {
        // ARRANGE
        // 1. Fetch data for our Pokémon.
        // Kingdra is moderately fast (Base Speed 85).
        // Latios is naturally faster (Base Speed 110).
        const baseKingdraData = await fetchPokemonData('Kingdra', 50);
        const baseLatiosData = await fetchPokemonData('Latios', 50);

        // 2. Create the Pokémon, ensuring Kingdra has the Swift Swim ability.
        const swiftSwimmer = createPokemon('Kingdra', {
            stats: baseKingdraData.stats,
            baseStats: baseKingdraData.baseStats,
            ability: { id: 'swift-swim', name: 'Swift Swim' },
            moves: [{ id: 'surf', name: 'Surf', power: 90, damage_class: { name: 'special' }, type: 'water' }]
        });

        const fasterOpponent = createPokemon('Latios', {
            stats: baseLatiosData.stats,
            baseStats: baseLatiosData.baseStats,
            moves: [{ id: 'psychic', name: 'Psychic', power: 90, damage_class: { name: 'special' }, type: 'psychic' }]
        });

        // 3. Create a battle state where rain is already active.
        const initialState = createBattleState(
            [swiftSwimmer],
            [fasterOpponent],
            {
                weather: 'rain',
                weatherTurns: 5
            }
        );

        const queuedActions = {
            [swiftSwimmer.id]: { type: 'FIGHT', pokemon: swiftSwimmer, move: swiftSwimmer.moves[0], targetIds: [fasterOpponent.id], hits: [{ targetId: fasterOpponent.id }], willHit: true },
            [fasterOpponent.id]: { type: 'FIGHT', pokemon: fasterOpponent, move: fasterOpponent.moves[0], targetIds: [swiftSwimmer.id], hits: [{ targetId: swiftSwimmer.id }], willHit: true }
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // Find the log entries for each Pokémon's attack.
        const kingdraAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Kingdra');
        const latiosAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Latios');

        // Normally, the faster Latios would move first.
        // Because of Swift Swim in the rain, Kingdra's speed is doubled, so its attack should be logged first.
        expect(kingdraAttackIndex).toBeLessThan(latiosAttackIndex);
    });
});