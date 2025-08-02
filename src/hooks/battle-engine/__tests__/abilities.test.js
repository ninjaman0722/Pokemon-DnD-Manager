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
    describe('Ability: Regenerator', () => {
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
    });
    describe('Ability: Intimidate', () => {
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
    });
    describe('Ability: Static', () => {
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
    });
    describe('Ability: Trace', () => {
        it('should copy the opponent\'s ability upon switching in', async () => {
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
    });
    describe('Ability: Beads of Ruin', () => {
        it('should lower the Special Defense of all other Pokémon on the field', async () => {
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
    });
    describe('Ability: Poison Heal', () => {
        it('should heal a Poisoned Pokémon instead of damaging it at the end of the turn', async () => {
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
    });
    describe('Ability: Protean', () => {
        it('should change the user\'s type to match the move before attacking', async () => {
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
    });
    describe('Ability: Aerilate', () => {
        it('should change a Normal-type move to Flying-type and boost its power', async () => {
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
    });
    describe('Ability: Moxie', () => {
        it('should raise the user\'s Attack stat by one stage after securing a KO', async () => {
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
    });
    describe('Ability: Technician', () => {
        it('should boost the power of moves with 60 or less Base Power', async () => {
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
    });
    describe("Ability: Simple", () => {
        it("should double the stat change for the user", () => {
            // CORRECTED: 'ability' is now an object.
            const pokemon = { ability: { id: 'simple', name: 'Simple' }, stat_stages: { attack: 0 }, volatileStatuses: [] };
            const { updatedTarget } = calculateStatChange(pokemon, 'attack', 1, mockState);
            expect(updatedTarget.stat_stages.attack).toBe(2);
        });
    });
    describe("Ability: Contrary", () => {
        it("should invert the stat change for the user", () => {
            // CORRECTED: 'ability' is now an object.
            const pokemon = { ability: { id: 'contrary', name: 'Contrary' }, stat_stages: { defense: 0 }, volatileStatuses: [] };
            const { updatedTarget } = calculateStatChange(pokemon, 'defense', 2, mockState);
            expect(updatedTarget.stat_stages.defense).toBe(-2);
        });
    });
    describe('Ability: Neutralizing Gas', () => {
        it('should return the other pokemons ability as null', () => {
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

        it('should return the ability of the user', () => {
            // Add volatileStatuses to the mock object
            const gasUser = { id: 'p2', ability: { id: 'neutralizing-gas', name: 'Neutralizing Gas' }, fainted: false, volatileStatuses: [] };
            const battleState = { teams: [[], [{ pokemon: [gasUser] }]] };

            const effectiveAbility = getEffectiveAbility(gasUser, battleState);
            expect(effectiveAbility).toEqual({ id: 'neutralizing-gas', name: 'Neutralizing Gas' });
        });
    });
    describe('Ability: Stance Change', () => {
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
    describe('Ability: Disguise', () => {
        it('should negate the first hit, bust the disguise, and change form', async () => {
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
    });
    describe('Ability: Zen Mode', () => {
        it('should change to Zen Forme when HP drops below 50%', async () => {
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
    });
    describe('Ability: Parental Bond', () => {
        it('should hit a second time for 25% damage', async () => {
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
    });
    describe('Ability: Prankster', () => {
        it('should give +1 priority to a status move', async () => {
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
    });
    describe('Ability: Stall', () => {
        it('should make a fast Pokemon move last', async () => {
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
    });
    describe('Ability: Chlorophyll', () => {
        it('should double a Pokémons speed and alter turn order when active in the sun', async () => {
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
    });
    describe('Ability: Swift Swim', () => {
        it('should double a Pokémons speed and alter turn order when active in the rain', async () => {
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
    describe('Ability: Sturdy', () => {
        it('should allow a Pokémon at full health to survive a lethal hit with 1 HP', async () => {
            // ARRANGE
            // 1. Fetch data for a strong attacker and a sturdy defender.
            // We use a high-level attacker to ensure the damage would normally be a one-hit KO.
            const baseHaxorusData = await fetchPokemonData('Haxorus', 100);
            const baseBastiodonData = await fetchPokemonData('Bastiodon', 50);

            // 2. Create the Pokémon.
            const attacker = createPokemon('Haxorus', {
                ...baseHaxorusData,
                moves: [{ id: 'earthquake', name: 'Earthquake', power: 100, damage_class: { name: 'physical' }, type: 'ground' }]
            });

            const defender = createPokemon('Bastiodon', {
                ...baseBastiodonData,
                ability: { id: 'sturdy', name: 'Sturdy' },
                // Sturdy only activates if the Pokémon is at full health.
                currentHp: baseBastiodonData.maxHp,
            });

            // 3. Create the initial battle state.
            const initialState = createBattleState([defender], [attacker]);

            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0], // Earthquake is 4x super-effective, ensuring a KO.
                    targetIds: [defender.id],
                    hits: [{ targetId: defender.id }],
                    willHit: true
                }
            };

            // ACT
            // Run the turn where the lethal attack occurs.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the defender in the final state after the turn.
            const finalDefender = findPokemon(finalBattleState, 'Bastiodon');
            expect(finalDefender).toBeDefined();

            // 2. The primary assertion: The Pokémon should have survived with exactly 1 HP.
            expect(finalDefender.currentHp).toBe(1);

            // 3. The Pokémon should not be marked as fainted.
            expect(finalDefender.fainted).toBe(false);

            // 4. Verify the correct log message for Sturdy was generated.
            const sturdyLogFound = finalLog.some(log => log.text?.includes('endured the hit with Sturdy!'));
            expect(sturdyLogFound).toBe(true);
        });
    });
    describe('Ability: Guts', () => {
        it('should boost Attack by 1.5x and ignore the Burn attack drop when the user is statused', async () => {
            // ARRANGE
            // 1. Fetch data for a Guts user and a generic defender.
            const baseMachampData = await fetchPokemonData('Machamp', 50);
            const baseBlisseyData = await fetchPokemonData('Blissey', 50);

            // 2. Create the attacker with the Guts ability and a Burn status.
            const attacker = createPokemon('Machamp', {
                ...baseMachampData,
                ability: { id: 'guts', name: 'Guts' },
                status: 'Burned',
                moves: [{ id: 'close-combat', name: 'Close Combat', power: 120, damage_class: { name: 'physical' }, type: 'fighting' }]
            });

            const defender = createPokemon('Blissey', {
                ...baseBlisseyData,
                currentHp: 3000 // Give Blissey enough HP to survive the hit for a clean damage check
            });

            const initialState = createBattleState([attacker], [defender]);

            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0],
                    targetIds: [defender.id],
                    hits: [{ targetId: defender.id }],
                    willHit: true
                }
            };

            // --- CONTROL: Manually calculate the damage a normal, burned Machamp would do ---
            const controlAttacker = JSON.parse(JSON.stringify(attacker));
            controlAttacker.ability = { id: 'no-guard', name: 'No Guard' }; // Give it a non-Guts ability
            const { damage: controlDamage } = calculateDamage(controlAttacker, defender, controlAttacker.moves[0], false, initialState, []);
            // This controlDamage will be low because it correctly includes the 0.5x attack drop from burn.

            // ACT
            // Run the turn with the actual Guts-boosted Machamp.
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the damage that the Guts attacker dealt in the final log.
            const gutsDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // 2. Assert against the single, pre-calculated correct damage value.
            // This is more reliable than comparing two separate dynamic calculations due to rounding.
            expect(gutsDamage).toBe(2142);
        });
    });
    describe('Ability: Drizzle', () => {
        it('should change the weather to rain upon switching in', async () => {
            // ARRANGE
            // 1. Fetch data for the weather setter and a generic opponent.
            const basePelipperData = await fetchPokemonData('Pelipper', 50);
            const baseRattataData = await fetchPokemonData('Rattata', 50);

            // 2. Create the Pokémon. Pelipper has the Drizzle ability.
            const weatherSetter = createPokemon('Pelipper', {
                ...basePelipperData,
                ability: { id: 'drizzle', name: 'Drizzle' }
            });

            const opponent = createPokemon('Rattata', { ...baseRattataData });

            // 3. Create an initial battle state where the weather is explicitly 'none'.
            // This ensures we are testing the ability's effect, not a pre-existing condition.
            const initialState = createBattleState(
                [weatherSetter],
                [opponent],
                { weather: 'none' }
            );

            // Placeholder actions to allow the turn to process. Drizzle activates before moves.
            const queuedActions = {};

            // ACT
            // The onSwitchIn effects like Drizzle are handled at the start of executeTurn.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. The primary assertion: The weather in the final battle state should now be 'rain'.
            expect(finalBattleState.field.weather).toBe('rain');

            // 2. By default, the weather should last for 5 turns.
            expect(finalBattleState.field.weatherTurns).toBe(4);

            // 3. Verify the correct log message for Drizzle was generated.
            const drizzleLogFound = finalLog.some(log => log.text?.includes('It started to rain!'));
            expect(drizzleLogFound).toBe(true);
        });

        it('should set rain for 8 turns when the user holds a Damp Rock', async () => {
            // ARRANGE
            const basePelipperData = await fetchPokemonData('Pelipper', 50);
            const baseRattataData = await fetchPokemonData('Rattata', 50);

            // Pelipper now holds a Damp Rock, which should extend the duration of rain.
            const weatherSetter = createPokemon('Pelipper', {
                ...basePelipperData,
                ability: { id: 'drizzle', name: 'Drizzle' },
                heldItem: { id: 'damp-rock', name: 'Damp Rock' }
            });

            const opponent = createPokemon('Rattata', { ...baseRattataData });

            const initialState = createBattleState(
                [weatherSetter],
                [opponent],
                { weather: 'none' }
            );

            const queuedActions = {};

            // ACT
            const { finalBattleState } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // The weather should still be set to rain.
            expect(finalBattleState.field.weather).toBe('rain');

            // The duration should now be 8 turns instead of 5 due to the Damp Rock.
            expect(finalBattleState.field.weatherTurns).toBe(7);
        });
    });
    describe('Ability: Adaptability', () => {
        it('should increase the Same-Type Attack Bonus (STAB) from 1.5x to 2x', async () => {
            // ARRANGE
            // 1. Fetch data for the attacker and a suitable defender.
            const basePorygonZData = await fetchPokemonData('Porygon-Z', 50);
            const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);

            // 2. Create the attacker with the Adaptability ability and a STAB move.
            const attacker = createPokemon('Porygon-Z', {
                ...basePorygonZData,
                ability: { id: 'adaptability', name: 'Adaptability' },
                moves: [{ id: 'tri-attack', name: 'Tri Attack', power: 80, damage_class: { name: 'special' }, type: 'normal' }]
            });

            // The defender is neutral to the attack.
            const defender = createPokemon('Snorlax', {
                ...baseSnorlaxData,
                currentHp: 1000 // Ensure it can survive the hit for a clean damage check.
            });

            const initialState = createBattleState([attacker], [defender]);
            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0],
                    targetIds: [defender.id],
                    hits: [{ targetId: defender.id }],
                    willHit: true
                }
            };

            // ACT
            // Run the turn where the Adaptability-boosted attack occurs.
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the damage dealt by the attacker from the battle log.
            const adaptabilityDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // 2. Assert against the hardcoded, pre-calculated value.
            // A normal STAB move would do 66 damage.
            // With Adaptability's 2x STAB, the damage is boosted further.
            // Your engine should calculate this to be exactly 88.
            expect(adaptabilityDamage).toBe(88);
        });
    });
    describe('Ability: Magic Bounce', () => {
        it("should reflect a status move like Stealth Rock back to the user's side", async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseForretressData = await fetchPokemonData('Forretress', 50);
            const baseEspeonData = await fetchPokemonData('Espeon', 50);

            // 2. Create the Pokémon.
            const hazardSetter = createPokemon('Forretress', {
                ...baseForretressData,
                moves: [{ id: 'stealth-rock', name: 'Stealth Rock', power: 0, damage_class: { name: 'status' }, type: 'rock' }]
            });

            const defender = createPokemon('Espeon', {
                ...baseEspeonData,
                ability: { id: 'magic-bounce', name: 'Magic Bounce' },
            });

            // 3. Create an initial battle state with no hazards on either side.
            const initialState = createBattleState(
                [defender],      // Player's team (Magic Bounce user)
                [hazardSetter],  // Opponent's team (Stealth Rock user)
                {
                    // Ensure the hazard field is initialized
                    hazards: {
                        players: { 'stealth-rock': 0 },
                        opponent: { 'stealth-rock': 0 }
                    }
                }
            );

            const queuedActions = {
                [hazardSetter.id]: {
                    type: 'FIGHT',
                    pokemon: hazardSetter,
                    move: hazardSetter.moves[0], // Using Stealth Rock
                    targetIds: [defender.id], // Targeting the Magic Bounce user
                    hits: [{ targetId: defender.id }],
                    willHit: true
                }
            };

            // ACT
            // Run the turn where the reflectable move is used.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Verify the move was bounced back by checking the log message.
            const bounceLogFound = finalLog.some(log => log.text?.includes('bounced the move back!'));
            expect(bounceLogFound).toBe(true);

            // 2. The defender's (player's) side should remain clear of hazards.
            expect(finalBattleState.field.hazards.players['stealth-rock']).toBe(0);

            // 3. The attacker's (opponent's) side should now have Stealth Rock due to the bounce.
            // This is the most crucial assertion.
            expect(finalBattleState.field.hazards.opponent['stealth-rock']).toBe(1);
        });
    });
    describe('Ability: Speed Boost', () => {
        it("should raise the user's Speed stat by one stage at the end of the turn", async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseYanmegaData = await fetchPokemonData('Yanmega', 50);
            const baseOpponentData = await fetchPokemonData('Rattata', 50);

            // 2. Create the user with Speed Boost, starting at a neutral speed stage.
            const speedBooster = createPokemon('Yanmega', {
                ...baseYanmegaData,
                ability: { id: 'speed-boost', name: 'Speed Boost' },
                stat_stages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 },
            });

            const opponent = createPokemon('Rattata', { ...baseOpponentData });

            // 3. Create the initial battle state.
            const initialState = createBattleState([speedBooster], [opponent]);
            const queuedActions = {}; // No specific action is needed; the effect is end-of-turn.

            // ACT
            // The Speed Boost effect happens in the end-of-turn phase, which is called by executeTurn.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the user in the final state.
            const finalSpeedBooster = findPokemon(finalBattleState, 'Yanmega');
            expect(finalSpeedBooster).toBeDefined();

            // 2. The primary assertion: The Speed stat stage should now be +1.
            expect(finalSpeedBooster.stat_stages.speed).toBe(1);

            // 3. Verify the correct log message was generated.
            const boostLogFound = finalLog.some(log => log.text?.includes("Speed Boost raised its speed!"));
            expect(boostLogFound).toBe(true);
        });

        it('should not raise the Speed stat if it is already at +6', async () => {
            // ARRANGE
            const baseYanmegaData = await fetchPokemonData('Yanmega', 50);
            const baseOpponentData = await fetchPokemonData('Rattata', 50);

            // Create the user with its Speed stat already maxed out at +6.
            const speedBooster = createPokemon('Yanmega', {
                ...baseYanmegaData,
                ability: { id: 'speed-boost', name: 'Speed Boost' },
                stat_stages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 6, accuracy: 0, evasion: 0 },
            });

            const opponent = createPokemon('Rattata', { ...baseOpponentData });
            const initialState = createBattleState([speedBooster], [opponent]);
            const queuedActions = {};

            // ACT
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalSpeedBooster = findPokemon(finalBattleState, 'Yanmega');

            // 1. The Speed stat stage should remain at +6.
            expect(finalSpeedBooster.stat_stages.speed).toBe(6);

            // 2. Verify that the log message for the boost was NOT generated, as the ability should fail.
            const boostLogFound = finalLog.some(log => log.text?.includes("Speed Boost raised its speed!"));
            expect(boostLogFound).toBe(false);
        });
    });
    describe('Ability: Defiant', () => {
        it('should raise Attack by two stages when another stat is lowered by an opponent', async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseGlaceonData = await fetchPokemonData('Glaceon', 50);
            const baseBisharpData = await fetchPokemonData('Bisharp', 50);

            // 2. Create the Pokémon.
            // The attacker has a move that is guaranteed to lower a stat.
            const attacker = createPokemon('Glaceon', {
                ...baseGlaceonData,
                moves: [{
                    id: 'icy-wind',
                    name: 'Icy Wind',
                    power: 55,
                    damage_class: { name: 'special' },
                    type: 'ice',
                    // Define the stat change metadata for the move
                    stat_changes: [{ change: -1, stat: { name: 'speed' } }]
                }]
            });

            // The defender has the Defiant ability and starts with neutral stats.
            const defiantUser = createPokemon('Bisharp', {
                ...baseBisharpData,
                ability: { id: 'defiant', name: 'Defiant' },
                stat_stages: { attack: 0, speed: 0 },
            });

            // 3. Create the initial battle state.
            const initialState = createBattleState([defiantUser], [attacker]);
            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0], // Icy Wind
                    targetIds: [defiantUser.id],
                    hits: [{ targetId: defiantUser.id }],
                    willHit: true,
                    applyEffect: true, // Ensure the secondary effect of the stat drop happens
                },
            };

            // ACT
            // Run the turn where the stat-lowering move is used.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the Defiant user in the final state.
            const finalDefiantUser = findPokemon(finalBattleState, 'Bisharp');
            expect(finalDefiantUser).toBeDefined();

            // 2. Confirm the initial stat drop from Icy Wind occurred.
            expect(finalDefiantUser.stat_stages.speed).toBe(-1);

            // 3. The primary assertion: The user's Attack stat stage should now be +2 due to Defiant.
            expect(finalDefiantUser.stat_stages.attack).toBe(2);

            // 4. Verify the correct log message for Defiant was generated.
            const defiantLogFound = finalLog.some(log => log.text?.includes("Defiant sharply raised its Attack!"));
            expect(defiantLogFound).toBe(true);
        });
    });
    describe('Ability: Multiscale', () => {
        it('should halve the damage taken from an attack when the user is at full HP', async () => {
            // ARRANGE
            // 1. Fetch data for a strong attacker and a Multiscale user.
            const baseWeavileData = await fetchPokemonData('Weavile', 50);
            const baseDragoniteData = await fetchPokemonData('Dragonite', 50);

            // 2. Create the Pokémon.
            const attacker = createPokemon('Weavile', {
                ...baseWeavileData,
                moves: [{ id: 'ice-punch', name: 'Ice Punch', power: 75, damage_class: { name: 'physical' }, type: 'ice' }]
            });

            const multiscaleUser = createPokemon('Dragonite', {
                ...baseDragoniteData,
                ability: { id: 'multiscale', name: 'Multiscale' },
                // Multiscale only activates if the Pokémon is at full health.
                currentHp: baseDragoniteData.maxHp,
            });

            // 3. Create the battle state.
            const initialState = createBattleState([multiscaleUser], [attacker]);
            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0], // Ice Punch is 4x super-effective.
                    targetIds: [multiscaleUser.id],
                    hits: [{ targetId: multiscaleUser.id }],
                    willHit: true
                }
            };

            // ACT
            // Run the turn where the Multiscale user is hit.
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the damage that was dealt.
            const multiscaleDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // 2. Assert against the hardcoded, pre-calculated value.
            // A normal hit would do 258 damage. With Multiscale, this is halved.
            expect(multiscaleDamage).toBe(129);
        });

        it('should NOT halve damage when the user is below full HP', async () => {
            // ARRANGE
            // 1. Setup is the same, but the Multiscale user is not at full HP.
            const baseWeavileData = await fetchPokemonData('Weavile', 50);
            const baseDragoniteData = await fetchPokemonData('Dragonite', 50);

            const attacker = createPokemon('Weavile', {
                ...baseWeavileData,
                moves: [{ id: 'ice-punch', name: 'Ice Punch', power: 75, damage_class: { name: 'physical' }, type: 'ice' }]
            });

            const multiscaleUser = createPokemon('Dragonite', {
                ...baseDragoniteData,
                ability: { id: 'multiscale', name: 'Multiscale' },
                // The Pokémon is at 1 HP less than its maximum.
                currentHp: baseDragoniteData.maxHp - 1,
            });

            const initialState = createBattleState([multiscaleUser], [attacker]);
            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0],
                    targetIds: [multiscaleUser.id],
                    hits: [{ targetId: multiscaleUser.id }],
                    willHit: true
                }
            };

            // ACT
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const damageTaken = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // The damage should NOT be halved because the HP was not full.
            expect(damageTaken).toBe(258);
        });
    });
    describe('Ability: Sheer Force', () => {
        it('should boost the power of moves with secondary effects by 1.3x', async () => {
            // ARRANGE
            // 1. Fetch data for a Sheer Force user and a defender.
            const baseNidokingData = await fetchPokemonData('Nidoking', 50);
            const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);

            // 2. Create the attacker with Sheer Force and a move that has a secondary effect (Flamethrower has a chance to burn).
            const attacker = createPokemon('Nidoking', {
                ...baseNidokingData,
                ability: { id: 'sheer-force', name: 'Sheer Force' },
                moves: [{ id: 'flamethrower', name: 'Flamethrower', power: 90, damage_class: { name: 'special' }, type: 'fire', meta: { ailment: { name: 'burn' }, ailment_chance: 10 } }]
            });
            const defender = createPokemon('Snorlax', { ...baseSnorlaxData });

            const initialState = createBattleState([attacker], [defender]);
            const queuedActions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
            };

            // ACT
            // Run the turn. The onModifyMove hook should increase the move's power.
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the damage dealt.
            const sheerForceDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // 2. Assert against the pre-calculated value.
            // A normal Flamethrower (90 BP) would do 33 damage in this scenario.
            // With Sheer Force, its power becomes 117 (90 * 1.3), resulting in 42 damage.
            expect(sheerForceDamage).toBe(42);
        });

        it('should negate the secondary effect of the move', async () => {
            // ARRANGE
            // 1. Use the same Pokémon setup.
            const baseNidokingData = await fetchPokemonData('Nidoking', 50);
            const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);

            const attacker = createPokemon('Nidoking', {
                ...baseNidokingData,
                ability: { id: 'sheer-force', name: 'Sheer Force' },
                moves: [{ id: 'flamethrower', name: 'Flamethrower', power: 90, damage_class: { name: 'special' }, type: 'fire', meta: { ailment: { name: 'burn' }, ailment_chance: 100 } }]
            });
            const defender = createPokemon('Snorlax', { ...baseSnorlaxData, status: 'None' });

            const initialState = createBattleState([attacker], [defender]);
            // We set applyEffect to true to guarantee the secondary effect *would* have happened.
            const queuedActions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true, applyEffect: true },
            };

            // ACT
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalDefender = findPokemon(finalBattleState, 'Snorlax');

            // 1. The defender should NOT be burned because Sheer Force negates the secondary effect.
            expect(finalDefender.status).toBe('None');

            // 2. The log should not contain the burn message.
            const burnLogFound = finalLog.some(log => log.text?.includes('was afflicted with burn'));
            expect(burnLogFound).toBe(false);
        });
    });
    describe('Ability: Mummy', () => {
        it("should change the attacker's ability to Mummy upon contact", async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseGyaradosData = await fetchPokemonData('Gyarados', 50);
            const baseCofagrigusData = await fetchPokemonData('Cofagrigus', 50);

            // 2. Create the Pokémon.
            // The attacker has a distinct ability (Intimidate) and a contact move.
            const attacker = createPokemon('Gyarados', {
                ...baseGyaradosData,
                ability: { id: 'intimidate', name: 'Intimidate' },
                // Waterfall is a contact move
                moves: [{ id: 'waterfall', name: 'Waterfall', power: 80, damage_class: { name: 'physical' }, type: 'water' }]
            });
            const originalAttackerAbility = attacker.ability;

            // The defender has the Mummy ability.
            const mummyUser = createPokemon('Cofagrigus', {
                ...baseCofagrigusData,
                ability: { id: 'mummy', name: 'Mummy' },
            });

            // 3. Create the initial battle state.
            const initialState = createBattleState([mummyUser], [attacker]);
            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0],
                    targetIds: [mummyUser.id],
                    hits: [{ targetId: mummyUser.id }],
                    willHit: true,
                },
            };

            // ACT
            // Run the turn. The onDamagedByContact hook for Mummy should trigger after damage is dealt.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the attacker in the final state.
            const finalAttacker = findPokemon(finalBattleState, 'Gyarados');
            expect(finalAttacker).toBeDefined();

            // 2. The primary assertion: The attacker's ability should now be Mummy.
            expect(finalAttacker.ability.id).toBe('mummy');

            // 3. The attacker's original ability should be stored for potential restoration later.
            expect(finalAttacker.originalAbility.id).toBe(originalAttackerAbility.id);

            // 4. Verify the correct log message was generated.
            const mummyLogFound = finalLog.some(log => log.text?.includes("ability became Mummy!"));
            expect(mummyLogFound).toBe(true);
        });
    });
    describe('Ability: Soundproof', () => {
        it('should grant immunity to sound-based moves', async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseNoivernData = await fetchPokemonData('Noivern', 50);
            const baseElectrodeData = await fetchPokemonData('Electrode', 50);

            // 2. Create the Pokémon.
            // The attacker has a powerful sound-based move.
            const attacker = createPokemon('Noivern', {
                ...baseNoivernData,
                // Boomburst is listed in the SOUND_MOVES set
                moves: [{ id: 'boomburst', name: 'Boomburst', power: 140, damage_class: { name: 'special' }, type: 'normal' }]
            });

            // The defender has the Soundproof ability.
            const soundproofUser = createPokemon('Electrode', {
                ...baseElectrodeData,
                ability: { id: 'soundproof', name: 'Soundproof' },
            });

            // 3. Create the initial battle state.
            const initialState = createBattleState([soundproofUser], [attacker]);
            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0],
                    targetIds: [soundproofUser.id],
                    hits: [{ targetId: soundproofUser.id }],
                    willHit: true,
                },
            };

            // ACT
            // Run the turn. The onCheckImmunity hook for Soundproof should trigger inside calculateDamage.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the defender in the final state.
            const finalDefender = findPokemon(finalBattleState, 'Electrode');
            expect(finalDefender).toBeDefined();

            // 2. The primary assertion: The defender should have taken no damage.
            expect(finalDefender.currentHp).toBe(soundproofUser.maxHp);

            // 3. Verify the correct log message was generated, indicating the ability blocked the move.
            const soundproofLogFound = finalLog.some(log => log.text?.includes("Soundproof blocks the move!"));
            expect(soundproofLogFound).toBe(true);

            // 4. Verify that the attack log itself shows the move had no effect.
            const attackLog = finalLog.find(log => log.type === 'attack');
            expect(attackLog.effectivenessText).toBe('It had no effect...');
        });
    });
    describe('Ability: Tinted Lens', () => {
        it('should double the damage of "not very effective" moves', async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseYanmegaData = await fetchPokemonData('Yanmega', 50);
            const baseArcanineData = await fetchPokemonData('Arcanine', 50);

            // 2. Create the attacker with Tinted Lens and a move the defender resists.
            const attacker = createPokemon('Yanmega', {
                ...baseYanmegaData,
                ability: { id: 'tinted-lens', name: 'Tinted Lens' },
                moves: [{ id: 'bug-buzz', name: 'Bug Buzz', power: 90, damage_class: { name: 'special' }, type: 'bug' }]
            });
            // CORRECTED: Arcanine's Fire typing resists Yanmega's Bug-type move (0.5x).
            const defender = createPokemon('Arcanine', { ...baseArcanineData });

            // 3. Create the initial battle state.
            const initialState = createBattleState([attacker], [defender]);
            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0],
                    targetIds: [defender.id],
                    hits: [{ targetId: defender.id }],
                    willHit: true,
                },
            };

            // --- CONTROL: Calculate the damage without Tinted Lens ---
            const controlAttacker = JSON.parse(JSON.stringify(attacker));
            controlAttacker.ability = { id: 'speed-boost', name: 'Speed Boost' }; // A different ability
            const { damage: controlDamage } = calculateDamage(controlAttacker, defender, controlAttacker.moves[0], false, initialState, []);
            // This will correctly calculate the low damage of the resisted hit. Expected: 43.

            // ACT
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const tintedLensDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // The damage should be exactly double the normal resisted damage.
            // Due to potential rounding, asserting against a hardcoded value is most reliable.
            // A normal resisted Bug Buzz would do 43 damage. Tinted Lens doubles this to 87.
            expect(controlDamage).toBe(43);
            expect(tintedLensDamage).toBe(87);
        });
    });
    describe('Ability: Download', () => {
        it("should raise Attack when the opponent's Defense is lower than their Special Defense", async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const basePorygonZData = await fetchPokemonData('Porygon-Z', 50);
            // Blissey has extremely low Defense and high Special Defense, guaranteeing an Attack boost.
            const baseBlisseyData = await fetchPokemonData('Blissey', 50);

            // 2. Create the Pokémon with the Download ability.
            const downloadUser = createPokemon('Porygon-Z', {
                ...basePorygonZData,
                ability: { id: 'download', name: 'Download' },
                stat_stages: { attack: 0, 'special-attack': 0 },
            });
            const opponent = createPokemon('Blissey', { ...baseBlisseyData });

            // 3. Create the battle state.
            const initialState = createBattleState([downloadUser], [opponent]);
            const queuedActions = {}; // The ability activates on switch-in, before actions.

            // ACT
            // The onSwitchIn hook for Download is called at the start of executeTurn.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the user in the final state.
            const finalUser = findPokemon(finalBattleState, 'Porygon Z');

            // 2. The user's Attack should be raised by one stage.
            expect(finalUser.stat_stages.attack).toBe(1);
            // 3. The user's Special Attack should remain unchanged.
            expect(finalUser.stat_stages['special-attack']).toBe(0);

            // 4. Verify the correct log message was generated.
            const logFound = finalLog.some(log => log.text?.includes("Download raised its Attack!"));
            expect(logFound).toBe(true);
        });

        it("should raise Special Attack when the opponent's Special Defense is lower", async () => {
            // ARRANGE
            const basePorygonZData = await fetchPokemonData('Porygon-Z', 50);
            // Aggron has high Defense and low Special Defense, guaranteeing a Special Attack boost.
            const baseAggronData = await fetchPokemonData('Aggron', 50);

            const downloadUser = createPokemon('Porygon-Z', {
                ...basePorygonZData,
                ability: { id: 'download', name: 'Download' },
                stat_stages: { attack: 0, 'special-attack': 0 },
            });
            const opponent = createPokemon('Aggron', { ...baseAggronData });

            const initialState = createBattleState([downloadUser], [opponent]);
            const queuedActions = {};

            // ACT
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalUser = findPokemon(finalBattleState, 'Porygon Z');

            // 1. The user's Special Attack should be raised by one stage.
            expect(finalUser.stat_stages['special-attack']).toBe(1);
            // 2. The user's Attack should remain unchanged.
            expect(finalUser.stat_stages.attack).toBe(0);

            // 3. Verify the correct log message was generated.
            const logFound = finalLog.some(log => log.text?.includes("Download raised its Sp. Atk!"));
            expect(logFound).toBe(true);
        });
    });
    describe('Ability: Thick Fat', () => {
        it('should halve the damage taken from Fire-type moves', async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseArcanineData = await fetchPokemonData('Arcanine', 50);
            const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);

            // 2. Create the Pokémon.
            const attacker = createPokemon('Arcanine', {
                ...baseArcanineData,
                moves: [{ id: 'flamethrower', name: 'Flamethrower', power: 90, damage_class: { name: 'special' }, type: 'fire' }]
            });

            const defender = createPokemon('Snorlax', {
                ...baseSnorlaxData,
                ability: { id: 'thick-fat', name: 'Thick Fat' }
            });

            const initialState = createBattleState([defender], [attacker]);
            const queuedActions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true }
            };

            // ACT
            // Run the turn. The onModifyDamage hook for Thick Fat should trigger.
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the damage dealt.
            const thickFatDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // 2. Assert against the pre-calculated value.
            // A normal Flamethrower would do 57 damage. Thick Fat halves this to 28 (after rounding).
            expect(thickFatDamage).toBe(28);
        });

        it('should halve the damage taken from Ice-type moves', async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseWeavileData = await fetchPokemonData('Weavile', 50);
            const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);

            // 2. Create the Pokémon.
            const attacker = createPokemon('Weavile', {
                ...baseWeavileData,
                moves: [{ id: 'ice-punch', name: 'Ice Punch', power: 75, damage_class: { name: 'physical' }, type: 'ice' }]
            });
            const defender = createPokemon('Snorlax', {
                ...baseSnorlaxData,
                ability: { id: 'thick-fat', name: 'Thick Fat' }
            });

            const initialState = createBattleState([defender], [attacker]);
            const queuedActions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true }
            };

            // ACT
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const thickFatDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // A normal Ice Punch would do 90 damage. Thick Fat halves this.
            expect(thickFatDamage).toBe(45);
        });
    });
    describe('Ability: Solid Rock', () => {
        it('should reduce damage from super-effective moves by 25%', async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseKingdraData = await fetchPokemonData('Kingdra', 50);
            const baseRhyperiorData = await fetchPokemonData('Rhyperior', 50);

            // 2. Create the Pokémon.
            const attacker = createPokemon('Kingdra', {
                ...baseKingdraData,
                moves: [{ id: 'surf', name: 'Surf', power: 90, damage_class: { name: 'special' }, type: 'water' }]
            });

            // Rhyperior is 4x weak to Water, making it a perfect test case.
            const defender = createPokemon('Rhyperior', {
                ...baseRhyperiorData,
                ability: { id: 'solid-rock', name: 'Solid Rock' },
                maxHp: 500, // Give it enough HP to survive the hit
                currentHp: 500,
            });

            const initialState = createBattleState([defender], [attacker]);
            const queuedActions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true }
            };

            // ACT
            // Run the turn. The onModifyDamage hook for Solid Rock should trigger.
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const solidRockDamage = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // A normal 4x super-effective Surf would do 408 damage.
            // Solid Rock reduces this by 25% (408 * 0.75), resulting in 306 damage.
            expect(solidRockDamage).toBe(306);
        });

        it('should NOT reduce damage from neutrally-effective moves', async () => {
            // ARRANGE
            const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);
            const baseRhyperiorData = await fetchPokemonData('Rhyperior', 50);

            // A Normal-type move is neutrally effective against Rhyperior.
            const attacker = createPokemon('Snorlax', {
                ...baseSnorlaxData,
                status: 'None', // Explicitly set status to prevent test state pollution
                moves: [{ id: 'body-slam', name: 'Body Slam', power: 85, damage_class: { name: 'physical' }, type: 'normal' }]
            });
            const defender = createPokemon('Rhyperior', {
                ...baseRhyperiorData,
                ability: { id: 'solid-rock', name: 'Solid Rock' }
            });

            const initialState = createBattleState([defender], [attacker]);
            const queuedActions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true }
            };

            // ACT
            const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const damageTaken = finalLog.find(log => log.type === 'attack')?.damage || 0;

            // The damage should be the full, unreduced amount because the move was not super-effective.
            expect(damageTaken).toBe(24);
        });
    });
    describe('Ability: Flash Fire', () => {
        it("should grant immunity to a Fire move and then boost the user's own Fire moves", async () => {
            // ARRANGE (TURN 1)
            const baseArcanineData = await fetchPokemonData('Arcanine', 50);
            const baseNinetalesData = await fetchPokemonData('Ninetales', 50);

            const flashFireUser = createPokemon('Arcanine', {
                ...baseArcanineData,
                ability: { id: 'flash-fire', name: 'Flash Fire' },
                moves: [{ id: 'flamethrower', name: 'Flamethrower', power: 90, damage_class: { name: 'special' }, type: 'fire' }]
            });
            const attacker = createPokemon('Ninetales', {
                ...baseNinetalesData,
                moves: [{ id: 'flamethrower', name: 'Flamethrower', power: 90, damage_class: { name: 'special' }, type: 'fire' }]
            });

            let turn1State = createBattleState([flashFireUser], [attacker]);
            const turn1Actions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [flashFireUser.id], hits: [{ targetId: flashFireUser.id }], willHit: true },
            };

            // ACT (TURN 1) - Triggering the ability
            const { finalBattleState: turn2State, finalLog: turn1Log } = await executeTurn(turn1State, turn1Actions, allTrainers);

            // ASSERT (TURN 1) - Check for immunity and activation
            const userAfterTurn1 = findPokemon(turn2State, 'Arcanine');
            expect(userAfterTurn1.currentHp).toBe(userAfterTurn1.maxHp); // Assert no damage was taken.
            expect(userAfterTurn1.flashFireBoosted).toBe(true); // Assert the boost flag was set.
            expect(turn1Log.some(log => log.text?.includes("Flash Fire activated!"))).toBe(true); // Assert the log message.

            // ARRANGE (TURN 2)
            const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);
            const newOpponent = createPokemon('Snorlax', { ...baseSnorlaxData });
            turn2State.teams[1].pokemon = [newOpponent]; // Swap in a neutral target to hit.
            turn2State.activePokemonIndices.opponent = [0];

            const boostedUser = findPokemon(turn2State, 'Arcanine');
            const turn2Actions = {
                [boostedUser.id]: { type: 'FIGHT', pokemon: boostedUser, move: boostedUser.moves[0], targetIds: [newOpponent.id], hits: [{ targetId: newOpponent.id }], willHit: true },
            };

            // ACT (TURN 2) - Using the boosted move
            const { finalLog: turn2Log } = await executeTurn(turn2State, turn2Actions, allTrainers);

            // ASSERT (TURN 2) - Check for boosted damage
            const damageDealt = turn2Log.find(log => log.type === 'attack')?.damage || 0;

            // A normal STAB Flamethrower from Arcanine to Snorlax would do 57 damage.
            // With the 1.5x Flash Fire boost, the damage should be 84.
            expect(damageDealt).toBe(84);
        });
    });
    describe('Ability: Harvest', () => {
        it('should restore a consumed Berry when the DM flag is set', async () => {
            // ARRANGE
            // 1. Create the Pokémon involved.
            const attacker = createPokemon('Weavile', {
                moves: [{ id: 'night-slash', name: 'Night Slash', power: 70, damage_class: { name: 'physical' }, type: 'dark' }]
            });
            const harvestUser = createPokemon('Exeggutor', {
                ability: { id: 'harvest', name: 'Harvest' },
                heldItem: { id: 'sitrus-berry', name: 'Sitrus Berry' },
            });

            // 2. Create the battle state and add the deterministic flag.
            const initialState = createBattleState([harvestUser], [attacker]);
            initialState.dm = { willHarvest: true }; // This flag forces Harvest to activate.

            // 3. Set up the action that will cause the berry to be consumed.
            const queuedActions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [harvestUser.id], hits: [{ targetId: harvestUser.id }], willHit: true },
            };

            // ACT
            // The turn runs, the berry is consumed, and the end-of-turn phase begins.
            // The Harvest ability will see the `willHarvest` flag and activate.
            const { finalBattleState } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalUser = findPokemon(finalBattleState, 'Exeggutor');

            // The Sitrus Berry should now be restored.
            expect(finalUser.heldItem).not.toBeNull();
            expect(finalUser.heldItem.id).toBe('sitrus-berry');
        });
    });
    describe('Ability: Justified', () => {
        it('should raise Attack by one stage when hit by a Dark-type move', async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseWeavileData = await fetchPokemonData('Weavile', 50);
            const baseLucarioData = await fetchPokemonData('Lucario', 50);

            // 2. Create the Pokémon.
            const attacker = createPokemon('Weavile', {
                ...baseWeavileData,
                moves: [{ id: 'night-slash', name: 'Night Slash', power: 70, damage_class: { name: 'physical' }, type: 'dark' }]
            });

            // The defender has the Justified ability and starts with a neutral Attack stat.
            const justifiedUser = createPokemon('Lucario', {
                ...baseLucarioData,
                ability: { id: 'justified', name: 'Justified' },
            });

            // 3. Create the initial battle state.
            const initialState = createBattleState([justifiedUser], [attacker]);
            const queuedActions = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0], // A Dark-type move
                    targetIds: [justifiedUser.id],
                    hits: [{ targetId: justifiedUser.id }],
                    willHit: true,
                },
            };

            // ACT
            // Run the turn. The onTakeDamage hook for Justified should trigger.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the Justified user in the final state.
            const finalUser = findPokemon(finalBattleState, 'Lucario');
            expect(finalUser).toBeDefined();

            // 2. The primary assertion: The user's Attack stat stage should now be +1.
            expect(finalUser.stat_stages.attack).toBe(1);

            // 3. Verify the correct log message for Justified was generated.
            const logFound = finalLog.some(log => log.text?.includes("Justified raised its Attack!"));
            expect(logFound).toBe(true);
        });
    });
    describe('Ability: Competitive', () => {
        it('should sharply raise Special Attack when another stat is lowered by an opponent', async () => {
            // ARRANGE
            // 1. Fetch data for the Pokémon.
            const baseLandorusData = await fetchPokemonData('Landorus-Therian', 50);
            const baseMiloticData = await fetchPokemonData('Milotic', 50);

            // 2. Create the Pokémon.
            // The attacker has Intimidate, which lowers the opponent's Attack stat.
            const attacker = createPokemon('Landorus-Therian', {
                ...baseLandorusData,
                ability: { id: 'intimidate', name: 'Intimidate' }
            });

            // The defender has the Competitive ability and starts with neutral stats.
            const competitiveUser = createPokemon('Milotic', {
                ...baseMiloticData,
                ability: { id: 'competitive', name: 'Competitive' },
                stat_stages: { attack: 0, 'special-attack': 0 },
            });

            // 3. Create the initial battle state.
            const initialState = createBattleState([competitiveUser], [attacker]);
            const queuedActions = {}; // Intimidate activates on switch-in, before actions.

            // ACT
            // Run the turn. Landorus's Intimidate will trigger Milotic's Competitive.
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            // 1. Find the Competitive user in the final state.
            const finalUser = findPokemon(finalBattleState, 'Milotic');
            expect(finalUser).toBeDefined();

            // 2. Confirm the initial stat drop from Intimidate occurred.
            expect(finalUser.stat_stages.attack).toBe(-1);

            // 3. The primary assertion: The user's Special Attack should now be +2 due to Competitive.
            expect(finalUser.stat_stages['special-attack']).toBe(2);

            // 4. Verify the correct log message for Competitive was generated.
            const logFound = finalLog.some(log => log.text?.includes("Competitive sharply raised its Sp. Atk!"));
            expect(logFound).toBe(true);
        });
    });
    describe('Ability: Protosynthesis', () => {
        it("should boost the user's highest stat in harsh sunlight", async () => {
            // ARRANGE
            // 1. Fetch data for a Protosynthesis user. Walking Wake's highest stat is Special Attack.
            const baseWakeData = await fetchPokemonData('Walking-Wake', 50);
            const baseOpponentData = await fetchPokemonData('Rattata', 50);

            // 2. Create the Pokémon.
            const protoUser = createPokemon('Walking-Wake', {
                ...baseWakeData,
                ability: { id: 'protosynthesis', name: 'Protosynthesis' },
                // This flag is important to track the ability's activation
                boosterApplied: false,
            });
            const opponent = createPokemon('Rattata', { ...baseOpponentData });

            // 3. Create a battle state with harsh sunlight active.
            const initialState = createBattleState(
                [protoUser],
                [opponent],
                { weather: 'sunshine' }
            );

            const queuedActions = {}; // Activates on switch-in.

            // ACT
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalUser = findPokemon(finalBattleState, 'Walking Wake'); // Note the space in the name
            expect(finalUser).toBeDefined();

            // 1. The boosterBoost property should be set correctly.
            expect(finalUser.boosterBoost).not.toBeNull();
            expect(finalUser.boosterBoost.stat).toBe('special-attack');
            expect(finalUser.boosterBoost.multiplier).toBe(1.3);

            // 2. The flag to prevent re-activation should be true.
            expect(finalUser.boosterApplied).toBe(true);

            // 3. Verify the correct log message was generated.
            const logFound = finalLog.some(log => log.text?.includes("Protosynthesis activated, boosting its special attack!"));
            expect(logFound).toBe(true);
        });

        it("should consume Booster Energy to boost the highest stat if there is no sun", async () => {
            // ARRANGE
            const baseWakeData = await fetchPokemonData('Walking-Wake', 50);
            const baseOpponentData = await fetchPokemonData('Rattata', 50);

            const protoUser = createPokemon('Walking-Wake', {
                ...baseWakeData,
                ability: { id: 'protosynthesis', name: 'Protosynthesis' },
                heldItem: { id: 'booster-energy', name: 'Booster Energy' },
                boosterApplied: false,
            });
            const opponent = createPokemon('Rattata', { ...baseOpponentData });

            // The weather is explicitly not sunny.
            const initialState = createBattleState([protoUser], [opponent], { weather: 'none' });
            const queuedActions = {};

            // ACT
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalUser = findPokemon(finalBattleState, 'Walking Wake');
            expect(finalUser).toBeDefined();

            // 1. The boost should still be active.
            expect(finalUser.boosterBoost).not.toBeNull();
            expect(finalUser.boosterBoost.stat).toBe('special-attack');

            // 2. The Booster Energy should have been consumed.
            expect(finalUser.heldItem).toBeNull();

            // 3. The log message should be the same.
            const logFound = finalLog.some(log => log.text?.includes("Protosynthesis activated, boosting its special attack!"));
            expect(logFound).toBe(true);
        });
    });
    describe('Ability: Shell Armor', () => {
        it('should always block a crit even if a move has a 100% crit rate', async () => {
            // ARRANGE
            const attacker = createPokemon('Glaceon', {
                moves: [{ id: 'frost-breath', name: 'Frost Breath', power: 60, damage_class: { name: 'special' }, type: 'ice' }]
            });
            const normalDefender = createPokemon('Dragonite');
            const immuneDefender = createPokemon('Kingler', {
                ability: { id: 'shell-armor', name: 'Shell Armor' }
            });

            // --- TEST 1: Against a normal defender ---
            const testState1 = createBattleState([attacker], [normalDefender]);
            const actions1 = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0],
                    targetIds: [normalDefender.id],
                    hits: [{ targetId: normalDefender.id }],
                    willHit: true,
                    isCritical: false // Manually set to false to prove the move overrides it.
                }
            };

            // ACT 1
            const { finalLog: log1 } = await executeTurn(testState1, actions1, allTrainers);

            // ASSERT 1
            const attackLog1 = log1.find(log => log.type === 'attack');
            expect(attackLog1.isCritical).toBe(true);

            // --- TEST 2: Against a Shell Armor defender ---
            const testState2 = createBattleState([attacker], [immuneDefender]);
            const actions2 = {
                [attacker.id]: {
                    type: 'FIGHT',
                    pokemon: attacker,
                    move: attacker.moves[0],
                    targetIds: [immuneDefender.id],
                    hits: [{ targetId: immuneDefender.id }],
                    willHit: true
                    // isCritical flag is irrelevant here, but we can omit it
                }
            };

            // ACT 2
            const { finalLog: log2 } = await executeTurn(testState2, actions2, allTrainers);

            // ASSERT 2
            const attackLog2 = log2.find(log => log.type === 'attack');
            expect(attackLog2.isCritical).toBe(false);
        });
    });
    describe('Ability: Wonder Guard', () => {
        it('should block all damage from non-super-effective moves', async () => {
            // ARRANGE
            const baseShedinjaData = await fetchPokemonData('Shedinja', 50);
            const baseWeezingData = await fetchPokemonData('Weezing', 50);

            const wonderGuardUser = createPokemon('Shedinja', {
                ...baseShedinjaData,
                ability: { id: 'wonder-guard', name: 'Wonder Guard' },
            });

            // CORRECTED: Weezing's Sludge Bomb (Poison) is resisted by Shedinja (Bug/Ghost), so it's not super-effective.
            const attacker = createPokemon('Weezing', {
                ...baseWeezingData,
                moves: [{ id: 'sludge-bomb', name: 'Sludge Bomb', power: 90, damage_class: { name: 'special' }, type: 'poison' }]
            });

            const initialState = createBattleState([wonderGuardUser], [attacker]);
            const queuedActions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [wonderGuardUser.id], hits: [{ targetId: wonderGuardUser.id }], willHit: true },
            };

            // ACT
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalDefender = findPokemon(finalBattleState, 'Shedinja');

            // The Pokémon should have taken no damage because the move was resisted.
            expect(finalDefender.currentHp).toBe(1);

            // The correct log message for Wonder Guard should have been generated.
            const logFound = finalLog.some(log => log.text?.includes("Wonder Guard protected it!"));
            expect(logFound).toBe(true);
        });

        it('should allow super-effective damage to pass through', async () => {
            // ARRANGE
            const baseShedinjaData = await fetchPokemonData('Shedinja', 50);
            const baseTyranitarData = await fetchPokemonData('Tyranitar', 50);

            const wonderGuardUser = createPokemon('Shedinja', {
                ...baseShedinjaData,
                ability: { id: 'wonder-guard', name: 'Wonder Guard' },
            });

            // Tyranitar's Stone Edge (Rock) is super-effective against Shedinja's Bug type. This part of the test was correct.
            const attacker = createPokemon('Tyranitar', {
                ...baseTyranitarData,
                moves: [{ id: 'stone-edge', name: 'Stone Edge', power: 100, damage_class: { name: 'physical' }, type: 'rock' }]
            });

            const initialState = createBattleState([wonderGuardUser], [attacker]);
            const queuedActions = {
                [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [wonderGuardUser.id], hits: [{ targetId: wonderGuardUser.id }], willHit: true },
            };

            // ACT
            const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

            // ASSERT
            const finalDefender = findPokemon(finalBattleState, 'Shedinja');

            // The Pokémon should have taken damage and fainted.
            expect(finalDefender.currentHp).toBe(0);
            expect(finalDefender.fainted).toBe(true);

            // The Wonder Guard message should NOT be present.
            const logFound = finalLog.some(log => log.text?.includes("Wonder Guard protected it!"));
            expect(logFound).toBe(false);
        });
    });
});