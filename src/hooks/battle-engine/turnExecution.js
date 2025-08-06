import { runStartOfTurnPhase } from './phases/startOfTurn';
import { runMainActionPhase } from './phases/mainAction';
import { runEndOfTurnPhase } from './phases/endOfTurn';
import { getEffectiveAbility, getStatModifier } from './battleUtils';
import { abilityEffects } from './abilityEffects';
import { resolveFormChange } from './stateModifiers';

export const executeTurn = async (battleState, queuedActions, allTrainers) => {
    if (!battleState) {
        console.error("executeTurn was called with an undefined battleState.");
        return { finalBattleState: battleState, finalLog: [] };
    }
    // --- END MASTER DEBUG BLOCK ---
    let currentBattleState = JSON.parse(JSON.stringify(battleState));
    let allActions = { ...queuedActions };
    let newLog = [...currentBattleState.log, { type: 'text', text: `--- Turn ${currentBattleState.turn} ---` }];
    const redirectionMap = new Map();
    currentBattleState.formChangeQueue = [];
    currentBattleState.forcedSwitchQueue = [];

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
        let speedA = calculateTurnOrderSpeed(a.pokemon, currentBattleState);
        let speedB = calculateTurnOrderSpeed(b.pokemon, currentBattleState);

        if (currentBattleState.field.trickRoomTurns > 0) {
            return speedA - speedB;
        }
        return speedB - speedA;
    });
    runStartOfTurnPhase(currentBattleState, sortedActions, newLog);

    // 2. MAIN ACTION PHASE
    runMainActionPhase(currentBattleState, sortedActions, redirectionMap, allTrainers, newLog, allActions);
    runEndOfTurnPhase(currentBattleState, newLog);

    // 3. MID-TURN FORM CHANGE PROCESSING
    // This handles any form changes queued during the main phase (e.g., from Zen Mode).
    if (currentBattleState.formChangeQueue.length > 0) {
        currentBattleState.formChangeQueue.forEach(change => {
            const pokemonInState = currentBattleState.teams.flatMap(t => t.pokemon).find(p => p.id === change.pokemon.id);
            if (pokemonInState) {
                resolveFormChange(pokemonInState, change.form, newLog);
            }
        });
        currentBattleState.formChangeQueue = [];
    }

    // 4. END OF TURN PHASE
    runEndOfTurnPhase(currentBattleState, newLog);

    return { finalBattleState: currentBattleState, finalLog: newLog };
};