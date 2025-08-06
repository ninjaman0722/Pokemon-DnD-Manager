import { getEffectiveAbility } from './battleUtils';
import { abilityEffects } from './abilityEffects';
import { itemEffects } from './itemEffects';
import { calculateStat } from '../../utils/api';

export const calculateStatChange = (target, stat, change, currentBattleState) => {
    const newLog = [];
    if (target.fainted) {
        return { updatedTarget: target, newLog: [] };
    }

    let finalChange = change;
    // Get the ability's functional ID for logic
    const targetAbilityId = getEffectiveAbility(target, currentBattleState)?.id;

    if (targetAbilityId === 'simple') finalChange *= 2;
    if (targetAbilityId === 'contrary') {
        const contraryEffect = abilityEffects['contrary']?.onModifyStatStage;
        if (contraryEffect) finalChange = contraryEffect(finalChange, target, newLog);
    }

    const originalStage = target.stat_stages[stat];
    const newStage = Math.max(-6, Math.min(6, originalStage + finalChange));

    let updatedTarget = {
        ...target,
        stat_stages: {
            ...target.stat_stages,
            [stat]: newStage
        }
    };

    const wasLowered = newStage < originalStage;
    if (wasLowered) {
        // Use the item's functional ID for comparison
        if (updatedTarget.heldItem?.id === 'clear-amulet') {
            newLog.push({ type: 'text', text: `${updatedTarget.name}'s Clear Amulet prevents its stats from being lowered!` });
            return { updatedTarget: target, newLog };
        }

        const abilityEffect = abilityEffects[targetAbilityId];
        if (abilityEffect?.onStatLowered) {
            abilityEffect.onStatLowered(updatedTarget, currentBattleState, newLog, (t, s, c, l, cs) => {
                const result = calculateStatChange(t, s, c, cs);
                Object.assign(t, result.updatedTarget);
                l.push(...result.newLog);
            });
        }

    }

    return { updatedTarget, newLog };
};

export const handleTransform = (transformer, target, newLog) => {
    if (transformer.transformed || target.transformed) {
        newLog.push({ type: 'text', text: 'But it failed!' });
        return;
    }

    newLog.push({ type: 'text', text: `${transformer.name} transformed into ${target.name}!` });

    transformer.basePokemonState = JSON.parse(JSON.stringify(transformer));

    transformer.name = target.name;
    transformer.sprites = { ...target.sprites };
    transformer.sprite = target.sprite;
    transformer.shinySprite = target.shinySprite;
    transformer.types = [...target.types];
    transformer.weight = target.weight;

    transformer.stats = { ...target.stats };
    transformer.ability = { ...target.ability };
    transformer.stat_stages = { ...target.stat_stages };

    transformer.moves = target.moves.map(move => ({
        ...move,
        pp: 5,
        maxPp: 5,
    }));

    transformer.transformed = true;
};

export const resolveFormChange = (pokemon, form, newLog) => {
    if (!pokemon || !form || !form.data) {
        return false;
    }
    newLog.push({ type: 'text', text: `${pokemon.name} transformed!` });

    // 1. Preserve the original state to revert back to if needed.
    const hpPercent = pokemon.currentHp / pokemon.maxHp;
    if (!pokemon.baseForm) {
        pokemon.baseForm = {
            name: pokemon.name,
            speciesName: pokemon.speciesName,
            baseStats: { ...pokemon.baseStats },
            types: [...pokemon.types],
            ability: pokemon.ability,
            sprites: { ...pokemon.sprites },
            stats: { ...pokemon.stats },
            weight: pokemon.weight
        };
    }

    // 2. Apply the new form's core data.
    // This correctly sets the new name, types, baseStats, weight, etc.
    Object.assign(pokemon, form.data);

    // 3. Recalculate ALL stats based on the new baseStats.
    const newStats = {
        hp: calculateStat(pokemon.baseStats.hp, pokemon.level, true, pokemon.speciesName),
        attack: calculateStat(pokemon.baseStats.attack, pokemon.level),
        defense: calculateStat(pokemon.baseStats.defense, pokemon.level),
        'special-attack': calculateStat(pokemon.baseStats['special-attack'], pokemon.level),
        'special-defense': calculateStat(pokemon.baseStats['special-defense'], pokemon.level),
        speed: calculateStat(pokemon.baseStats.speed, pokemon.level),
    };
    pokemon.stats = newStats;

    // 4. Update HP based on the new stats, maintaining the percentage.
    pokemon.maxHp = newStats.hp;
    pokemon.currentHp = Math.floor(newStats.hp * hpPercent);

    // 5. Update the ability to be an object, not just a string.
    if (form.data.ability && typeof form.data.ability === 'string') {
        const abilityId = form.data.ability.toLowerCase().replace(/ /g, '-');
        pokemon.ability = {
            id: abilityId,
            name: form.data.ability.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
        };
    }

    // 6. Update the top-level sprite properties that the UI uses.
    if (pokemon.sprites) {
        pokemon.sprite = pokemon.sprites.front_default;
        pokemon.shinySprite = pokemon.sprites.front_shiny;
    }
    
    // 7. Mark as transformed.
    pokemon.transformed = true;
    return true;
};
export const revertFormChange = (pokemon, newLog) => {
    if (!pokemon.baseForm) {
        return false;
    }
    newLog.push({ type: 'text', text: `${pokemon.name} reverted to its base form!` });

    const oldMaxHp = pokemon.maxHp;
    const hpPercent = pokemon.currentHp / oldMaxHp;

    Object.assign(pokemon, pokemon.baseForm);

    const newMaxHp = calculateStat(pokemon.baseStats.hp, pokemon.level, true);
    pokemon.maxHp = newMaxHp;
    pokemon.currentHp = Math.floor(newMaxHp * hpPercent);

    pokemon.transformed = false;
    delete pokemon.baseForm;
    return true;
};