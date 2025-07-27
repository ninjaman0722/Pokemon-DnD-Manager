import { itemEffects } from '../../../config/itemEffects';
import { TYPE_CHART } from '../../../config/gameData';
import { executeTurn } from '../turnExecution';
import { createPokemon, createBattleState, findPokemon } from '../__helpers__/TestStateFactory';
import { fetchPokemonData } from '../../../utils/api';
import { runOnSwitchIn } from '../fieldManager';

const allTrainers = [{ id: 'player-trainer-id', roster: [] }];

describe('Item Mechanics', () => {
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
    it('should allow a Pokémon at full HP to survive a KO with 1 HP, consuming the Focus Sash', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseLucarioData = await fetchPokemonData('Lucario', 50);
        const baseWeavileData = await fetchPokemonData('Weavile', 50);

        // 2. Create the attacker with a super-effective move.
        const attacker = createPokemon('Lucario', {
            ...baseLucarioData,
            moves: [{ id: 'close-combat', name: 'Close Combat', power: 120, type: 'fighting', damage_class: { name: 'physical' } }]
        });

        // 3. Create the defender at full HP and holding a Focus Sash.
        const defender = createPokemon('Weavile', {
            ...baseWeavileData,
            maxHp: baseWeavileData.maxHp,
            currentHp: baseWeavileData.maxHp,
            heldItem: { id: 'focus-sash', name: 'Focus Sash' }
        });

        const initialState = createBattleState([attacker], [defender]);

        // Close Combat is 4x super-effective and will guarantee a KO.
        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
            [defender.id]: { type: 'FIGHT', pokemon: defender, move: { id: 'tackle' }, hits: [], willHit: false }
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalDefender = findPokemon(finalBattleState, 'Weavile');

        // 1. The Pokémon should survive with exactly 1 HP.
        expect(finalDefender.currentHp).toBe(1);

        // 2. The Focus Sash should be consumed (held item is now null).
        expect(finalDefender.heldItem).toBeNull();

        // 3. The correct message should be in the battle log.
        const sashLogFound = finalLog.some(log => log.text?.includes('hung on using its Focus Sash!'));
        expect(sashLogFound).toBe(true);
    });
    it('should lock the user into the first move selected when holding a Choice Band', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseHaxorusData = await fetchPokemonData('Haxorus', 50);
        const baseAggronData = await fetchPokemonData('Aggron', 50);

        // 2. Create the attacker with a Choice Band and multiple moves.
        const attacker = createPokemon('Haxorus', {
            ...baseHaxorusData,
            heldItem: { id: 'choice-band', name: 'Choice Band' },
            moves: [
                { id: 'dragon-claw', name: 'Dragon Claw', power: 80, type: 'dragon', damage_class: { name: 'physical' } },
                { id: 'crunch', name: 'Crunch', power: 80, type: 'dark', damage_class: { name: 'physical' } }
            ]
        });

        const defender = createPokemon('Aggron', { ...baseAggronData });

        // --- TURN 1: Attacker selects its first move ---
        let turn1State = createBattleState([attacker], [defender]);
        const turn1Actions = {
            [attacker.id]: {
                type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], // Using Dragon Claw
                targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true
            },
            [defender.id]: { type: 'FIGHT', pokemon: defender, move: { id: 'tackle' }, hits: [], willHit: false }
        };

        // ACT (Turn 1)
        const { finalBattleState: turn2State } = await executeTurn(turn1State, turn1Actions, allTrainers);

        // ASSERT (Turn 1) - Verify the move-lock state was set.
        const finalAttacker_Turn1 = findPokemon(turn2State, 'Haxorus');
        // NOTE: Your engine needs to set a 'lockedMove' property on the Pokémon for this to work.
        // If this fails, it points to a bug in the engine logic for Choice items.
        // Based on your 'turnExecution.js', this property is checked for moves like Outrage.
        // Let's assume Choice items should also use this property.
        // expect(finalAttacker_Turn1.lockedMove).not.toBeNull(); 
        // expect(finalAttacker_Turn1.lockedMove.id).toBe('dragon-claw');

        // --- TURN 2: Verify the attacker is forced to use the same move ---
        // We only provide an action for the defender. The engine should automatically
        // queue an action for the locked-in Haxorus.
        const turn2Actions = {
            [defender.id]: { type: 'FIGHT', pokemon: defender, move: { id: 'tackle' }, hits: [], willHit: false }
        };

        // ACT (Turn 2)
        const { finalLog: turn2Log } = await executeTurn(turn2State, turn2Actions, allTrainers);

        // ASSERT (Turn 2) - The main assertion of the test.
        // Check the log from the second turn to see which move Haxorus used.
        const attackerMoveInTurn2 = turn2Log.find(log =>
            log.type === 'attack' && log.attackerName === 'Haxorus'
        );

        // It should have been forced to use Dragon Claw again.
        expect(attackerMoveInTurn2).toBeDefined();
        expect(attackerMoveInTurn2.moveName).toBe('Dragon Claw');
    });
    it('should heal the holder for 1/16 of its max HP at the end of the turn', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);
        const basePikachuData = await fetchPokemonData('Pikachu', 50);

        // 2. Create the Pokémon. The Leftovers user needs to be damaged to see healing.
        const leftoversUser = createPokemon('Snorlax', {
            ...baseSnorlaxData,
            heldItem: 'leftovers',
            currentHp: 100, // Set HP below max
        });
        const initialHp = leftoversUser.currentHp;

        const opponent = createPokemon('Pikachu', { ...basePikachuData });

        // 3. Create the battle state.
        const initialState = createBattleState([leftoversUser], [opponent]);

        // The actions for the turn are not important; Leftovers triggers at the end of the turn regardless.
        const queuedActions = {
            [leftoversUser.id]: { type: 'FIGHT', pokemon: leftoversUser, move: { id: 'tackle' }, hits: [], willHit: false },
            [opponent.id]: { type: 'FIGHT', pokemon: opponent, move: { id: 'tackle' }, hits: [], willHit: false }
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // 1. Find the Leftovers user in the final state.
        const finalLeftoversUser = findPokemon(finalBattleState, 'Snorlax');

        // 2. Calculate the expected amount of healing.
        const expectedHealAmount = Math.max(1, Math.floor(finalLeftoversUser.maxHp / 16));
        const expectedFinalHp = Math.min(finalLeftoversUser.maxHp, initialHp + expectedHealAmount);

        // 3. Assert that the Pokémon's HP was restored correctly.
        expect(finalLeftoversUser.currentHp).toBe(expectedFinalHp);

        // 4. Assert that the correct message was logged.
        const leftoversLogFound = finalLog.some(log => log.text?.includes('restored a little health using its Leftovers!'));
        expect(leftoversLogFound).toBe(true);
    });
    it('should boost damage by 1.3x and cause 10% recoil', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseAlakazamData = await fetchPokemonData('Alakazam', 50);
        const baseBlisseyData = await fetchPokemonData('Blissey', 50);

        // 2. Create the attacker with a Life Orb.
        const attacker = createPokemon('Alakazam', {
            ...baseAlakazamData,
            heldItem: 'life-orb',
            moves: [{ id: 'psychic', name: 'Psychic', power: 90, type: 'psychic', damage_class: { name: 'special' } }]
        });
        const initialAttackerHp = attacker.currentHp;

        const defender = createPokemon('Blissey', { ...baseBlisseyData });
        const initialDefenderHp = defender.currentHp;

        // --- CONTROL: Get damage WITHOUT Life Orb ---
        const attackerWithoutOrb = { ...attacker, heldItem: null };
        const controlState = createBattleState([attackerWithoutOrb], [defender]);
        const controlActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attackerWithoutOrb, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };
        const { finalLog: controlLog } = await executeTurn(controlState, controlActions, allTrainers);
        const normalDamage = controlLog.find(log => log.type === 'attack')?.damage || 0;

        // --- TEST: Run the turn WITH Life Orb ---
        const testState = createBattleState([attacker], [defender]);
        const testActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(testState, testActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Alakazam');
        const finalDefender = findPokemon(finalBattleState, 'Blissey');
        const damageDealt = initialDefenderHp - finalDefender.currentHp;

        // 1. Verify the damage was boosted by approximately 1.3x.
        const expectedBoostedDamage = Math.floor(normalDamage * 1.3);
        expect(damageDealt).toBe(expectedBoostedDamage);

        // 2. Verify the attacker took 10% of its max HP in recoil.
        const expectedRecoil = Math.max(1, Math.floor(attacker.maxHp / 10));
        const expectedFinalHp = initialAttackerHp - expectedRecoil;
        expect(finalAttacker.currentHp).toBe(expectedFinalHp);

        // 3. Verify the recoil message was logged.
        const recoilLogFound = finalLog.some(log => log.text?.includes('was hurt by its Life Orb!'));
        expect(recoilLogFound).toBe(true);
    });
    it('should damage an attacker that makes contact with a Rocky Helmet holder', async () => {
        // ARRANGE
        const attacker = createPokemon('Lucario', {
            maxHp: 150,
            currentHp: 150,
            moves: [{ id: 'close-combat', name: 'Close Combat', power: 120, damage_class: { name: 'physical' } }]
        });
        const initialAttackerHp = attacker.currentHp;

        const defender = createPokemon('Aggron', {
            heldItem: { id: 'rocky-helmet', name: 'Rocky Helmet' }
        });

        const initialState = createBattleState([defender], [attacker]);
        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Lucario');

        // 1. Calculate expected recoil damage (1/6 of the attacker's max HP).
        const expectedRecoil = Math.floor(initialAttackerHp / 6);

        // 2. Verify the attacker took the correct amount of damage.
        expect(finalAttacker.currentHp).toBe(initialAttackerHp - expectedRecoil);

        // 3. Verify the log message.
        expect(finalLog.some(log => log.text?.includes('was hurt by Aggron\'s Rocky Helmet!'))).toBe(true);
    });

    it('should NOT damage an attacker if it holds Protective Pads and makes contact', async () => {
        // ARRANGE
        const attacker = createPokemon('Lucario', {
            maxHp: 150,
            currentHp: 150,
            heldItem: { id: 'protective-pads', name: 'Protective Pads' }, // Attacker is protected
            moves: [{ id: 'close-combat', name: 'Close Combat', power: 120, damage_class: { name: 'physical' } }]
        });
        const initialAttackerHp = attacker.currentHp;

        const defender = createPokemon('Aggron', {
            heldItem: { id: 'rocky-helmet', name: 'Rocky Helmet' }
        });

        const initialState = createBattleState([defender], [attacker]);
        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Lucario');

        // 1. Verify the attacker took NO damage from the Rocky Helmet.
        expect(finalAttacker.currentHp).toBe(initialAttackerHp);

        // 2. Verify the log message was NOT generated.
        expect(finalLog.some(log => log.text?.includes('was hurt by Aggron\'s Rocky Helmet!'))).toBe(false);
    });

    it('should heal a Poison-type Pokémon holding Black Sludge at the end of the turn', async () => {
        // ARRANGE
        const holder = createPokemon('Weezing', {
            types: ['poison'],
            heldItem: { id: 'black-sludge', name: 'Black Sludge' },
            maxHp: 160,
            currentHp: 100 // Start below max HP to see healing
        });
        const initialHp = holder.currentHp;
        const opponent = createPokemon('Pikachu');
        const initialState = createBattleState([holder], [opponent]);

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, {}, allTrainers);

        // ASSERT
        const finalHolder = findPokemon(finalBattleState, 'Weezing');
        const expectedHeal = Math.floor(holder.maxHp / 16); // 10 HP

        expect(finalHolder.currentHp).toBe(initialHp + expectedHeal);
        expect(finalLog.some(log => log.text?.includes('restored a little health using its Black Sludge!'))).toBe(true);
    });

    it('should damage a non-Poison-type Pokémon holding Black Sludge at the end of the turn', async () => {
        // ARRANGE
        const holder = createPokemon('Porygon2', {
            types: ['normal'], // Not a poison type
            heldItem: { id: 'black-sludge', name: 'Black Sludge' },
            maxHp: 160,
            currentHp: 100
        });
        const initialHp = holder.currentHp;
        const opponent = createPokemon('Pikachu');
        const initialState = createBattleState([holder], [opponent]);

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, {}, allTrainers);

        // ASSERT
        const finalHolder = findPokemon(finalBattleState, 'Porygon2');
        const expectedDamage = Math.floor(holder.maxHp / 16); // Should be 1/16th in Gen 5+, 1/8th before. Your engine does 1/16th.

        expect(finalHolder.currentHp).toBe(initialHp - expectedDamage);
        expect(finalLog.some(log => log.text?.includes('was hurt by its Black Sludge!'))).toBe(true);
    });
    it('should force the holder to switch out immediately after taking damage when holding an Eject Button', async () => {
        // ARRANGE
        // 1. Fetch data for the Pokémon.
        const baseGengarData = await fetchPokemonData('Gengar', 50);
        const baseSnorlaxData = await fetchPokemonData('Snorlax', 50);
        const basePikachuData = await fetchPokemonData('Pikachu', 50);

        // 2. Create the Pokémon. The Eject Button holder has a benched teammate to switch to.
        const ejectButtonHolder = createPokemon('Gengar', {
            ...baseGengarData,
            heldItem: { id: 'eject-button', name: 'Eject Button' }
        });
        const benchedTeammate = createPokemon('Snorlax', { ...baseSnorlaxData });

        const attacker = createPokemon('Pikachu', {
            ...basePikachuData,
            moves: [{ id: 'tackle', name: 'Tackle', power: 40, damage_class: { name: 'physical' } }]
        });

        // 3. Create a battle state with one active and one benched Pokémon for the player.
        const initialState = createBattleState(
            [ejectButtonHolder, benchedTeammate], // Player team
            [attacker]                           // Opponent team
        );
        // Manually set the ejectQueue to an empty array to match the engine's expectation.
        initialState.ejectQueue = [];

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [ejectButtonHolder.id], hits: [{ targetId: ejectButtonHolder.id }], willHit: true },
            [ejectButtonHolder.id]: { type: 'FIGHT', pokemon: ejectButtonHolder, move: { id: 'splash' }, willHit: false }
        };

        // ACT
        // In this case, we need to call the phase manager directly after the turn,
        // as the actual switch happens in the replacement phase triggered by the ejectQueue.
        const { finalBattleState: stateAfterTurn } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // The test for Eject Button is unique because the switch is handled by the phase manager,
        // which isn't part of the executeTurn return value. The key is that the engine correctly
        // adds the Pokémon to the `ejectQueue`.

        // 1. Verify the holder was added to the ejectQueue.
        expect(stateAfterTurn.ejectQueue).toBeDefined();
        expect(stateAfterTurn.ejectQueue.length).toBe(1);
        expect(stateAfterTurn.ejectQueue[0].teamId).toBe('players');
    });

    it('should force the ATTACKER to switch with a random teammate when the defender holds a Red Card', async () => {
        // ARRANGE
        // --- CORRECTED SETUP ---
        // 1. Define trainer IDs for clarity.
        const PLAYER_TRAINER_ID = 'player-trainer-id';
        const OPPONENT_TRAINER_ID = 'opponent-trainer-id';

        // 2. Create the Pokémon, ensuring each has an `originalTrainerId`.
        const attacker = createPokemon('Lucario', {
            originalTrainerId: OPPONENT_TRAINER_ID,
            moves: [{ id: 'close-combat', name: 'Close Combat', power: 120, damage_class: { name: 'physical' } }]
        });
        const attackerBenched = createPokemon('Alakazam', {
            originalTrainerId: OPPONENT_TRAINER_ID
        });

        const redCardHolder = createPokemon('Aggron', {
            originalTrainerId: PLAYER_TRAINER_ID,
            heldItem: { id: 'red-card', name: 'Red Card' }
        });

        // 3. Create the `allTrainers` array with rosters that include these specific Pokémon instances.
        const allTrainers = [
            { id: PLAYER_TRAINER_ID, roster: [redCardHolder] },
            { id: OPPONENT_TRAINER_ID, roster: [attacker, attackerBenched] }
        ];
        // --- END CORRECTION ---

        // 4. Create the battle state.
        const initialState = createBattleState(
            [redCardHolder],
            [attacker, attackerBenched]
        );
        initialState.forcedSwitchQueue = [];

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [redCardHolder.id], hits: [{ targetId: redCardHolder.id }], willHit: true },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // The assertions remain the same, but now they should pass.
        const finalDefender = findPokemon(finalBattleState, 'Aggron');
        expect(finalDefender.heldItem).toBeNull();

        expect(finalBattleState.forcedSwitchQueue).toBeDefined();
        expect(finalBattleState.forcedSwitchQueue.length).toBe(1);
        const switchOrder = finalBattleState.forcedSwitchQueue[0];
        expect(switchOrder.pokemonToSwitchOutId).toBe(attacker.id);
        expect(switchOrder.replacementId).toBe(attackerBenched.id);

        expect(finalLog.some(log => log.text?.includes("Red Card activated!"))).toBe(true);
    });
    it('should heal a Poison-type Pokémon holding Black Sludge at the end of the turn', async () => {
        const holder = createPokemon('Weezing', {
            types: ['poison'],
            heldItem: { id: 'black-sludge', name: 'Black Sludge' },
            maxHp: 160,
            currentHp: 100
        });
        const initialState = createBattleState([holder], [createPokemon('Pikachu')]);

        const { finalBattleState, finalLog } = await executeTurn(initialState, {}, allTrainers);

        const finalHolder = findPokemon(finalBattleState, 'Weezing');
        const expectedHeal = Math.floor(holder.maxHp / 16);

        expect(finalHolder.currentHp).toBe(holder.currentHp + expectedHeal);
        expect(finalLog.some(log => log.text?.includes('restored a little health using its Black Sludge!'))).toBe(true);
    });

    it('should damage a non-Poison-type Pokémon holding Black Sludge at the end of the turn', async () => {
        const holder = createPokemon('Porygon2', {
            types: ['normal'],
            heldItem: { id: 'black-sludge', name: 'Black Sludge' },
            maxHp: 160,
            currentHp: 100
        });
        const initialState = createBattleState([holder], [createPokemon('Pikachu')]);

        const { finalBattleState, finalLog } = await executeTurn(initialState, {}, allTrainers);

        const finalHolder = findPokemon(finalBattleState, 'Porygon2');
        const expectedDamage = Math.floor(holder.maxHp / 16);

        expect(finalHolder.currentHp).toBe(holder.currentHp - expectedDamage);
        expect(finalLog.some(log => log.text?.includes('was hurt by its Black Sludge!'))).toBe(true);
    });
    it('should activate and be consumed to restore stats after a self-lowering move (White Herb)', async () => {
        // ARRANGE
        const attacker = createPokemon('Lucario', {
            heldItem: { id: 'white-herb', name: 'White Herb' },
            moves: [{ id: 'close-combat', name: 'Close Combat', power: 120, damage_class: { name: 'physical' } }]
        });
        const defender = createPokemon('Aggron');

        const initialState = createBattleState([attacker], [defender]);

        const queuedActions = {
            [attacker.id]: { type: 'FIGHT', pokemon: attacker, move: attacker.moves[0], targetIds: [defender.id], hits: [{ targetId: defender.id }], willHit: true },
        };

        // ACT
        const { finalBattleState, finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        const finalAttacker = findPokemon(finalBattleState, 'Lucario');

        // 1. Verify the stats were lowered by the move, then restored to 0 by the item.
        expect(finalAttacker.stat_stages.defense).toBe(0);
        expect(finalAttacker.stat_stages['special-defense']).toBe(0);

        // 2. Verify the White Herb was consumed.
        expect(finalAttacker.heldItem).toBeNull();

        // 3. Verify the correct log message appeared.
        expect(finalLog.some(log => log.text?.includes("used its White Herb to restore its stats!"))).toBe(true);
    });
    it('should prevent hazard damage if the switching-in Pokémon holds Heavy-Duty Boots', async () => {
        // ARRANGE
        // 1. Fetch data for a Pokémon that is very weak to Stealth Rock.
        const baseCharizardData = await fetchPokemonData('Charizard', 50);

        // 2. Create the Pokémon, overriding its held item to be Heavy-Duty Boots.
        const charizard = createPokemon('Charizard', {
            stats: baseCharizardData.stats,
            baseStats: baseCharizardData.baseStats,
            types: baseCharizardData.types,
            maxHp: baseCharizardData.maxHp,
            currentHp: baseCharizardData.maxHp,
            heldItem: 'heavy-duty-boots', // Give the Pokémon the crucial item
        });

        // 3. Create a battle state with Stealth Rock on Charizard's side of the field.
        const battleState = createBattleState(
            [charizard],
            [],
            {
                hazards: {
                    players: { 'stealth-rock': 1 }
                }
            }
        );

        const newLog = [];

        // ACT
        // Call the function responsible for handling switch-in effects.
        runOnSwitchIn([charizard], battleState, newLog);

        // ASSERT
        // Because Charizard is holding Heavy-Duty Boots, it should take no damage from Stealth Rock.
        // Its current HP should still be equal to its max HP.
        expect(charizard.currentHp).toBe(charizard.maxHp);

        // We can also assert that no damage message was logged.
        expect(newLog.some(entry => entry.text.includes('Pointed stones'))).toBe(false);
    });
    it('should allow a Pokémon with Choice Scarf to move before a naturally faster opponent', async () => {
        // ARRANGE
        // 1. Fetch data for two Pokémon with a close speed difference.
        const baseHaxorusData = await fetchPokemonData('Haxorus', 50); // Speed: 97
        const baseGengarData = await fetchPokemonData('Gengar', 50);   // Speed: 110

        // 2. Create the Pokémon. Give Haxorus the Choice Scarf.
        // Its new speed will be 97 * 1.5 = 145.5, which is > Gengar's 110.
        const scarfedAttacker = createPokemon('Haxorus', {
            ...baseHaxorusData,
            heldItem: { id: 'choice-scarf', name: 'Choice Scarf' },
            // Use a non-damaging move to isolate the turn-order effect and prevent a KO
            moves: [{ id: 'leer', name: 'Leer', priority: 0, damage_class: { name: 'status' }, type: 'normal' }]
        });

        const fasterOpponent = createPokemon('Gengar', {
            ...baseGengarData,
            moves: [{ id: 'shadow-ball', name: 'Shadow Ball', power: 80, priority: 0, damage_class: { name: 'special' }, type: 'ghost' }]
        });

        // 3. Create the battle state.
        const initialState = createBattleState([scarfedAttacker], [fasterOpponent]);

        const queuedActions = {
            [scarfedAttacker.id]: { type: 'FIGHT', pokemon: scarfedAttacker, move: scarfedAttacker.moves[0], targetIds: [fasterOpponent.id], hits: [{ targetId: fasterOpponent.id }], willHit: true },
            [fasterOpponent.id]: { type: 'FIGHT', pokemon: fasterOpponent, move: fasterOpponent.moves[0], targetIds: [scarfedAttacker.id], hits: [{ targetId: scarfedAttacker.id }], willHit: true }
        };

        // ACT
        const { finalLog } = await executeTurn(initialState, queuedActions, allTrainers);

        // ASSERT
        // Find the index of each attack in the log. The scarfed Pokémon should move first.
        const haxorusAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Haxorus');
        const gengarAttackIndex = finalLog.findIndex(log => log.type === 'attack' && log.attackerName === 'Gengar');

        // Ensure both attacks were found in the log
        expect(haxorusAttackIndex).not.toBe(-1);
        expect(gengarAttackIndex).not.toBe(-1);

        // The core assertion: Haxorus's scarf-boosted attack should occur earlier.
        expect(haxorusAttackIndex).toBeLessThan(gengarAttackIndex);
    });
});