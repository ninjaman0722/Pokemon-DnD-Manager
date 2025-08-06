import { getEffectiveAbility, getStatModifier, isGrounded, calculateTurnOrderSpeed } from '../battleUtils';
import { calculateStatChange } from '../stateModifiers';
import { abilityEffects } from '../abilityEffects';
import { itemEffects } from '../itemEffects';

const weatherEffects = [
    {
        name: 'Sandstorm Damage',
        applies: (p, state) => state.field.weather === 'sandstorm',
        isImmune: (p, state) => p.types.includes('rock') || p.types.includes('ground') || p.types.includes('steel') || ['sand-veil', 'sand-rush', 'sand-force', 'magic-guard'].includes(getEffectiveAbility(p, state)?.id),
        execute: (p, state, log) => {
            const damage = Math.max(1, Math.floor(p.maxHp / 16));
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} is buffeted by the sandstorm!` });
        }
    },
    {
        name: 'Grassy Terrain Healing',
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

const itemEffects_eot = [
    {
        name: 'Held Item Effects (Leftovers, etc.)',
        applies: (p, state) => !p.volatileStatuses.includes('Embargo') && state.field.magicRoomTurns === 0 && itemEffects[p.heldItem?.id]?.onEndOfTurn,
        execute: (p, state, log) => itemEffects[p.heldItem.id].onEndOfTurn(p, state, log)
    }
];

const abilityEffects_eot = [
    {
        name: 'Ability Effects (Speed Boost, etc.)',
        applies: (p, state) => abilityEffects[getEffectiveAbility(p, state)?.id]?.onEndOfTurn,
        execute: (p, state, log) => {
            const abilityId = getEffectiveAbility(p, state).id;
            const statChanger = (t, s, c) => {
                const result = calculateStatChange(t, s, c, state);
                Object.assign(t, result.updatedTarget);
                log.push(...result.newLog);
            };
            abilityEffects[abilityId].onEndOfTurn(p, state, log, statChanger);
        }
    }
];
const statusEffects_eot = [
    {
        name: 'Burn Damage',
        applies: (p) => p.status === 'Burned',
        isImmune: (p, state) => ['magic-guard', 'heatproof'].includes(getEffectiveAbility(p, state)?.id),
        execute: (p, state, log) => {
            const damage = Math.floor(p.maxHp / 16);
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} was hurt by its burn!` });
        }
    },
    {
        name: 'Poison Damage',
        applies: (p, state) => p.status === 'Poisoned' && getEffectiveAbility(p, state)?.id !== 'poison-heal',
        isImmune: (p, state) => getEffectiveAbility(p, state)?.id === 'magic-guard',
        execute: (p, state, log) => {
            const damage = Math.floor(p.maxHp / 8);
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} was hurt by poison!` });
        }
    },
    {
        name: 'Badly Poisoned Damage',
        applies: (p, state) => p.status === 'Badly Poisoned' && getEffectiveAbility(p, state)?.id !== 'poison-heal',
        isImmune: (p, state) => getEffectiveAbility(p, state)?.id === 'magic-guard',
        execute: (p, state, log) => {
            const counter = (p.badlyPoisonedCounter || 0) + 1;
            p.badlyPoisonedCounter = counter;
            const damage = Math.floor((p.maxHp / 16) * counter);
            p.currentHp = Math.max(0, p.currentHp - damage);
            log.push({ type: 'text', text: `${p.name} was hurt by poison!` });
        }
    }
];
const volatileStatusEffects_eot = [
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
    {
        name: 'Aqua Ring',
        applies: (p) => p.volatileStatuses.includes('Aqua Ring'),
        execute: (p, state, log) => {
            if (p.currentHp < p.maxHp) {
                const healAmount = Math.max(1, Math.floor(p.maxHp / 16));
                p.currentHp = Math.min(p.maxHp, p.currentHp + healAmount);
                log.push({ type: 'text', text: `${p.name} restored a little health with Aqua Ring!` });
            }
        }
    },
    {
        name: 'Ingrain',
        applies: (p) => p.volatileStatuses.includes('Ingrain'),
        execute: (p, state, log) => {
            if (p.currentHp < p.maxHp) {
                const healAmount = Math.max(1, Math.floor(p.maxHp / 16));
                p.currentHp = Math.min(p.maxHp, p.currentHp + healAmount);
                log.push({ type: 'text', text: `${p.name} absorbed nutrients with its roots!` });
            }
        }
    },
    {
        name: 'Encore Countdown',
        applies: (p) => p.encoreTurns > 0,
        execute: (p, state, log) => {
            p.encoreTurns--;
            if (p.encoreTurns === 0) {
                p.volatileStatuses = p.volatileStatuses.filter(s => (s.name || s) !== 'Encore');
                p.encoredMove = null;
                log.push({ type: 'text', text: `${p.name}'s encore ended.` });
            }
        }
    },
    {
        name: 'Taunt Countdown',
        applies: (p) => p.tauntTurns > 0,
        execute: (p, state, log) => {
            p.tauntTurns--;
            if (p.tauntTurns === 0) {
                p.volatileStatuses = p.volatileStatuses.filter(s => (s.name || s) !== 'Taunt');
                log.push({ type: 'text', text: `${p.name}'s taunt wore off.` });
            }
        }
    },
    {
        name: 'Disable Countdown',
        applies: (p) => p.disableTurns > 0,
        execute: (p, state, log) => {
            p.disableTurns--;
            if (p.disableTurns === 0) {
                const disabledMoveName = p.moves.find(m => m.id === p.disabledMove)?.name || 'the move';
                log.push({ type: 'text', text: `${p.name} is no longer disabled from using ${disabledMoveName}!` });
                p.disabledMove = null;
            }
        }
    },
    {
        name: 'Heal Block Countdown',
        applies: (p) => p.healBlockTurns > 0,
        execute: (p, state, log) => {
            p.healBlockTurns--;
            if (p.healBlockTurns === 0) {
                log.push({ type: 'text', text: `${p.name} can heal again!` });
                p.volatileStatuses = p.volatileStatuses.filter(s => s !== 'Heal Block');
            }
        }
    },
];

export const runEndOfTurnPhase = (currentBattleState, newLog) => {
    console.log("BEGIN: End of Turn Phase");
    const allActivePokemon = currentBattleState.teams.flatMap(t =>
        t.pokemon.filter((p, i) => currentBattleState.activePokemonIndices[t.id]?.includes(i) && p)
    );

    // This helper function will run a set of effects for all Pokémon, sorted by speed.
    const runEffects = (effects, phaseName) => {
        allActivePokemon.sort((a, b) => calculateTurnOrderSpeed(b, currentBattleState) - calculateTurnOrderSpeed(a, currentBattleState));

        for (const pokemon of allActivePokemon) {
            if (pokemon.fainted) continue;

            for (const effect of effects) {
                if (effect.applies(pokemon, currentBattleState) && (!effect.isImmune || !effect.isImmune(pokemon, currentBattleState))) {
                    effect.execute(pokemon, currentBattleState, newLog);
                    if (pokemon.currentHp === 0) {
                        pokemon.fainted = true;
                        newLog.push({ type: 'text', text: `${pokemon.name} fainted!` });
                        break; // Stop processing effects for this fainted Pokémon
                    }
                }
            }
        }
    };

    runEffects(weatherEffects, 'Weather');
    if (currentBattleState.field.futureAttacks?.length > 0) {
        const remainingAttacks = [];
        for (const attack of currentBattleState.field.futureAttacks) {
            attack.turnsLeft--;
            if (attack.turnsLeft === 0) {
                newLog.push({ type: 'text', text: `The attack from ${attack.sourceName} hit!` });
                const targetTeam = currentBattleState.teams[attack.targetTeamIndex];
                const targetIndex = currentBattleState.activePokemonIndices[targetTeam.id][attack.targetSlotIndex];
                const target = targetTeam.pokemon[targetIndex];

                if (target && !target.fainted) {
                    target.currentHp = Math.max(0, target.currentHp - attack.damage);
                    newLog.push({ type: 'text', text: `${target.name} took ${attack.damage} damage!` });
                    if (target.currentHp === 0) {
                        target.fainted = true;
                        newLog.push({ type: 'text', text: `${target.name} fainted!` });
                    }
                }
            } else {
                remainingAttacks.push(attack);
            }
        }
        currentBattleState.field.futureAttacks = remainingAttacks;
    }
    runEffects(itemEffects_eot, 'Held Items');
    runEffects(abilityEffects_eot, 'Abilities');
    runEffects(statusEffects_eot, 'Status Conditions');
    runEffects(volatileStatusEffects_eot, 'Volatile Statuses');

    const { field } = currentBattleState;
    const fieldConditions = ['weatherTurns', 'terrainTurns', 'trickRoomTurns', 'magicRoomTurns', 'gravityTurns', 'wonderRoomTurns'];
    const strongWeathers = ['heavy-rain', 'harsh-sunshine', 'strong-winds'];
    const fieldEndMessages = {
        weatherTurns: `The ${field.weather?.replace('-', ' ')} stopped.`,
        terrainTurns: `The ${field.terrain?.replace('-', ' ')} disappeared.`,
        trickRoomTurns: 'The twisted dimensions returned to normal.',
        magicRoomTurns: 'The strange room returned to normal.',
        gravityTurns: 'The gravity returned to normal.',
        wonderRoomTurns: 'The weird dimensions returned to normal.',
    };

    fieldConditions.forEach(condition => {
        if (condition === 'weatherTurns' && strongWeathers.includes(field.weather)) {
            return;
        }
        if (field[condition] > 0) {
            field[condition]--;
            if (field[condition] === 0) {
                newLog.push({ type: 'text', text: fieldEndMessages[condition] });
                if (condition === 'weatherTurns') field.weather = 'none';
                if (condition === 'terrainTurns') field.terrain = 'none';
            }
        }
    });

    console.log("END: End of Turn Phase");
};