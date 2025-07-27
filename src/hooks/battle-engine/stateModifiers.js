import { getEffectiveAbility } from './battleUtils';
import { abilityEffects } from '../../config/abilityEffects';
import { itemEffects } from '../../config/itemEffects';
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
    if (!pokemon || !form) {
        return false;
    }
    newLog.push({ type: 'text', text: `${pokemon.name}'s ${form.triggerAbility || 'ability'} was triggered!` });

    const oldMaxHp = pokemon.maxHp;
    const hpPercent = pokemon.currentHp / oldMaxHp;

    if (!pokemon.baseForm) {
        pokemon.baseForm = {
            name: pokemon.name,
            speciesName: pokemon.speciesName,
            baseStats: { ...pokemon.baseStats },
            types: [...pokemon.types],
            ability: pokemon.ability,
            sprites: { ...pokemon.sprites },
        };
    }

    Object.assign(pokemon, form.data);
    pokemon.name = form.formName;

    const newMaxHp = calculateStat(form.data.baseStats.hp, pokemon.level, true);
    pokemon.maxHp = newMaxHp;
    pokemon.currentHp = Math.floor(newMaxHp * hpPercent);

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