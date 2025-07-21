import { getEffectiveAbility, getStatModifier, isGrounded, getActiveOpponents } from './battleUtils';
import { calculateDamage, getZMovePower } from './damageCalculator';
import { calculateStatChange, handleTransform, resolveFormChange, revertFormChange } from './stateModifiers';
import { runOnSwitchIn } from './fieldManager';
import {
    TYPE_CHART, RECOIL_MOVES, DRAIN_MOVES, CONTACT_MOVES, Z_CRYSTAL_MAP, API_AILMENT_TO_STATUS_MAP, CURSE_MOVE, NIGHTMARE_MOVE, REFLECT_TYPE_MOVES, LIGHT_SCREEN_TYPE_MOVES, AURORA_VEIL_MOVE, MOVE_TO_TERRAIN_MAP, MOVE_TO_WEATHER_MAP, WEATHER_EXTENDING_ROCKS, ENCORE_MOVE, TAUNT_MOVE, INFATUATION_MOVE, ABILITY_SUPPRESSING_MOVES, ABILITY_REPLACEMENT_MOVES, TWO_TURN_MOVES, REFLECTABLE_MOVES, BINDING_MOVES, LEECH_SEED_MOVE, CONFUSION_INDUCING_MOVES
} from '../../config/gameData';
import { abilityEffects } from '../../config/abilityEffects';
import { itemEffects } from '../../config/itemEffects';

const endOfTurnEffects = [
    // --- ABILITY-BASED EFFECTS ---
    {
        name: 'Ability Effects',
        // This runs for every Pokémon that has a relevant ability
        applies: (p, state) => {
            const abilityName = getEffectiveAbility(p, state)?.toLowerCase();
            return abilityEffects[abilityName]?.onEndOfTurn;
        },
        execute: (p, state, log) => {
            const abilityName = getEffectiveAbility(p, state)?.toLowerCase();
            // We pass a function here to handle nested stat changes, fitting the "calculator" pattern
            abilityEffects[abilityName].onEndOfTurn(p, state, log, (t, s, c, l, cs) => {
                const result = calculateStatChange(t, s, c, cs);
                Object.assign(t, result.updatedTarget);
                l.push(...result.newLog);
            });
        }
    },
    // --- ITEM-BASED EFFECTS ---
    {
        name: 'Item Effects',
        applies: (p, state) => {
            if (p.volatileStatuses.includes('Embargo')) return false;
            if (state.field.magicRoomTurns > 0) return false;
            const itemName = p.heldItem?.name.toLowerCase();
            return itemEffects[itemName]?.onEndOfTurn;
        },
        execute: (p, state, log) => {
            const itemName = p.heldItem?.name.toLowerCase();
            itemEffects[itemName].onEndOfTurn(p, state, log);
        }
    },
    // --- STATUS-BASED DAMAGE ---
    {
        name: 'Poison',
        applies: (p, state) => p.status === 'Poisoned' && getEffectiveAbility(p, state)?.toLowerCase() !== 'poison-heal',
        isImmune: (p, state) => getEffectiveAbility(p, state)?.toLowerCase() === 'magic-guard',
        execute: (p, state, log) => {
            const damage = Math.floor(p.maxHp / 8);
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} was hurt by poison!` });
        }
    },
    {
        name: 'Badly Poisoned',
        applies: (p, state) => p.status === 'Badly Poisoned' && getEffectiveAbility(p, state)?.toLowerCase() !== 'poison-heal',
        isImmune: (p, state) => getEffectiveAbility(p, state)?.toLowerCase() === 'magic-guard',
        execute: (p, state, log) => {
            const counter = p.badlyPoisonedCounter || 1;
            const damage = Math.floor((p.maxHp / 16) * counter);
            p.currentHp = Math.max(0, p.currentHp - damage);
            p.badlyPoisonedCounter = counter + 1;
            log.push({ type: 'text', text: `${p.name} was hurt by poison!` });
        }
    },
    {
        name: 'Burn',
        applies: (p, state) => p.status === 'Burned',
        isImmune: (p, state) => getEffectiveAbility(p, state)?.toLowerCase() === 'magic-guard' || getEffectiveAbility(p, state)?.toLowerCase() === 'heatproof',
        execute: (p, state, log) => {
            const damage = Math.floor(p.maxHp / 16);
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} was hurt by its burn!` });
        }
    },
    // --- VOLATILE STATUSES & FIELD EFFECTS ---
    {
        name: 'Leech Seed',
        applies: (p) => p.volatileStatuses.some(s => s.name === 'Leech Seed'),
        isImmune: (p, state) => getEffectiveAbility(p, state)?.toLowerCase() === 'magic-guard',
        execute: (p, state, log) => {
            const leechSeedStatus = p.volatileStatuses.find(s => s.name === 'Leech Seed');
            const damageAmount = Math.max(1, Math.floor(p.maxHp / 8));
            p.currentHp = Math.max(0, p.currentHp - damageAmount);
            log.push({ type: 'text', text: `${p.name}'s health was sapped by Leech Seed!` });

            const seeder = state.teams.flatMap(t => t.pokemon).find(pkmn => pkmn.id === leechSeedStatus.sourceId);
            if (seeder && !seeder.fainted) {
                let healAmount = damageAmount;
                if (seeder.heldItem?.name.toLowerCase() === 'big root') {
                    healAmount = Math.floor(healAmount * 1.3);
                }
                seeder.currentHp = Math.min(seeder.maxHp, seeder.currentHp + healAmount);
                log.push({ type: 'text', text: `${seeder.name} restored a little health!` });
            }
        }
    },
    {
        name: 'Perish Song',
        // Applies if the Pokémon has the Perish Song status
        applies: (p) => p.volatileStatuses.some(s => s.name === 'Perish Song'),
        execute: (p, state, log) => {
            const perishStatus = p.volatileStatuses.find(s => s.name === 'Perish Song');

            if (perishStatus.turnsLeft === 0) {
                // If the counter hits zero, the Pokémon faints
                p.currentHp = 0;
                log.push({ type: 'text', text: `${p.name}'s Perish Song count reached zero!` });
            } else {
                // Otherwise, decrement the counter and log it
                perishStatus.turnsLeft--;
                log.push({ type: 'text', text: `${p.name}'s Perish Song count is now ${perishStatus.turnsLeft}!` });
            }
        }
    },
    {
        name: 'Trapped',
        applies: (p) => p.volatileStatuses.some(s => s.name === 'Trapped'),
        isImmune: (p, state) => getEffectiveAbility(p, state)?.toLowerCase() === 'magic-guard',
        execute: (p, state, log) => {
            const trappedStatus = p.volatileStatuses.find(s => s.name === 'Trapped');
            let damageFraction = 1 / 8;
            const trapper = state.teams.flatMap(t => t.pokemon).find(pkmn => pkmn.id === trappedStatus.sourceId);
            if (trapper && trapper.heldItem?.name.toLowerCase() === 'binding band') {
                damageFraction = 1 / 6;
            }
            const damage = Math.max(1, Math.floor(p.maxHp * damageFraction));
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} is hurt by the trap!` });

            trappedStatus.duration--;
            if (trappedStatus.duration === 0) {
                p.volatileStatuses = p.volatileStatuses.filter(s => s.name !== 'Trapped');
                log.push({ type: 'text', text: `${p.name} was released from the trap.` });
            }
        }
    },
    {
        name: 'Curse',
        applies: (p) => p.volatileStatuses.includes('Cursed'),
        isImmune: (p, state) => getEffectiveAbility(p, state)?.toLowerCase() === 'magic-guard',
        execute: (p, state, log) => {
            const damage = Math.max(1, Math.floor(p.maxHp / 4));
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} is afflicted by the curse!` });
        }
    },
    {
        name: 'Nightmare',
        applies: (p) => p.volatileStatuses.includes('Nightmare') && p.status === 'Asleep',
        isImmune: (p, state) => getEffectiveAbility(p, state)?.toLowerCase() === 'magic-guard',
        execute: (p, state, log) => {
            const damage = Math.max(1, Math.floor(p.maxHp / 4));
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} is trapped in a nightmare!` });
        }
    },
    // --- WEATHER DAMAGE ---
    {
        name: 'Sandstorm',
        applies: (p, state) => state.field.weather === 'sandstorm',
        isImmune: (p, state) => {
            const ability = getEffectiveAbility(p, state)?.toLowerCase();
            return p.types.includes('rock') || p.types.includes('ground') || p.types.includes('steel') ||
                ['sand-veil', 'sand-rush', 'sand-force', 'magic-guard'].includes(ability);
        },
        execute: (p, state, log) => {
            const damage = Math.max(1, Math.floor(p.maxHp / 16));
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} is buffeted by the sandstorm!` });
        }
    },
];

const runEndOfTurnPhase = (currentBattleState, newLog) => {
    const { teams, activePokemonIndices, field } = currentBattleState;

    // 1. Get all active Pokémon, sorted by speed
    const allActivePokemon = teams.flatMap((team) => {
        const activeIndicesForTeam = activePokemonIndices[team.id];
        if (!activeIndicesForTeam) return [];
        return team.pokemon.filter((p, i) => activeIndicesForTeam.includes(i) && p && !p.fainted);
    }).sort((a, b) => {
        const speedA = a.stats.speed * getStatModifier(a.stat_stages.speed);
        const speedB = b.stats.speed * getStatModifier(b.stat_stages.speed);
        return speedB - speedA;
    });

    // 2. Loop through each active Pokémon to apply effects
    allActivePokemon.forEach(pokemon => {
        if (pokemon.fainted) return;

        // Loop through our configuration array
        for (const effect of endOfTurnEffects) {
            if (effect.applies(pokemon, currentBattleState) && (!effect.isImmune || !effect.isImmune(pokemon, currentBattleState))) {
                effect.execute(pokemon, currentBattleState, newLog);
                if (pokemon.currentHp === 0) {
                    pokemon.fainted = true;
                    newLog.push({ type: 'text', text: `${pokemon.name} fainted!` });
                    break; // Stop processing more effects if the Pokémon faints
                }
            }
        }
    });

    // 3. Decrement turns for all field conditions (weather, terrain, etc.)
    const fieldConditions = ['weatherTurns', 'terrainTurns', 'trickRoomTurns', 'magicRoomTurns', 'gravityTurns', 'wonderRoomTurns'];
    const fieldEndMessages = {
        weatherTurns: `The ${field.weather?.replace('-', ' ')} stopped.`,
        terrainTurns: `The ${field.terrain?.replace('-', ' ')} disappeared.`,
        trickRoomTurns: 'The twisted dimensions returned to normal.',
        magicRoomTurns: 'The strange room returned to normal.',
        gravityTurns: 'The gravity returned to normal.',
        wonderRoomTurns: 'The weird dimensions returned to normal.',
    };

    fieldConditions.forEach(condition => {
        if (field[condition] > 0) {
            field[condition]--;
            if (field[condition] === 0) {
                newLog.push({ type: 'text', text: fieldEndMessages[condition] });
                // Reset the specific field state (e.g., field.weather = 'none')
                if (condition === 'weatherTurns') field.weather = 'none';
                if (condition === 'terrainTurns') field.terrain = 'none';
            }
        }
    });
};

export const executeTurn = async (battleState, queuedActions, allTrainers) => {
    if (!battleState) {
        console.error("executeTurn was called with an undefined battleState.");
        return { finalBattleState: battleState, finalLog: [] };
    }
    let currentBattleState = JSON.parse(JSON.stringify(battleState));
    let allActions = { ...queuedActions };
    let newLog = [...currentBattleState.log, { type: 'text', text: `--- Turn ${battleState.turn} ---` }];
    currentBattleState.ejectQueue = [];
    currentBattleState.formChangeQueue = [];
    currentBattleState.forcedSwitchQueue = [];

    const sortedActions = Object.values(allActions).sort((a, b) => {
        let priorityA = (a.type === 'SWITCH' || a.type === 'ITEM') ? 10 : (a.move?.priority || 0);
        let priorityB = (b.type === 'SWITCH' || b.type === 'ITEM') ? 10 : (b.move?.priority || 0);

        // Check for priority-modifying items and statuses
        if (a.quickClawActivated) priorityA += 100;
        if (b.quickClawActivated) priorityB += 100;
        if (a.pokemon.custapBerryActivated) priorityA += 100;
        if (b.pokemon.custapBerryActivated) priorityB += 100;

        // Check for priority-modifying abilities
        if (a.type === 'FIGHT' && getEffectiveAbility(a.pokemon, currentBattleState)?.toLowerCase() === 'prankster') {
            if (a.move.damage_class.name === 'status') priorityA += 1;
        }
        if (b.type === 'FIGHT' && getEffectiveAbility(b.pokemon, currentBattleState)?.toLowerCase() === 'prankster') {
            if (b.move.damage_class.name === 'status') priorityB += 1;
        }
        // This is where you would add other ability priority checks like Gale Wings

        if (priorityA !== priorityB) return priorityB - priorityA;

        // If priority is the same, sort by speed
        const calculateTurnOrderSpeed = (pokemon) => {
            if (!pokemon) return 0;
            let speed = (pokemon.stats?.speed || 0) * getStatModifier(pokemon.stat_stages?.speed || 0);
            if (pokemon.boosterBoost?.stat === 'speed') {
                speed *= pokemon.boosterBoost.multiplier;
            }
            // --- MODIFIED getEffectiveAbility CALLS ---
            const abilityName = getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase();

            // --- ADD THIS BLOCK for Unburden ---
            if (abilityName === 'unburden' && pokemon.originalHeldItem && !pokemon.heldItem) {
                speed *= 2;
            }
            const itemName = pokemon.heldItem?.name.toLowerCase();
            if (pokemon.status === 'Paralyzed') { speed /= 2; }
            if (currentBattleState.field.magicRoomTurns === 0) {
                if (itemName) {
                    if (itemName === 'choice scarf') { speed *= 1.5; }
                    if (itemName === 'iron ball') { speed *= 0.5; }
                }
            }
            if (abilityName === 'stall' || (itemName && ['lagging-tail', 'full-incense'].includes(itemName))) {
                return -1;
            }
            return speed;
        };
        let speedA = calculateTurnOrderSpeed(a.pokemon);
        let speedB = calculateTurnOrderSpeed(b.pokemon);

        if (currentBattleState.field.trickRoomTurns > 0) {
            return speedA - speedB;
        }
        return speedB - speedA;
    });

    for (const action of sortedActions) {
        const actorData = action.pokemon;
        const actorTeamIndex = currentBattleState.teams.findIndex(t => t.pokemon.some(p => p.id === actorData.id));
        const actorTeamId = actorTeamIndex === 0 ? 'players' : 'opponent';
        const actorPokemonIndex = currentBattleState.teams[actorTeamIndex].pokemon.findIndex(p => p.id === actorData.id);
        const actor = currentBattleState.teams[actorTeamIndex].pokemon[actorPokemonIndex];
        currentBattleState.turnOrder = sortedActions.map(action => action.pokemon.id);
        if (actor.fainted) continue;

        if (actor.volatileStatuses.some(s => (s.name || s) === 'Confused')) {
            if (action.willSnapOutOfConfusion) {
                actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Confused');
                newLog.push({ type: 'text', text: `${actor.name} snapped out of its confusion!` });
            } else if (action.willHurtSelfInConfusion) {
                newLog.push({ type: 'text', text: `${actor.name} hurt itself in its confusion!` });
                const confusionMove = { power: 40, damage_class: { name: 'physical' }, type: 'internal' };
                let { damage } = calculateDamage(actor, actor, confusionMove, false, currentBattleState, newLog);
                actor.currentHp = Math.max(0, actor.currentHp - damage);
                if (actor.currentHp === 0) {
                    actor.fainted = true;
                    newLog.push({ type: 'text', text: `${actor.name} fainted!` });
                }
                continue;
            }
        }

        if (actor.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
            const sourceOfLove = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === actor.infatuatedWith);
            if (!sourceOfLove || sourceOfLove.fainted) {
                actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Infatuated');
                actor.infatuatedWith = null;
            } else if (action.isImmobilizedByLove) {
                newLog.push({ type: 'text', text: `${actor.name} is immobilized by love!` });
                continue;
            }
        }

        let canMove = true;
        if (actor.status === 'Asleep') {
            if (action.willWakeUp) { newLog.push({ type: 'text', text: `${actor.name} woke up!` }); actor.status = 'None'; }
            else { newLog.push({ type: 'text', text: `${actor.name} is fast asleep.` }); canMove = false; }
        } else if (actor.status === 'Frozen') {
            if (action.willThaw) { newLog.push({ type: 'text', text: `${actor.name} thawed out!` }); actor.status = 'None'; }
            else { newLog.push({ type: 'text', text: `${actor.name} is frozen solid!` }); canMove = false; }
        } else if (actor.status === 'Paralyzed' && action.isFullyParalyzed) {
            newLog.push({ type: 'text', text: `${actor.name} is fully paralyzed!` }); canMove = false;
        }

        if (!canMove) continue;

        if (action.type === 'FIGHT') {



            const move = { ...actor.moves.find(m => m.name === action.move.name) };
            if (!move.name) continue;

            const moveNameLower = move.name.toLowerCase();
            const actorAbility = actor.ability?.toLowerCase();
            const itemName = actor.heldItem?.name.toLowerCase();

            if (abilityEffects[actorAbility]?.onBeforeMove) {
                abilityEffects[actorAbility].onBeforeMove(actor, move, currentBattleState, newLog);
            }
            if (currentBattleState.field.magicRoomTurns === 0 && itemEffects[itemName]?.onBeforeMove) {
                itemEffects[itemName].onBeforeMove(actor, move, currentBattleState, newLog);
            }

            const actorTeam = currentBattleState.teams[actorTeamIndex];

            if (moveNameLower === 'trick-room') {
                if (currentBattleState.field.trickRoomTurns > 0) {
                    currentBattleState.field.trickRoomTurns = 0;
                    newLog.push({ type: 'text', text: `${actor.name} returned the twisted dimensions to normal!` });
                } else {
                    currentBattleState.field.trickRoomTurns = 5;
                    newLog.push({ type: 'text', text: `${actor.name} twisted the dimensions!` });
                }
                continue;
            }
            if (moveNameLower === 'magic-room') {
                if (currentBattleState.field.magicRoomTurns > 0) {
                    currentBattleState.field.magicRoomTurns = 0;
                    newLog.push({ type: 'text', text: 'The strange room disappeared.' });
                } else {
                    currentBattleState.field.magicRoomTurns = 5;
                    newLog.push({ type: 'text', text: 'It created a strange room where items cant be used!' });
                }
                continue;
            }
            if (moveNameLower === 'gravity') {
                if (currentBattleState.field.gravityTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { currentBattleState.field.gravityTurns = 5; newLog.push({ type: 'text', text: 'Gravity intensified!' }); }
                continue;
            }
            if (moveNameLower === 'wonder-room') {
                if (currentBattleState.field.wonderRoomTurns > 0) {
                    currentBattleState.field.wonderRoomTurns = 0;
                    newLog.push({ type: 'text', text: 'The weird dimensions disappeared.' });
                } else {
                    currentBattleState.field.wonderRoomTurns = 5;
                    newLog.push({ type: 'text', text: 'It created a weird room where Defense and Sp. Def stats are swapped!' });
                }
                continue;
            }
            if (REFLECT_TYPE_MOVES.has(moveNameLower)) {
                if (actorTeam.reflectTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { actorTeam.reflectTurns = (itemName === 'light clay') ? 8 : 5; newLog.push({ type: 'text', text: `A wall of light protected ${actorTeam.id}'s team!` }); }
                continue;
            }
            if (LIGHT_SCREEN_TYPE_MOVES.has(moveNameLower)) {
                if (actorTeam.lightScreenTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { actorTeam.lightScreenTurns = (itemName === 'light clay') ? 8 : 5; newLog.push({ type: 'text', text: `A wall of light protected ${actorTeam.id}'s team from special attacks!` }); }
                continue;
            }
            if (AURORA_VEIL_MOVE.has(moveNameLower)) {
                if (currentBattleState.field.weather !== 'snow') { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else if (actorTeam.auroraVeilTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { actorTeam.auroraVeilTurns = (itemName === 'light clay') ? 8 : 5; newLog.push({ type: 'text', text: `A shimmering veil protected ${actorTeam.id}'s team!` }); }
                continue;
            }
            const terrainToSet = MOVE_TO_TERRAIN_MAP.get(moveNameLower);
            if (terrainToSet) {
                if (currentBattleState.field.terrain !== 'none') { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { currentBattleState.field.terrain = terrainToSet; currentBattleState.field.terrainTurns = (itemName === 'terrain extender') ? 8 : 5; newLog.push({ type: 'text', text: `The battlefield became ${terrainToSet.replace('-', ' ')}!` }); }
                continue;
            }
            const weatherToSet = MOVE_TO_WEATHER_MAP.get(moveNameLower);
            if (weatherToSet) {
                const strongWeathers = ['heavy-rain', 'harsh-sunshine', 'strong-winds'];
                // The move fails if the weather is the same or if a strong weather is active
                if (currentBattleState.field.weather === weatherToSet || strongWeathers.includes(currentBattleState.field.weather)) {
                    newLog.push({ type: 'text', text: 'But it failed!' });
                } else {
                    const requiredRock = WEATHER_EXTENDING_ROCKS[weatherToSet];
                    const duration = (itemName === requiredRock) ? 8 : 5;

                    currentBattleState.field.weather = weatherToSet;
                    currentBattleState.field.weatherTurns = duration;

                    let weatherMessage = `It started to ${weatherToSet}!`;
                    if (weatherToSet === 'sunshine') weatherMessage = 'The sunlight turned harsh!';

                    newLog.push({ type: 'text', text: weatherMessage });
                }
                continue; // Skip to the next action in the turn
            }
            if (moveNameLower === CURSE_MOVE) {
                if (actor.types.includes('ghost')) {
                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                    if (target && !target.volatileStatuses.some(s => (s.name || s) === 'Cursed')) {
                        const hpCost = Math.floor(actor.maxHp / 2);
                        actor.currentHp = Math.max(0, actor.currentHp - hpCost);
                        newLog.push({ type: 'text', text: `${actor.name} cut its own HP to lay a curse!` });
                        target.volatileStatuses.push('Cursed');
                        newLog.push({ type: 'text', text: `${target.name} was cursed!` });
                        if (actor.currentHp === 0) { actor.fainted = true; newLog.push({ type: 'text', text: `${actor.name} fainted!` }); }
                    } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                } else {
                    // --- THIS IS THE CORRECTED LOGIC ---
                    newLog.push({ type: 'text', text: `${actor.name} used Curse!` });
                    let statChangeResult;

                    statChangeResult = calculateStatChange(actor, 'speed', -1, currentBattleState);
                    actor = statChangeResult.updatedTarget;
                    newLog.push(...statChangeResult.newLog);

                    statChangeResult = calculateStatChange(actor, 'attack', 1, currentBattleState);
                    actor = statChangeResult.updatedTarget;
                    newLog.push(...statChangeResult.newLog);

                    statChangeResult = calculateStatChange(actor, 'defense', 1, currentBattleState);
                    actor = statChangeResult.updatedTarget;
                    newLog.push(...statChangeResult.newLog);
                }
                continue;
            }
            if (moveNameLower === NIGHTMARE_MOVE) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target && target.status === 'Asleep' && !target.volatileStatuses.some(s => (s.name || s) === 'Nightmare')) {
                    target.volatileStatuses.push('Nightmare');
                    newLog.push({ type: 'text', text: `${target.name} began having a nightmare!` });
                } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                continue;
            }
            if (moveNameLower === ENCORE_MOVE) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target && target.lastMoveUsed && !target.volatileStatuses.some(s => (s.name || s) === 'Encore')) {
                    target.volatileStatuses.push('Encore');
                    target.encoredMove = target.lastMoveUsed;
                    target.encoreTurns = 3;
                    newLog.push({ type: 'text', text: `${target.name} received an encore!` });
                } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                continue;
            }
            if (moveNameLower === TAUNT_MOVE) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target && !target.volatileStatuses.some(s => (s.name || s) === 'Taunt')) {
                    target.volatileStatuses.push('Taunt');
                    target.tauntTurns = 3;
                    newLog.push({ type: 'text', text: `${target.name} was taunted!` });
                } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                continue;
            }
            if (moveNameLower === INFATUATION_MOVE) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target && actor.gender !== 'Genderless' && target.gender !== 'Genderless' && actor.gender !== target.gender && !target.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
                    target.volatileStatuses.push('Infatuated');
                    target.infatuatedWith = actor.id;
                    newLog.push({ type: 'text', text: `${target.name} fell in love with ${actor.name}!` });

                    // --- NEW DESTINY KNOT LOGIC ---
                    if (target.heldItem?.name.toLowerCase() === 'destiny knot') {
                        // Check if the original attacker can also be infatuated
                        if (!actor.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
                            actor.volatileStatuses.push('Infatuated');
                            actor.infatuatedWith = target.id; // Infatuated with the Destiny Knot holder
                            newLog.push({ type: 'text', text: `${actor.name} fell in love with ${target.name} due to the Destiny Knot!` });
                        }
                    }
                    // --- END NEW LOGIC ---

                } else {
                    newLog.push({ type: 'text', text: 'But it failed!' });
                }
                continue;
            }
            if (ABILITY_SUPPRESSING_MOVES.has(moveNameLower)) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target) {
                    // Ability Shield protects the target
                    if (target.heldItem?.name.toLowerCase() === 'ability-shield') {
                        newLog.push({ type: 'text', text: `${target.name}'s Ability Shield protected it!` });
                    }
                    // Certain abilities cannot be suppressed
                    else if (['multitype', 'stance-change', 'schooling'].includes(getEffectiveAbility(target)?.toLowerCase())) {
                        newLog.push({ type: 'text', text: 'But it failed!' });
                    }
                    // Otherwise, apply the status
                    else {
                        target.volatileStatuses.push('Ability Suppressed');
                        newLog.push({ type: 'text', text: `${target.name}'s ability was suppressed!` });
                    }
                }
                continue; // Skip the rest of the normal move execution
            }
            const replacementAbility = ABILITY_REPLACEMENT_MOVES.get(moveNameLower);
            if (replacementAbility) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target) {
                    // Ability Shield protects the target
                    if (target.heldItem?.name.toLowerCase() === 'ability-shield') {
                        newLog.push({ type: 'text', text: `${target.name}'s Ability Shield protected it!` });
                    }
                    // Certain abilities cannot be replaced
                    else if (['multitype', 'stance-change', 'schooling'].includes(getEffectiveAbility(target)?.toLowerCase())) {
                        newLog.push({ type: 'text', text: 'But it failed!' });
                    }
                    // Otherwise, replace the ability
                    else {
                        // Store the original ability if it hasn't been stored already
                        if (!target.originalAbility) {
                            target.originalAbility = target.ability;
                        }
                        target.ability = replacementAbility;
                        newLog.push({ type: 'text', text: `${target.name}'s ability was changed to ${replacementAbility}!` });
                    }
                }
                continue; // Skip the rest of the normal move execution
            }
            if (TWO_TURN_MOVES.has(moveNameLower)) {
                if (actor.volatileStatuses.includes('Charging')) {
                    actor.volatileStatuses = actor.volatileStatuses.filter(s => s !== 'Charging');
                } else if (!move.powerHerbBoosted) {
                    actor.volatileStatuses.push('Charging');
                    newLog.push({ type: 'text', text: `${actor.name} began charging its move!` });
                    continue;
                }
            }
            if (actor.volatileStatuses.includes('Embargo')) {
                newLog.push({ type: 'text', text: `${actor.name} can't use its ${itemName} because of Embargo!` });
            } else if (currentBattleState.field.magicRoomTurns === 0 && itemEffects[itemName]?.onBeforeMove) {
                itemEffects[itemName].onBeforeMove(actor, move, currentBattleState, newLog);
            }
            if (move.name.toLowerCase() === 'perish song') {
                newLog.push({ type: 'text', text: `${actor.name} used Perish Song!` });

                // Find all active Pokémon on the field
                const allActivePokemon = currentBattleState.teams.flatMap(team =>
                    team.pokemon.filter((p, i) =>
                        currentBattleState.activePokemonIndices[team.id]?.includes(i) && p && !p.fainted
                    )
                );

                // Apply the Perish Song status to each active Pokémon
                allActivePokemon.forEach(pokemon => {
                    // Check if the Pokémon is immune (e.g., due to the Soundproof ability)
                    const ability = getEffectiveAbility(pokemon, currentBattleState)?.toLowerCase();
                    if (ability === 'soundproof') {
                        newLog.push({ type: 'text', text: `${pokemon.name}'s Soundproof blocks the song!` });
                    }
                    // Check if the Pokémon already has the status
                    else if (pokemon.volatileStatuses.some(s => s.name === 'Perish Song')) {
                        newLog.push({ type: 'text', text: `But it had no effect on ${pokemon.name}!` });
                    }
                    // Otherwise, add the status object
                    else {
                        pokemon.volatileStatuses.push({ name: 'Perish Song', turnsLeft: 3 });
                    }
                });

                // Announce the global effect
                newLog.push({ type: 'text', text: 'All Pokémon hearing the song will faint in three turns!' });
                continue; // Skip to the next action in the turn
            }
            const singleTargetMoves = ['specific-move', 'selected-pokemon-me-first', 'all-other-pokemon'];
            const attackerAbility = getEffectiveAbility(actor, currentBattleState)?.toLowerCase();

            // Check if the move is single-target AND the attacker does not have an ability that bypasses redirection
            if (singleTargetMoves.includes(move.target?.name) && attackerAbility !== 'stalwart' && attackerAbility !== 'propeller-tail') {
                let redirector = null;
                const allActivePokemon = currentBattleState.teams.flatMap(t => {
                    const activeIndices = currentBattleState.activePokemonIndices[t.id];
                    return t.pokemon.filter((p, i) => activeIndices.includes(i) && p && !p.fainted && p.id !== actor.id);
                });

                for (const potentialRedirector of allActivePokemon) {
                    const redirectorAbility = getEffectiveAbility(potentialRedirector, currentBattleState)?.toLowerCase();
                    const abilityHook = abilityEffects[redirectorAbility]?.onRedirect;
                    if (abilityHook && abilityHook(move)) {
                        redirector = potentialRedirector;
                        break;
                    }
                }

                if (redirector) {
                    newLog.push({ type: 'text', text: `${redirector.name} drew in the attack!` });
                    action.targetIds = [redirector.id];
                    action.hits = action.hits.map(hit => ({ ...hit, targetId: redirector.id }));
                }
            }
            move.ownerId = actor.id;
            let lastDamageDealt = 0;

            for (const [i, hit] of action.hits.entries()) {
                // The target can be different for each individual hit
                const targetId = hit.targetId;

                let currentTargetId = targetId;
                let originalTarget = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === currentTargetId);

                // Check for Magic Bounce
                if (originalTarget && getEffectiveAbility(originalTarget)?.toLowerCase() === 'magic-bounce' && REFLECTABLE_MOVES.has(moveNameLower)) {
                    currentTargetId = actor.id;
                    newLog.push({ type: 'text', text: `${originalTarget.name} bounced the move back!` });
                }

                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === currentTargetId);
                if (!target || target.fainted) {
                    console.warn(`Missing or fainted target:`, {
                        hitIndex: i,
                        targetId,
                        hits: action.hits,
                        targetIds: action.targetIds,
                        actor: actor.name,
                        move: move.name
                    });
                    newLog.push({ type: 'text', text: 'But there was no target!' });
                    continue;
                }

                // Create a fresh attack log entry for each hit
                const attackEntry = {
                    type: 'attack',
                    attackerName: actor.name,
                    moveName: move.name,
                    defenderName: target.name,
                    isCritical: action.isCritical,
                    damage: 0,
                    effectivenessText: '',
                    fainted: false,
                    breakdown: {},
                    moveType: move?.type ?? 'status',
                    moveCategory: (typeof move?.damage_class === 'object' ? move.damage_class.name : move.damage_class) ?? 'status',
                };

                if (action.willHit) {
                    // --- NEW: Define the statChanger to pass into effects ---
                    const statChanger = (pokemonToChange, stat, change) => {
                        const { updatedTarget, newLog: statLog } = calculateStatChange(pokemonToChange, stat, change, currentBattleState);
                        Object.assign(pokemonToChange, updatedTarget);
                        newLog.push(...statLog);
                    };

                    let { damage } = calculateDamage(actor, target, move, action.isCritical, currentBattleState, newLog);
                    lastDamageDealt = damage;

                    const targetAbility = getEffectiveAbility(target, currentBattleState)?.toLowerCase();
                    const targetItem = target.heldItem?.name.toLowerCase();

                    // --- UPDATED: Pass statChanger to onTakeDamage hooks ---
                    if (abilityEffects[targetAbility]?.onTakeDamage) {
                        damage = abilityEffects[targetAbility].onTakeDamage(damage, target, move, currentBattleState, newLog, getEffectiveAbility(actor), statChanger);
                    }
                    if (itemEffects[targetItem]?.onTakeDamage) {
                        damage = itemEffects[targetItem].onTakeDamage(damage, target, move, currentBattleState, newLog, statChanger);
                    }

                    if (damage > 0) {
                        target.currentHp = Math.max(0, target.currentHp - damage);
                        const itemPreventsContact = ['protective-pads', 'punching-glove'].includes(actor.heldItem?.name.toLowerCase());

                        if (CONTACT_MOVES.has(move.name.toLowerCase()) && !itemPreventsContact) {
                            // --- UPDATED: Pass statChanger to onDamagedByContact hooks ---
                            if (abilityEffects[targetAbility]?.onDamagedByContact && action.applyContactEffect) {
                                abilityEffects[targetAbility].onDamagedByContact(target, actor, newLog, statChanger, currentBattleState);
                            }
                            if (itemEffects[targetItem]?.onDamagedByContact) {
                                itemEffects[targetItem].onDamagedByContact(target, actor, newLog, statChanger, currentBattleState);
                            }
                        }
                    }

                    if (target.currentHp === 0) {
                        target.fainted = true;
                        if (abilityEffects[getEffectiveAbility(actor)?.toLowerCase()]?.onAfterKO) {
                            // --- UPDATED: Pass statChanger to onAfterKO hook ---
                            abilityEffects[getEffectiveAbility(actor).toLowerCase()].onAfterKO(actor, target, newLog, statChanger, currentBattleState);
                        }
                    }

                    // For the very FIRST hit, apply secondary effects like status, stat changes, etc.
                    if (i === 0) {
                        // Apply Trapping status
                        if (damage > 0 && BINDING_MOVES.has(moveNameLower)) {
                            if (!target.volatileStatuses.some(s => s.name === 'Trapped')) {
                                // Determine duration: 7 for Grip Claw, otherwise 4-5 turns.
                                const duration = itemName === 'grip-claw'
                                    ? 7
                                    : Math.random() < 0.5 ? 4 : 5;

                                target.volatileStatuses.push({
                                    name: 'Trapped',
                                    sourceId: actor.id,
                                    duration: duration
                                });
                                newLog.push({ type: 'text', text: `${target.name} was trapped!` });
                            }
                        }

                        // Apply Leech Seed status
                        if (moveNameLower === LEECH_SEED_MOVE) {
                            if (target.types.includes('grass')) { newLog.push({ type: 'text', text: `It doesn't affect ${target.name}...` }); }
                            else if (target.volatileStatuses.some(s => s.name === 'Leech Seed')) { newLog.push({ type: 'text', text: `${target.name} is already seeded!` }); }
                            else {
                                target.volatileStatuses.push({ name: 'Leech Seed', sourceId: actor.id });
                                newLog.push({ type: 'text', text: `${target.name} was seeded!` });
                            }
                        }

                        // Apply Confusion status from a damaging move
                        if (damage > 0 && CONFUSION_INDUCING_MOVES.has(moveNameLower) && action.applyEffect) {
                            if (!target.volatileStatuses.some(s => (s.name || s) === 'Confused')) {
                                target.volatileStatuses.push('Confused');
                                newLog.push({ type: 'text', text: `${target.name} became confused!` });
                            }
                        }

                        // Apply non-volatile status ailments (Burn, Poison, etc.)
                        const ailment = move.meta?.ailment?.name;
                        const ailmentChance = move.meta?.ailment_chance;
                        if (ailment && ailment !== 'none' && ailmentChance > 0 && action.applyEffect && !move.sheerForceBoosted) {
                            if (target.heldItem?.name.toLowerCase() === 'covert-cloak') {
                                newLog.push({ type: 'text', text: `${target.name}'s Covert Cloak protected it from the additional effect!` });
                            } else if (target.status === 'None') {
                                const statusToApply = API_AILMENT_TO_STATUS_MAP[ailment];
                                if (statusToApply) {
                                    const isImmune =
                                        (statusToApply === 'Burned' && target.types.includes('fire')) ||
                                        (statusToApply === 'Frozen' && target.types.includes('ice')) ||
                                        (statusToApply === 'Paralyzed' && target.types.includes('electric')) ||
                                        ((statusToApply === 'Poisoned' || statusToApply === 'Badly Poisoned') && (target.types.includes('poison') || target.types.includes('steel')));

                                    if (!isImmune) {
                                        target.status = statusToApply;
                                        newLog.push({ type: 'text', text: `${target.name} was afflicted with ${statusToApply.toLowerCase()}!` });
                                    }
                                }
                            }
                        }
                        if (move.stat_changes && move.stat_changes.length > 0 && !move.sheerForceBoosted && action.applyEffect) {
                            for (const targetId of action.targetIds) {
                                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === targetId);
                                if (target && !target.fainted) {
                                    // Check for Covert Cloak before applying effect
                                    if (target.heldItem?.name.toLowerCase() === 'covert cloak') {
                                        newLog.push({ type: 'text', text: `${target.name}'s Covert Cloak protected it from the additional effect!` });
                                        continue; // Skip to the next target
                                    }
                                    move.stat_changes.forEach(sc => {
                                        const { updatedTarget, newLog: statLog } = calculateStatChange(target, sc.stat.name, sc.change, currentBattleState);
                                        Object.assign(target, updatedTarget);
                                        newLog.push(...statLog);
                                    });
                                }
                            }
                        }
                    }

                } else {
                    newLog.push({ type: 'text', text: `${actor.name}'s attack missed ${target.name}!` });
                    const itemNameOnMiss = actor.heldItem?.name.toLowerCase();
                    if (itemEffects[itemNameOnMiss]?.onMiss) {
                        itemEffects[itemNameOnMiss].onMiss(actor, move, currentBattleState, newLog, calculateStatChange);
                    }
                    break; // If any hit misses, the entire move's sequence ends
                }
                newLog.push(attackEntry);
            }
            if (actorAbility === 'parental-bond' && lastDamageDealt > 0) {
                newLog.push({ type: 'text', text: 'The parent hit again!' });
                // The second hit does 25% of the original damage.
                const secondHitMove = { ...move, power: move.power * 0.25 };

                for (const targetId of action.targetIds) {
                    const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === targetId);
                    if (target && !target.fainted) {
                        let { damage: secondHitDamage } = calculateDamage(actor, target, secondHitMove, false, currentBattleState, newLog);
                        target.currentHp = Math.max(0, target.currentHp - secondHitDamage);
                        newLog.push({ type: 'text', text: `${target.name} took an additional ${secondHitDamage} damage!` });
                        if (target.currentHp === 0) {
                            target.fainted = true;
                            newLog.push({ type: 'text', text: `${target.name} fainted!` });
                        }
                    }
                }
            }
            if (itemEffects[itemName]?.onAfterMove) { itemEffects[itemName].onAfterMove(actor, move, currentBattleState, newLog); }
            if (itemEffects[itemName]?.onAfterDamageDealt) {
                itemEffects[itemName].onAfterDamageDealt(lastDamageDealt, actor, move, currentBattleState, newLog);
            }
            const moveNameKey = move.name.toLowerCase().replace(/\s/g, '-');
            if (RECOIL_MOVES.has(moveNameKey) && lastDamageDealt > 0 && actor.currentHp > 0 && actorAbility !== 'magic-guard') {
                const recoilFraction = RECOIL_MOVES.get(moveNameKey);
                const recoilDamage = Math.max(1, Math.floor(lastDamageDealt * recoilFraction));
                actor.currentHp = Math.max(0, actor.currentHp - recoilDamage);
                newLog.push({ type: 'text', text: `${actor.name} is damaged by recoil!` });
                if (actor.currentHp === 0) {
                    actor.fainted = true;
                    newLog.push({ type: 'text', text: `${actor.name} fainted!` });
                }
            }
            if (DRAIN_MOVES.has(moveNameKey) && actor.currentHp > 0 && actor.currentHp < actor.maxHp) {
                let healFraction = DRAIN_MOVES.get(moveNameKey);
                let healAmount = Math.max(1, Math.floor(lastDamageDealt * healFraction));

                // Check for Big Root, which increases healing from drain moves
                if (itemName === 'big root') {
                    healAmount = Math.floor(healAmount * 1.3);
                }

                actor.currentHp = Math.min(actor.maxHp, actor.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${actor.name} drained health!` });
            }
            if (move.gemBoosted) { newLog.push({ type: 'text', text: `${actor.name}'s ${actor.heldItem.name} made the move stronger!` }); actor.heldItem = null; }
            if (move.powerHerbBoosted) {
                actor.lastConsumedItem = actor.heldItem;
                actor.heldItem = null;
            }

            actor.lastMoveUsed = move.name;
            if (actor.encoreTurns > 0) {
                actor.encoreTurns--;
                if (actor.encoreTurns === 0) {
                    newLog.push({ type: 'text', text: `${actor.name}'s encore ended.` });
                    actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Encore');
                    actor.encoredMove = null;
                }
            }
            if (actor.tauntTurns > 0) {
                actor.tauntTurns--;
                if (actor.tauntTurns === 0) {
                    newLog.push({ type: 'text', text: `${actor.name}'s taunt ended.` });
                    actor.volatileStatuses = actor.volatileStatuses.filter(s => (s.name || s) !== 'Taunt');
                }
            }
            if (actor.custapBerryActivated) {
                actor.custapBerryActivated = false;
            }
        } else if (action.type === 'Z_MOVE') {
            const { baseMove, pokemon: actor, isCritical } = action;
            const actorTeamId = currentBattleState.teams.find(t => t.pokemon.some(p => p.id === actor.id))?.id;
            if (!actorTeamId || currentBattleState.zMoveUsed[actorTeamId]) continue;

            currentBattleState.zMoveUsed[actorTeamId] = true;
            newLog.push({ type: 'text', text: `${actor.name} is unleashing its full-force Z-Move!` });

            const crystalData = Z_CRYSTAL_MAP[actor.heldItem?.name?.toLowerCase().replace(/\s/g, '-')];
            if (!crystalData) continue;

            const zMoveObject = {
                name: crystalData.moveName,
                power: getZMovePower(baseMove.power),
                type: crystalData.type,
                damage_class: baseMove.damage_class,
                meta: {},
            };
            newLog.push({ type: 'attack', attackerName: actor.name, moveName: zMoveObject.name });

            action.targetIds.forEach(targetId => {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === targetId);
                if (target && !target.fainted) {
                    let { damage, effectiveness } = calculateDamage(actor, target, zMoveObject, isCritical, currentBattleState, newLog);
                    target.currentHp = Math.max(0, target.currentHp - damage);
                    if (effectiveness > 1) newLog.push({ type: 'text', text: "It's super effective!" });
                    if (target.currentHp === 0) {
                        target.fainted = true;
                        newLog.push({ type: 'text', text: `${target.name} fainted!` });
                    }
                }
            });
        } else if (action.type === 'SWITCH') {
            const trainer = allTrainers.find(t => t.id === actor.originalTrainerId);
            const trainerName = trainer ? trainer.name : 'The wild';
            newLog.push({ type: 'text', text: `${trainerName} withdraws ${actor.name}!` });
            if (actor.transformed && actor.basePokemonState) {
                const originalName = actor.basePokemonState.name; // Keep name for log
                // Restore the original state from the backup
                Object.assign(actor, actor.basePokemonState);
                // Clean up the transformation properties
                delete actor.transformed;
                delete actor.basePokemonState;
                newLog.push({ type: 'text', text: `${originalName} reverted to its original form!` });
            }
            // --- Find original data to reset types ---
            if (trainer) { // <-- THIS IS THE FIX
                const originalPokemonData = trainer.roster.find(p => p.id === actor.id);
                if (originalPokemonData) {
                    actor.types = [...originalPokemonData.types];
                }
            }
            if (abilityEffects[getEffectiveAbility(actor)?.toLowerCase()]?.onSwitchOut) {
                abilityEffects[getEffectiveAbility(actor).toLowerCase()].onSwitchOut(actor, currentBattleState, newLog);
            }

            // --- ADD THIS BLOCK TO RESTORE ABILITY ---
            if (actor.originalAbility) {
                actor.ability = actor.originalAbility;
                actor.originalAbility = null; // Clear the stored original ability
            }
            // --- NEW LOGIC: Remove effects from opponents ---
            const opponentTeamIndex = actorTeamIndex === 0 ? 1 : 0;
            const opponentTeam = currentBattleState.teams[opponentTeamIndex];
            if (opponentTeam) {
                opponentTeam.pokemon.forEach(opponent => {
                    if (opponent.volatileStatuses.length > 0) {
                        // Remove any status where the source was the Pokémon switching out
                        opponent.volatileStatuses = opponent.volatileStatuses.filter(status => {
                            const shouldRemove = status.sourceId && status.sourceId === actor.id;
                            if (shouldRemove) {
                                newLog.push({ type: 'text', text: `The ${status.name} effect wore off from ${opponent.name}!` });
                            }
                            return !shouldRemove;
                        });
                    }
                });
            }
            // --- END NEW LOGIC ---

            // Clear the switching Pokémon's own statuses and stat changes
            actor.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
            actor.volatileStatuses = [];
            actor.lockedMove = null;
            const newPokemonGlobalIndex = currentBattleState.teams[actorTeamIndex].pokemon.findIndex(p => p.id === action.newPokemonId);
            if (newPokemonGlobalIndex !== -1) {
                const oldPokemonGlobalIndex = currentBattleState.teams[actorTeamIndex].pokemon.findIndex(p => p.id === actor.id);
                const teamKey = actorTeamId; // Use the already defined actorTeamId
                const slotToUpdate = currentBattleState.activePokemonIndices[teamKey].indexOf(oldPokemonGlobalIndex);

                if (slotToUpdate !== -1) {
                    currentBattleState.activePokemonIndices[teamKey][slotToUpdate] = newPokemonGlobalIndex;
                }
                const newPokemon = currentBattleState.teams[actorTeamIndex].pokemon[newPokemonGlobalIndex];

                if (newPokemon) { // Safety check for the new Pokémon
                    newLog.push({ type: 'text', text: `${trainerName} sends out ${newPokemon.name}!` });
                    runOnSwitchIn([newPokemon], currentBattleState, newLog);
                }
            }
        } else if (action.type === 'ITEM') {
            const trainer = allTrainers.find(t => t.id === actor.originalTrainerId);
            const item = action.item;
            const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetId);
            if (!target || !trainer) continue;
            newLog.push({ type: 'text', text: `${trainer.name} used a ${item.name} on ${target.name}.` });
            const trainerData = allTrainers.find(t => t.id === target.originalTrainerId);
            if (trainerData) {
                const itemInBag = trainerData.inventory.find(i => i.name === item.name);
                if (itemInBag) {
                    itemInBag.quantity -= 1;
                    if (itemInBag.quantity === 0) {
                        trainerData.inventory = trainerData.inventory.filter(i => i.name !== item.name);
                    }
                }
            }
            if (item.category === 'healing') {
                if (target.currentHp === target.maxHp) {
                    newLog.push({ type: 'text', text: 'It had no effect...' });
                } else {
                    const healAmount = item.healAmount || (target.maxHp / 2);
                    target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                    newLog.push({ type: 'text', text: `${target.name} recovered HP!` });
                }
            } else if (item.category === 'revival') {
                if (target.fainted) {
                    target.fainted = false;
                    target.currentHp = Math.floor(target.maxHp * (item.healPercent || 0.5));
                    newLog.push({ type: 'text', text: `${target.name} was revived!` });
                }
            } else if (item.category === 'status-cure') {
                const cureTarget = item.cures;
                if (target.status === cureTarget) {
                    target.status = 'None';
                    newLog.push({ type: 'text', text: `${target.name} was cured of its ${cureTarget.toLowerCase()}!` });
                } else if (cureTarget === 'All') {
                    target.status = 'None';
                    newLog.push({ type: 'text', text: `${target.name}'s status was fully restored!` });
                }
            } else if (item.category === 'stat-boost') {
                const statToBoost = item.stat;
                const boostAmount = item.stages || 2;
                if (target.stat_stages[statToBoost] < 6) {
                    // --- MODIFIED --- Use the new helper function here
                    const { updatedTarget, newLog: statLog } = calculateStatChange(target, statToBoost, boostAmount, currentBattleState);
                    Object.assign(target, updatedTarget);
                    newLog.push(...statLog);
                    newLog.push({ type: 'text', text: `${target.name}'s ${statToBoost.replace('-', ' ')} rose sharply!` });
                } else {
                    newLog.push({ type: 'text', text: `${target.name}'s stats won't go any higher!` });
                }
            }
        }
    }

    runEndOfTurnPhase(currentBattleState, newLog);
    if (currentBattleState.forcedSwitchQueue.length > 0) {
        for (const forcedSwitch of currentBattleState.forcedSwitchQueue) {
            const { teamId, teamKey, slotIndex, pokemonToSwitchOutId, replacementId } = forcedSwitch;

            const team = currentBattleState.teams.find(t => t.id === teamId);
            const pokemonToSwitchOut = team.pokemon.find(p => p.id === pokemonToSwitchOutId);
            const trainer = allTrainers.find(t => t.id === pokemonToSwitchOut.originalTrainerId);

            newLog.push({ type: 'text', text: `${pokemonToSwitchOut.name} was dragged out!` });

            // Reset types and stats of the outgoing Pokémon
            const originalPokemonData = trainer.roster.find(p => p.id === pokemonToSwitchOut.id);
            if (originalPokemonData) {
                pokemonToSwitchOut.types = [...originalPokemonData.types];
            }
            pokemonToSwitchOut.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
            pokemonToSwitchOut.volatileStatuses = [];

            // Perform the switch
            const newPokemonGlobalIndex = team.pokemon.findIndex(p => p.id === replacementId);
            currentBattleState.activePokemonIndices[teamKey][slotIndex] = newPokemonGlobalIndex;
            const newPokemon = team.pokemon[newPokemonGlobalIndex];

            newLog.push({ type: 'text', text: `${trainer.name} sends out ${newPokemon.name}!` });
            runOnSwitchIn([newPokemon], currentBattleState, newLog);
        }
    }

    if (currentBattleState.formChangeQueue.length > 0) {
        currentBattleState.formChangeQueue.forEach(change => {
            const pokemonInState = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === change.pokemon.id);
            if (pokemonInState) {
                if (change.type === 'RESOLVE') {
                    resolveFormChange(pokemonInState, change.form, newLog);
                } else if (change.type === 'REVERT') {
                    revertFormChange(pokemonInState, newLog);
                }
            }
        });
    }

    return { finalBattleState: currentBattleState, finalLog: newLog };
};