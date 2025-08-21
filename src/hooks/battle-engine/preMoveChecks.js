// src/hooks/battle-engine/preMoveChecks.js

export const runPreMoveChecks = (actor, battleState, chanceQueue) => {
    // 1. Check for Infatuation
    if (actor.volatileStatuses.some(s => (s.name || s) === 'Infatuated')) {
        chanceQueue.push({
            key: `isImmobilizedByLove_${actor.id}`,
            label: `Will ${actor.name} be immobilized by love?`,
            chance: 50,
            type: 'Status Check',
            sourceId: actor.id,
        });
    }

    // 2. Check for Confusion
    if (actor.volatileStatuses.some(s => (s.name || s) === 'Confused')) {
        chanceQueue.push({
            key: `willSnapOutOfConfusion_${actor.id}`,
            label: `Will ${actor.name} snap out of confusion?`,
            chance: 33.3,
            type: 'Status Check',
            sourceId: actor.id,
        });
        chanceQueue.push({
            key: `willHurtSelfInConfusion_${actor.id}`,
            label: `Will ${actor.name} hurt itself in confusion?`,
            chance: 33.3,
            type: 'Status Check',
            sourceId: actor.id,
        });
    }

    // 3. Check for Sleep, Freeze, and Paralysis
    if (actor.status === 'Asleep') {
        chanceQueue.push({
            key: `willWakeUp_${actor.id}`,
            label: `Will ${actor.name} wake up?`,
            chance: 33.3,
            type: 'Status Check',
            sourceId: actor.id,
        });
    } else if (actor.status === 'Frozen') {
        chanceQueue.push({
            key: `willThaw_${actor.id}`,
            label: `Will ${actor.name} thaw out?`,
            chance: 20,
            type: 'Status Check',
            sourceId: actor.id,
        });
    } else if (actor.status === 'Paralyzed') {
        chanceQueue.push({
            key: `isFullyParalyzed_${actor.id}`,
            label: `Will ${actor.name} be fully paralyzed?`,
            chance: 25,
            type: 'Status Check',
            sourceId: actor.id,
        });
    }
};