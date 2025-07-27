import { getEffectiveAbility, getStatModifier, isGrounded, getActiveOpponents } from './battleUtils';
import { calculateDamage, getZMovePower } from './damageCalculator';
import { calculateStatChange, handleTransform, resolveFormChange, revertFormChange } from './stateModifiers';
import { runOnSwitchIn } from './fieldManager';
import {
    TYPE_CHART, SELF_STAT_LOWERING_MOVES, CONSECUTIVE_TURN_MOVES, RECOIL_MOVES, DRAIN_MOVES, CONTACT_MOVES, Z_CRYSTAL_MAP, API_AILMENT_TO_STATUS_MAP, CURSE_MOVE, NIGHTMARE_MOVE, REFLECT_TYPE_MOVES, LIGHT_SCREEN_TYPE_MOVES, AURORA_VEIL_MOVE, MOVE_TO_TERRAIN_MAP, MOVE_TO_WEATHER_MAP, WEATHER_EXTENDING_ROCKS, ENCORE_MOVE, TAUNT_MOVE, INFATUATION_MOVE, ABILITY_SUPPRESSING_MOVES, ABILITY_REPLACEMENT_MOVES, TWO_TURN_MOVES, REFLECTABLE_MOVES, BINDING_MOVES, LEECH_SEED_MOVE, CONFUSION_INDUCING_MOVES
} from '../../config/gameData';
import { abilityEffects } from '../../config/abilityEffects';
import { itemEffects } from '../../config/itemEffects';

const endOfTurnEffects = [
    // --- ABILITY-BASED EFFECTS ---
    {
        name: 'Ability Effects',
        applies: (p, state) => {
            const abilityId = getEffectiveAbility(p, state)?.id;
            return abilityEffects[abilityId]?.onEndOfTurn;
        },
        execute: (p, state, log) => {
            const abilityId = getEffectiveAbility(p, state)?.id;
            abilityEffects[abilityId].onEndOfTurn(p, state, log, (t, s, c, l, cs) => {
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
            const itemId = p.heldItem?.id;
            return itemEffects[itemId]?.onEndOfTurn;
        },
        execute: (p, state, log) => {
            const itemId = p.heldItem?.id;
            itemEffects[itemId].onEndOfTurn(p, state, log);
        }
    },
    // --- STATUS-BASED DAMAGE ---
    {
        name: 'Poison',
        applies: (p, state) => p.status === 'Poisoned' && getEffectiveAbility(p, state)?.id !== 'poison-heal',
        isImmune: (p, state) => getEffectiveAbility(p, state)?.id === 'magic-guard',
        execute: (p, state, log) => {
            const damage = Math.floor(p.maxHp / 8);
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} was hurt by poison!` });
        }
    },
    {
        name: 'Badly Poisoned',
        applies: (p, state) => p.status === 'Badly Poisoned' && getEffectiveAbility(p, state)?.id !== 'poison-heal',
        isImmune: (p, state) => getEffectiveAbility(p, state)?.id === 'magic-guard',
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
        isImmune: (p, state) => {
            const abilityId = getEffectiveAbility(p, state)?.id;
            return abilityId === 'magic-guard' || abilityId === 'heatproof';
        },
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
        isImmune: (p, state) => getEffectiveAbility(p, state)?.id === 'magic-guard',
        execute: (p, state, log) => {
            const leechSeedStatus = p.volatileStatuses.find(s => s.name === 'Leech Seed');
            if (leechSeedStatus.justApplied) {
                delete leechSeedStatus.justApplied;
                return;
            }
            const damageAmount = Math.max(1, Math.floor(p.maxHp / 8));
            p.currentHp = Math.max(0, p.currentHp - damageAmount);
            log.push({ type: 'text', text: `${p.name}'s health was sapped by Leech Seed!` });

            const seeder = state.teams.flatMap(t => t.pokemon).find(pkmn => pkmn.id === leechSeedStatus.sourceId);
            if (seeder && !seeder.fainted) {
                let healAmount = damageAmount;
                if (seeder.heldItem?.id === 'big-root') {
                    healAmount = Math.floor(healAmount * 1.3);
                }
                seeder.currentHp = Math.min(seeder.maxHp, seeder.currentHp + healAmount);
                log.push({ type: 'text', text: `${seeder.name} restored a little health!` });
            }
        }
    },
    {
        name: 'Perish Song',
        applies: (p) => p.volatileStatuses.some(s => s.name === 'Perish Song'),
        execute: (p, state, log) => {
            const perishStatus = p.volatileStatuses.find(s => s.name === 'Perish Song');
            if (perishStatus.justApplied) {
                delete perishStatus.justApplied;
                return;
            }
            perishStatus.turnsLeft--;
            log.push({ type: 'text', text: `${p.name}'s Perish Song count is now ${perishStatus.turnsLeft}!` });

            // NOW, check if the counter has reached zero.
            if (perishStatus.turnsLeft === 0) {
                p.currentHp = 0;
                // The log message here is a bit redundant now, but we can keep it for clarity.
                log.push({ type: 'text', text: `${p.name} fainted!` });
            }
        }
    },
    {
        name: 'Trapped',
        applies: (p) => p.volatileStatuses.some(s => s.name === 'Trapped'),
        isImmune: (p, state) => getEffectiveAbility(p, state)?.id === 'magic-guard',
        execute: (p, state, log) => {
            const trappedStatus = p.volatileStatuses.find(s => s.name === 'Trapped');
            let damageFraction = 1 / 8;
            const trapper = state.teams.flatMap(t => t.pokemon).find(pkmn => pkmn.id === trappedStatus.sourceId);
            if (trapper && trapper.heldItem?.id === 'binding-band') {
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
        isImmune: (p, state) => getEffectiveAbility(p, state)?.id === 'magic-guard',
        execute: (p, state, log) => {
            const damage = Math.max(1, Math.floor(p.maxHp / 4));
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} is afflicted by the curse!` });
        }
    },
    {
        name: 'Nightmare',
        applies: (p) => p.volatileStatuses.includes('Nightmare') && p.status === 'Asleep',
        isImmune: (p, state) => getEffectiveAbility(p, state)?.id === 'magic-guard',
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
            const abilityId = getEffectiveAbility(p, state)?.id;
            return p.types.includes('rock') || p.types.includes('ground') || p.types.includes('steel') ||
                ['sand-veil', 'sand-rush', 'sand-force', 'magic-guard'].includes(abilityId);
        },
        execute: (p, state, log) => {
            const damage = Math.max(1, Math.floor(p.maxHp / 16));
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} is buffeted by the sandstorm!` });
        }
    },
    {
        name: 'Grassy Terrain',
        applies: (p, state) => state.field.terrain === 'grassy-terrain' && isGrounded(p, state),
        isImmune: (p, state) => getEffectiveAbility(p, state)?.id === 'magic-guard',
        execute: (p, state, log) => {
            if (p.currentHp < p.maxHp) {
                const healAmount = Math.max(1, Math.floor(p.maxHp / 16));
                p.currentHp = Math.min(p.maxHp, p.currentHp + healAmount);
                log.push({ type: 'text', text: `${p.name} was healed by the Grassy Terrain!` });
            }
        }
    },
];

const runEndOfTurnPhase = (currentBattleState, newLog) => {
    const { teams, activePokemonIndices, field } = currentBattleState;

    const allActivePokemon = teams.flatMap((team) => {
        const activeIndicesForTeam = activePokemonIndices[team.id];
        if (!activeIndicesForTeam) return [];
        return team.pokemon.filter((p, i) => activeIndicesForTeam.includes(i) && p && !p.fainted);
    });

    allActivePokemon.sort((a, b) => { // The crash happens here
        const speedA = a.stats.speed * getStatModifier(a.stat_stages.speed);
        const speedB = b.stats.speed * getStatModifier(b.stat_stages.speed);
        return speedB - speedA;
    });

    allActivePokemon.forEach(pokemon => {
        if (pokemon.fainted) return;
        for (const effect of endOfTurnEffects) {
            if (effect.applies(pokemon, currentBattleState) && (!effect.isImmune || !effect.isImmune(pokemon, currentBattleState))) {
                effect.execute(pokemon, currentBattleState, newLog);
                if (pokemon.currentHp === 0) {
                    pokemon.fainted = true;
                    newLog.push({ type: 'text', text: `${pokemon.name} fainted!` });
                    break;
                }
            }
        }
    });

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
    currentBattleState.forcedSwitchQueue = [];
    currentBattleState.ejectQueue = [];
    let newLog = [...currentBattleState.log, { type: 'text', text: `--- Turn ${battleState.turn} ---` }];
    currentBattleState.formChangeQueue = [];
    if (currentBattleState.turn === 1 && !currentBattleState.startOfBattleAbilitiesResolved) {
        const startingPokemon = [];
        currentBattleState.teams.forEach(team => {
            const activeIndices = currentBattleState.activePokemonIndices[team.id] || [];
            activeIndices.forEach(index => {
                if (team.pokemon[index]) {
                    startingPokemon.push(team.pokemon[index]);
                }
            });
        });
        runOnSwitchIn(startingPokemon, currentBattleState, newLog);
        currentBattleState.startOfBattleAbilitiesResolved = true; // Set flag to prevent re-running
    }
    const allActivePokemon = currentBattleState.teams.flatMap(team =>
        team.pokemon.filter((p, i) => currentBattleState.activePokemonIndices[team.id]?.includes(i) && p && !p.fainted)
    );
    allActivePokemon.forEach(pokemon => {
        if (pokemon.chargingMove && !allActions[pokemon.id]) {
            // Find the original target(s)
            const targetIds = [pokemon.chargingMove.originalTargetId]; // Simplified for singles, can be expanded
            allActions[pokemon.id] = {
                type: 'FIGHT',
                pokemon: pokemon,
                move: pokemon.chargingMove,
                targetIds: targetIds,
                hits: targetIds.map(id => ({ targetId: id })),
                willHit: true,
            };
        }
        if (pokemon.lockedMove && !allActions[pokemon.id]) {
            const move = pokemon.moves.find(m => m.id === pokemon.lockedMove.id);
            if (move) {
                // Find a valid, random target
                const opponentTeam = currentBattleState.teams.find(t => t.id !== pokemon.teamId);
                const validTargets = opponentTeam.pokemon.filter((p, i) => currentBattleState.activePokemonIndices[opponentTeam.id]?.includes(i) && p && !p.fainted);
                const targetId = validTargets[0]?.id; // Simple targeting for now

                if (targetId) {
                    allActions[pokemon.id] = { type: 'FIGHT', pokemon, move, targetIds: [targetId], hits: [{ targetId }], willHit: true };
                }
            };
        }
        if (pokemon.volatileStatuses?.includes('Encore') && pokemon.encoredMove && !allActions[pokemon.id]) {
            const move = pokemon.moves.find(m => m.name === pokemon.encoredMove);
            if (move) {
                // Find a valid target (the first opponent for simplicity)
                const opponentTeam = currentBattleState.teams.find(t => t.id !== pokemon.teamId);
                if (opponentTeam) {
                    const activeOpponentIndices = currentBattleState.activePokemonIndices[opponentTeam.id] || [];
                    const validTarget = opponentTeam.pokemon.find((p, i) => activeOpponentIndices.includes(i) && p && !p.fainted);

                    if (validTarget) {
                        allActions[pokemon.id] = {
                            type: 'FIGHT',
                            pokemon: pokemon,
                            move: move,
                            targetIds: [validTarget.id],
                            hits: [{ targetId: validTarget.id }],
                            willHit: true
                        };
                    }
                }
            }
        }
    });
    const sortedActions = Object.values(allActions).sort((a, b) => {
        let priorityA = (a.type === 'SWITCH' || a.type === 'ITEM') ? 10 : (a.move?.priority || 0);
        let priorityB = (b.type === 'SWITCH' || b.type === 'ITEM') ? 10 : (b.move?.priority || 0);

        if (a.quickClawActivated) priorityA += 100;
        if (b.quickClawActivated) priorityB += 100;
        if (a.pokemon.custapBerryActivated) priorityA += 100;
        if (b.pokemon.custapBerryActivated) priorityB += 100;

        if (a.type === 'FIGHT' && getEffectiveAbility(a.pokemon, currentBattleState)?.id === 'prankster') {
            if (a.move.damage_class.name === 'status') priorityA += 1;
        }
        if (b.type === 'FIGHT' && getEffectiveAbility(b.pokemon, currentBattleState)?.id === 'prankster') {
            if (b.move.damage_class.name === 'status') priorityB += 1;
        }

        if (priorityA !== priorityB) return priorityB - priorityA;

        const calculateTurnOrderSpeed = (pokemon) => {
            if (!pokemon) return 0;
            let speed = (pokemon.stats?.speed || 0) * getStatModifier(pokemon.stat_stages?.speed || 0);
            if (pokemon.boosterBoost?.stat === 'speed') {
                speed *= pokemon.boosterBoost.multiplier;
            }
            const abilityId = getEffectiveAbility(pokemon, currentBattleState)?.id;
            if (abilityId === 'unburden' && pokemon.originalHeldItem && !pokemon.heldItem) {
                speed *= 2;
            }
            const itemId = pokemon.heldItem?.id;
            if (abilityEffects[abilityId]?.onModifyStat) {
                speed = abilityEffects[abilityId].onModifyStat('speed', speed, pokemon, currentBattleState);
            }
            if (pokemon.status === 'Paralyzed') { speed /= 2; }
            if (currentBattleState.field.magicRoomTurns === 0) {
                if (itemId) {
                    if (itemId === 'choice-scarf') { speed *= 1.5; }
                    if (itemId === 'iron-ball') { speed *= 0.5; }
                }
            }
            if (abilityId === 'stall' || (itemId && ['lagging-tail', 'full-incense'].includes(itemId))) {
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
        if (actorTeamIndex === -1) continue;
        const actorTeam = currentBattleState.teams[actorTeamIndex];
        const actorPokemonIndex = actorTeam.pokemon.findIndex(p => p.id === actorData.id);
        let actor = actorTeam.pokemon[actorPokemonIndex];

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
            const move = { ...actor.moves.find(m => m.id === action.move.id) };
            if (!move.id) continue;

            let modifiedMove = move;

            if (move.id === 'facade' && ['Burned', 'Poisoned', 'Badly Poisoned', 'Paralyzed'].includes(actor.status)) {
                move.power *= 2;
                newLog.push({ type: 'text', text: `${actor.name}'s Facade is boosted by its status condition!` });
            }
            if (!actor.chargingMove) {
                newLog.push({ type: 'text', text: `${actor.name} used ${move.name}!` });
            }
            const moveId = move.id;
            const actorAbilityId = getEffectiveAbility(actor, currentBattleState)?.id;
            const itemId = actor.heldItem?.id;

            if (itemEffects[itemId]?.onModifyMove) {
                itemEffects[itemId].onModifyMove(move, actor, currentBattleState);
            }
            if (abilityEffects[actorAbilityId]?.onBeforeMove) {
                abilityEffects[actorAbilityId].onBeforeMove(actor, move, currentBattleState, newLog);
            }
            if (currentBattleState.field.magicRoomTurns === 0 && itemEffects[itemId]?.onBeforeMove) {
                itemEffects[itemId].onBeforeMove(actor, move, currentBattleState, newLog);
            }

            if (moveId === 'trick-room') {
                if (currentBattleState.field.trickRoomTurns > 0) {
                    currentBattleState.field.trickRoomTurns = 0;
                    newLog.push({ type: 'text', text: `${actor.name} returned the twisted dimensions to normal!` });
                } else {
                    currentBattleState.field.trickRoomTurns = 5;
                    newLog.push({ type: 'text', text: `${actor.name} twisted the dimensions!` });
                }
                continue;
            }
            if (moveId === 'magic-room') {
                if (currentBattleState.field.magicRoomTurns > 0) {
                    currentBattleState.field.magicRoomTurns = 0;
                    newLog.push({ type: 'text', text: 'The strange room disappeared.' });
                } else {
                    currentBattleState.field.magicRoomTurns = 5;
                    newLog.push({ type: 'text', text: 'It created a strange room where items cant be used!' });
                }
                continue;
            }
            if (moveId === 'gravity') {
                if (currentBattleState.field.gravityTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { currentBattleState.field.gravityTurns = 5; newLog.push({ type: 'text', text: 'Gravity intensified!' }); }
                continue;
            }
            if (moveId === 'wonder-room') {
                if (currentBattleState.field.wonderRoomTurns > 0) {
                    currentBattleState.field.wonderRoomTurns = 0;
                    newLog.push({ type: 'text', text: 'The weird dimensions disappeared.' });
                } else {
                    currentBattleState.field.wonderRoomTurns = 5;
                    newLog.push({ type: 'text', text: 'It created a weird room where Defense and Sp. Def stats are swapped!' });
                }
                continue;
            }
            if (REFLECT_TYPE_MOVES.has(moveId)) {
                if (actorTeam.reflectTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { actorTeam.reflectTurns = (itemId === 'light-clay') ? 8 : 5; newLog.push({ type: 'text', text: `A wall of light protected ${actorTeam.id}'s team!` }); }
                continue;
            }
            if (LIGHT_SCREEN_TYPE_MOVES.has(moveId)) {
                if (actorTeam.lightScreenTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { actorTeam.lightScreenTurns = (itemId === 'light-clay') ? 8 : 5; newLog.push({ type: 'text', text: `A wall of light protected ${actorTeam.id}'s team from special attacks!` }); }
                continue;
            }
            if (AURORA_VEIL_MOVE.has(moveId)) {
                if (currentBattleState.field.weather !== 'snow') { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else if (actorTeam.auroraVeilTurns > 0) { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { actorTeam.auroraVeilTurns = (itemId === 'light-clay') ? 8 : 5; newLog.push({ type: 'text', text: `A shimmering veil protected ${actorTeam.id}'s team!` }); }
                continue;
            }
            const terrainToSet = MOVE_TO_TERRAIN_MAP.get(moveId);
            if (terrainToSet) {
                if (currentBattleState.field.terrain !== 'none') { newLog.push({ type: 'text', text: 'But it failed!' }); }
                else { currentBattleState.field.terrain = terrainToSet; currentBattleState.field.terrainTurns = (itemId === 'terrain-extender') ? 8 : 5; newLog.push({ type: 'text', text: `The battlefield became ${terrainToSet.replace('-', ' ')}!` }); }
                continue;
            }
            const weatherToSet = MOVE_TO_WEATHER_MAP.get(moveId);
            if (weatherToSet) {
                const strongWeathers = ['heavy-rain', 'harsh-sunshine', 'strong-winds'];
                if (currentBattleState.field.weather === weatherToSet || strongWeathers.includes(currentBattleState.field.weather)) {
                    newLog.push({ type: 'text', text: 'But it failed!' });
                } else {
                    const requiredRockId = WEATHER_EXTENDING_ROCKS[weatherToSet]?.replace(/\s/g, '-');
                    const duration = (itemId === requiredRockId) ? 8 : 5;
                    currentBattleState.field.weather = weatherToSet;
                    currentBattleState.field.weatherTurns = duration;
                    let weatherMessage = `It started to ${weatherToSet}!`;
                    if (weatherToSet === 'sunshine') weatherMessage = 'The sunlight turned harsh!';
                    newLog.push({ type: 'text', text: weatherMessage });
                }
                continue;
            }
            if (move.damage_class.name === 'status' && move.stat_changes?.length > 0) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target && !target.fainted) {
                    newLog.push({ type: 'text', text: `${actor.name} used ${move.name}!` });
                    move.stat_changes.forEach(sc => {
                        const { updatedTarget, newLog: statLog } = calculateStatChange(target, sc.stat.name, sc.change, currentBattleState);
                        // Mutate the object in the state tree directly
                        Object.assign(target, updatedTarget);
                        newLog.push(...statLog);
                    });
                } else {
                    newLog.push({ type: 'text', text: 'But it failed!' });
                }
                continue; // This move is done, so skip to the next action.
            }
            if (moveId === CURSE_MOVE) {
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
                }
            }
            if (moveId === CURSE_MOVE && !actor.types.includes('ghost')) {
                newLog.push({ type: 'text', text: `${actor.name} used Curse!` });
                const changes = [{ stat: 'speed', change: -1 }, { stat: 'attack', change: 1 }, { stat: 'defense', change: 1 }];
                changes.forEach(({ stat, change }) => {
                    const { updatedTarget, newLog: statLog } = calculateStatChange(actor, stat, change, currentBattleState);
                    Object.assign(actor, updatedTarget);
                    newLog.push(...statLog);
                });
                continue;
            }
            if (moveId === NIGHTMARE_MOVE) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target && target.status === 'Asleep' && !target.volatileStatuses.some(s => (s.name || s) === 'Nightmare')) {
                    target.volatileStatuses.push('Nightmare');
                    newLog.push({ type: 'text', text: `${target.name} began having a nightmare!` });
                } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                continue;
            }
            if (moveId === ENCORE_MOVE) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target && target.lastMoveUsed && !target.volatileStatuses.some(s => (s.name || s) === 'Encore')) {
                    target.volatileStatuses.push('Encore');
                    target.encoredMove = target.lastMoveUsed;
                    target.encoreTurns = 3;
                    newLog.push({ type: 'text', text: `${target.name} received an encore!` });
                } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                continue;
            }
            if (moveId === TAUNT_MOVE) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target && !target.volatileStatuses.some(s => (s.name || s) === 'Taunt')) {
                    target.volatileStatuses.push('Taunt');
                    target.tauntTurns = 3;
                    newLog.push({ type: 'text', text: `${target.name} was taunted!` });
                } else { newLog.push({ type: 'text', text: 'But it failed!' }); }
                continue;
            }
            if (moveId === INFATUATION_MOVE) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target && actor.gender !== 'Genderless' && target.gender !== 'Genderless' && actor.gender !== target.gender && !target.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
                    target.volatileStatuses.push('Infatuated');
                    target.infatuatedWith = actor.id;
                    newLog.push({ type: 'text', text: `${target.name} fell in love with ${actor.name}!` });

                    // --- NEW DESTINY KNOT LOGIC ---
                    if (target.heldItem?.id === 'destiny-knot') {
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
            if (ABILITY_SUPPRESSING_MOVES.has(moveId)) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target) {
                    if (target.heldItem?.id === 'ability-shield') {
                        newLog.push({ type: 'text', text: `${target.name}'s Ability Shield protected it!` });
                    } else if (['multitype', 'stance-change', 'schooling'].includes(getEffectiveAbility(target)?.id)) {
                        newLog.push({ type: 'text', text: 'But it failed!' });
                    } else {
                        target.volatileStatuses.push('Ability Suppressed');
                        newLog.push({ type: 'text', text: `${target.name}'s ability was suppressed!` });
                    }
                }
                continue;
            }
            const replacementAbilityInfo = ABILITY_REPLACEMENT_MOVES.get(moveId);
            if (replacementAbilityInfo) {
                const target = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === action.targetIds[0]);
                if (target) {
                    if (target.heldItem?.id === 'ability-shield') {
                        newLog.push({ type: 'text', text: `${target.name}'s Ability Shield protected it!` });
                    } else if (['multitype', 'stance-change', 'schooling', 'trace'].includes(getEffectiveAbility(target)?.id)) {
                        newLog.push({ type: 'text', text: 'But it failed!' });
                    } else {
                        if (!target.originalAbility) {
                            target.originalAbility = target.ability;
                        }
                        // The map provides the ID, we create the full ability object
                        target.ability = {
                            id: replacementAbilityInfo,
                            name: replacementAbilityInfo.charAt(0).toUpperCase() + replacementAbilityInfo.slice(1)
                        };
                        newLog.push({ type: 'text', text: `${target.name}'s ability was changed to ${target.ability.name}!` });
                    }
                }
                continue;
            }
            if (TWO_TURN_MOVES.has(moveId)) {
                if (actor.volatileStatuses.includes('Charging')) {
                    // This is the attacking turn. Remove the status and the stored move.
                    actor.volatileStatuses = actor.volatileStatuses.filter(s => s !== 'Charging');
                    actor.chargingMove = null;
                } else if (!move.powerHerbBoosted) {
                    // This is the charging turn. Store the move and its target, then skip.
                    actor.volatileStatuses.push('Charging');
                    actor.chargingMove = { ...move, originalTargetId: action.targetIds[0] };
                    newLog.push({ type: 'text', text: `${actor.name} began charging its move!` });
                    continue;
                }
            }
            if (CONSECUTIVE_TURN_MOVES.has(moveId) && !actor.lockedMove) {
                // Start the rampage
                actor.lockedMove = { id: moveId, turns: 2 + Math.floor(Math.random() * 2) }; // Lock in for 2-3 turns
            }
            if (actor.lockedMove) {
                actor.lockedMove.turns--;
                if (actor.lockedMove.turns === 0) {
                    actor.lockedMove = null;
                    // Check for confusion only if the rampage ended naturally
                    if (!actor.fainted) {
                        newLog.push({ type: 'text', text: `${actor.name} became confused due to fatigue!` });
                        actor.volatileStatuses.push('Confused');
                    }
                }
            }
            if (actor.volatileStatuses.includes('Embargo')) {
                newLog.push({ type: 'text', text: `${actor.name} can't use its ${itemId} because of Embargo!` });
            } else if (currentBattleState.field.magicRoomTurns === 0 && itemEffects[itemId]?.onBeforeMove) {
                itemEffects[itemId].onBeforeMove(actor, move, currentBattleState, newLog);
            }
            if (moveId === 'perish-song') {
                newLog.push({ type: 'text', text: `${actor.name} used ${move.name}!` });
                const allActivePokemon = currentBattleState.teams.flatMap(team =>
                    team.pokemon.filter((p, i) =>
                        currentBattleState.activePokemonIndices[team.id]?.includes(i) && p && !p.fainted
                    )
                );
                allActivePokemon.forEach(pokemon => {
                    // CORRECTED: Check the ability ID
                    const abilityId = getEffectiveAbility(pokemon, currentBattleState)?.id;
                    if (abilityId === 'soundproof') {
                        newLog.push({ type: 'text', text: `${pokemon.name}'s Soundproof blocks the song!` });
                    }
                    else if (pokemon.volatileStatuses.some(s => s.name === 'Perish Song')) {
                        // This part is fine
                    }
                    else {
                        pokemon.volatileStatuses.push({ name: 'Perish Song', turnsLeft: 3, justApplied: true });
                    }
                });
                newLog.push({ type: 'text', text: 'All Pokémon hearing the song will faint in three turns!' });
                continue;
            }
            const singleTargetMoves = ['specific-move', 'selected-pokemon-me-first', 'all-other-pokemon'];

            // Check if the move is single-target AND the attacker does not have an ability that bypasses redirection
            if (singleTargetMoves.includes(move.target?.name) && actorAbilityId !== 'stalwart' && actorAbilityId !== 'propeller-tail') {
                let redirector = null;
                const allActivePokemon = currentBattleState.teams.flatMap(t => {
                    const activeIndices = currentBattleState.activePokemonIndices[t.id];
                    return t.pokemon.filter((p, i) => activeIndices.includes(i) && p && !p.fainted && p.id !== actor.id);
                });

                for (const potentialRedirector of allActivePokemon) {
                    // CORRECTED: use `.id`
                    const redirectorAbilityId = getEffectiveAbility(potentialRedirector, currentBattleState)?.id;
                    const abilityHook = abilityEffects[redirectorAbilityId]?.onRedirect;
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
                if (originalTarget && getEffectiveAbility(originalTarget)?.id === 'magic-bounce' && REFLECTABLE_MOVES.has(moveId)) {
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
                const targetAbilityId = getEffectiveAbility(target, currentBattleState)?.id;
                const targetItemId = target.heldItem?.id;
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
                    const statChanger = (pokemonToChange, stat, change) => {
                        const { updatedTarget, newLog: statLog } = calculateStatChange(pokemonToChange, stat, change, currentBattleState);
                        Object.assign(pokemonToChange, updatedTarget);
                        newLog.push(...statLog);
                    };

                    let { damage, effectiveness, isCritical: finalIsCritical } = calculateDamage(actor, target, move, action.isCritical, currentBattleState, newLog);

                    attackEntry.isCritical = finalIsCritical;
                    attackEntry.damage = damage;

                    lastDamageDealt = damage;
                    if (effectiveness === 0) {
                        attackEntry.effectivenessText = "It had no effect...";
                    } else if (effectiveness > 1) {
                        attackEntry.effectivenessText = "It's super effective!";
                    } else if (effectiveness < 1) {
                        attackEntry.effectivenessText = "It's not very effective...";
                    }
                    if (abilityEffects[targetAbilityId]?.onTakeDamage) {
                        damage = abilityEffects[targetAbilityId].onTakeDamage(damage, target, move, currentBattleState, newLog, actorAbilityId, statChanger);
                    }
                    if (itemEffects[targetItemId]?.onTakeDamage) {
                        damage = itemEffects[targetItemId].onTakeDamage(damage, target, move, currentBattleState, newLog, actorAbilityId, statChanger);
                    }
                    const actualDamageDealt = Math.min(target.currentHp, damage);
                    lastDamageDealt = actualDamageDealt;
                    if (actualDamageDealt > 0) {
                        target.currentHp -= actualDamageDealt;
                        const attackerMakesContact = CONTACT_MOVES.has(moveId);
                        const itemPreventsContact = ['protective-pads', 'punching-glove'].includes(actor.heldItem?.id);
                        if (attackerMakesContact && !itemPreventsContact && action.applyEffect !== false) {
                            const defenderAbility = abilityEffects[target.ability?.id];
                            if (defenderAbility?.onDamagedByContact) {
                                defenderAbility.onDamagedByContact(target, actor, newLog);
                            }
                            const defenderItem = itemEffects[target.heldItem?.id];
                            if (defenderItem?.onDamagedByContact) {
                                defenderItem.onDamagedByContact(target, actor, currentBattleState, newLog);
                            }
                        }
                    }
                    if (damage === 0 && effectiveness === 0) {
                        const targetAbilityId = getEffectiveAbility(target, currentBattleState)?.id;
                        if ((targetAbilityId === 'volt-absorb' && move.type === 'electric') ||
                            (targetAbilityId === 'water-absorb' && move.type === 'water')) {
                            if (target.currentHp < target.maxHp) {
                                const healAmount = Math.floor(target.maxHp / 4);
                                target.currentHp = Math.min(target.maxHp, target.currentHp + healAmount);
                                newLog.push({ type: 'text', text: `${target.name}'s ${target.ability.name} restored its health!` });
                            }
                        }
                    }
                    if (target.currentHp === 0) {
                        target.fainted = true;
                        // CORRECTED: Use the `actorAbilityId` variable defined at the top.
                        if (abilityEffects[actorAbilityId]?.onAfterKO) {
                            abilityEffects[actorAbilityId].onAfterKO(actor, target, newLog, statChanger, currentBattleState);
                        }
                    }

                    // For the very FIRST hit, apply secondary effects like status, stat changes, etc.
                    if (i === 0) {
                        // Apply Trapping status
                        if (damage > 0 && BINDING_MOVES.has(moveId)) {
                            if (!target.volatileStatuses.some(s => s.name === 'Trapped')) {
                                // Determine duration: 7 for Grip Claw, otherwise 4-5 turns.
                                const duration = itemId === 'grip-claw'
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
                        if (moveId === LEECH_SEED_MOVE) {
                            if (target.types.includes('grass')) { newLog.push({ type: 'text', text: `It doesn't affect ${target.name}...` }); }
                            else if (target.volatileStatuses.some(s => s.name === 'Leech Seed')) { newLog.push({ type: 'text', text: `${target.name} is already seeded!` }); }
                            else {
                                // ADD THE justApplied FLAG HERE
                                target.volatileStatuses.push({ name: 'Leech Seed', sourceId: actor.id, justApplied: true });
                                newLog.push({ type: 'text', text: `${target.name} was seeded!` });
                            }
                        }

                        // Apply Confusion status from a damaging move
                        if (damage > 0 && CONFUSION_INDUCING_MOVES.has(moveId) && action.applyEffect) {
                            if (!target.volatileStatuses.some(s => (s.name || s) === 'Confused')) {
                                target.volatileStatuses.push('Confused');
                                newLog.push({ type: 'text', text: `${target.name} became confused!` });
                            }
                        }

                        // Apply non-volatile status ailments (Burn, Poison, etc.)
                        const ailment = move.meta?.ailment?.name;
                        const ailmentChance = move.meta?.ailment_chance;

                        if (ailment && ailment !== 'none' && ailmentChance > 0 && action.applyEffect) {
                            if (target.status === 'None') {
                                const statusToApply = API_AILMENT_TO_STATUS_MAP[ailment];
                                if (statusToApply) {
                                    // Check for type immunities to status
                                    const isImmune =
                                        (statusToApply === 'Paralyzed' && target.types.includes('electric')) ||
                                        (statusToApply === 'Burned' && target.types.includes('fire')) ||
                                        (statusToApply === 'Frozen' && target.types.includes('ice')) ||
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
                                    if (target.heldItem?.id === 'covert-cloak') {
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
                    const itemIdOnMiss = actor.heldItem?.name.toLowerCase();
                    if (itemEffects[itemIdOnMiss]?.onMiss) {
                        itemEffects[itemIdOnMiss].onMiss(actor, move, currentBattleState, newLog, calculateStatChange);
                    }
                    break; // If any hit misses, the entire move's sequence ends
                }
                newLog.push(attackEntry);
            }
            if (actorAbilityId === 'parental-bond' && lastDamageDealt > 0) {
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
            if (itemEffects[itemId]?.onAfterDamageDealt) {
                itemEffects[itemId].onAfterDamageDealt(lastDamageDealt, actor, move, currentBattleState, newLog);
            }
            if (RECOIL_MOVES.has(move.id) && lastDamageDealt > 0 && actor.currentHp > 0 && actorAbilityId !== 'magic-guard') {
                const recoilFraction = RECOIL_MOVES.get(move.id);
                const recoilDamage = Math.max(1, Math.floor(lastDamageDealt * recoilFraction));
                actor.currentHp = Math.max(0, actor.currentHp - recoilDamage);
                newLog.push({ type: 'text', text: `${actor.name} is damaged by recoil!` });
                if (actor.currentHp === 0) {
                    actor.fainted = true;
                    newLog.push({ type: 'text', text: `${actor.name} fainted!` });
                }
            }

            if (DRAIN_MOVES.has(move.id) && lastDamageDealt > 0 && actor.currentHp > 0 && actor.currentHp < actor.maxHp) {
                let healFraction = DRAIN_MOVES.get(move.id);
                let healAmount = Math.max(1, Math.floor(lastDamageDealt * healFraction));
                if (actor.heldItem?.id === 'big-root') {
                    healAmount = Math.floor(healAmount * 1.3);
                }
                actor.currentHp = Math.min(actor.maxHp, actor.currentHp + healAmount);
                newLog.push({ type: 'text', text: `${actor.name} drained health!` });
            }

            const selfStatChanges = SELF_STAT_LOWERING_MOVES.get(move.id);
            if (selfStatChanges) {
                let statsWereLowered = false;
                selfStatChanges.forEach(sc => {
                    if (sc.change < 0) {
                        statsWereLowered = true;
                    }
                    const { updatedTarget, newLog: statLog } = calculateStatChange(actor, sc.stat, sc.change, currentBattleState);
                    Object.assign(actor, updatedTarget);
                    newLog.push(...statLog);
                });

                if (statsWereLowered) {
                    const actorItemId = actor.heldItem?.id;
                    if (actorItemId && itemEffects[actorItemId]?.onStatLowered) {
                        itemEffects[actorItemId].onStatLowered(actor, currentBattleState, newLog);
                    }
                }
            }

            if (move.gemBoosted) {
                newLog.push({ type: 'text', text: `${actor.name}'s ${actor.heldItem.name} made the move stronger!` });
                actor.heldItem = null;
            }
            if (move.powerHerbBoosted) {
                actor.lastConsumedItem = actor.heldItem;
                actor.heldItem = null;
            }

            const choiceItems = ['choice-band', 'choice-specs', 'choice-scarf'];
            const actorItemId = actor.heldItem?.id;
            if (actorItemId && choiceItems.includes(actorItemId) && !actor.lockedMove) {
                actor.lockedMove = { id: move.id };
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
            actor.teamId = currentBattleState.teams.find(t => t.pokemon.some(p => p.id === actor.id))?.id;
            if (!actor.teamId || currentBattleState.zMoveUsed[actor.teamId]) continue;

            currentBattleState.zMoveUsed[actor.teamId] = true;
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
                const originalName = actor.basePokemonState.name;
                Object.assign(actor, actor.basePokemonState);
                delete actor.transformed;
                delete actor.basePokemonState;
                newLog.push({ type: 'text', text: `${originalName} reverted to its original form!` });
            }
            // --- Find original data to reset types ---
            if (trainer) {
                const originalPokemonData = trainer.roster.find(p => p.id === actor.id);
                if (originalPokemonData) {
                    actor.types = [...originalPokemonData.types];
                }
            }
            const actorAbilityIdOnSwitch = getEffectiveAbility(actor)?.id;
            if (abilityEffects[actorAbilityIdOnSwitch]?.onSwitchOut) {
                abilityEffects[actorAbilityIdOnSwitch].onSwitchOut(actor, currentBattleState, newLog);
            }
            // Reset the ability to its original state
            if (actor.originalAbility) {
                actor.ability = actor.originalAbility;
                actor.originalAbility = null;
            }
            // --- NEW LOGIC: Remove effects from opponents ---
            const opponentTeamIndex = actor.teamIndex === 0 ? 1 : 0;
            const opponentTeam = currentBattleState.teams[opponentTeamIndex];
            if (opponentTeam) {
                opponentTeam.pokemon.forEach(opponent => {
                    if (opponent.volatileStatuses.length > 0) {
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


            // Clear the switching Pokémon's own statuses and stat changes
            actor.stat_stages = { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 };
            actor.volatileStatuses = [];
            actor.lockedMove = null;
            const newPokemonGlobalIndex = currentBattleState.teams[actorTeamIndex].pokemon.findIndex(p => p.id === action.newPokemonId);
            if (newPokemonGlobalIndex !== -1) {
                // Use the correct 'actorTeamIndex' variable instead of the non-existent 'actor.teamIndex'
                const oldPokemonGlobalIndex = currentBattleState.teams[actorTeamIndex].pokemon.findIndex(p => p.id === actor.id);
                const teamKey = actorTeam.id;
                const slotToUpdate = currentBattleState.activePokemonIndices[teamKey].indexOf(oldPokemonGlobalIndex);

                if (slotToUpdate !== -1) {
                    currentBattleState.activePokemonIndices[teamKey][slotToUpdate] = newPokemonGlobalIndex;
                }
                const newPokemon = currentBattleState.teams[actorTeamIndex].pokemon[newPokemonGlobalIndex];

                if (newPokemon) {
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

        if (currentBattleState.forcedSwitchQueue.length > 0) {
            for (const forcedSwitch of currentBattleState.forcedSwitchQueue) {
                const { teamId, teamKey, slotIndex, pokemonToSwitchOutId, replacementId } = forcedSwitch;

                const team = currentBattleState.teams.find(t => t.id === teamId);
                // --- THIS IS THE FIX ---
                // Find the Pokémon object *within the current state* using its ID from the queue.
                const pokemonToSwitchOut = team.pokemon.find(p => p.id === pokemonToSwitchOutId);
                if (!pokemonToSwitchOut) continue; // Safety check

                // Now the 'trainer' lookup will succeed because pokemonToSwitchOut is the correct, full object.
                const trainer = allTrainers.find(t => t.id === pokemonToSwitchOut.originalTrainerId);
                // --- END FIX ---

                // The rest of the logic should now work correctly.
                newLog.push({ type: 'text', text: `${pokemonToSwitchOut.name} was dragged out!` });

                if (trainer) { // Add a check for trainer to be safe
                    const originalPokemonData = trainer.roster.find(p => p.id === pokemonToSwitchOut.id);
                    if (originalPokemonData) {
                        pokemonToSwitchOut.types = [...originalPokemonData.types];
                    }
                }

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
    }
    runEndOfTurnPhase(currentBattleState, newLog);
    return { finalBattleState: currentBattleState, finalLog: newLog };
};