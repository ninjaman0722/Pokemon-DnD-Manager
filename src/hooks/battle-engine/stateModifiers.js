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
    const targetAbility = getEffectiveAbility(target, currentBattleState)?.toLowerCase();

    if (targetAbility === 'simple') finalChange *= 2;
    if (targetAbility === 'contrary') {
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
        if (updatedTarget.heldItem?.name.toLowerCase() === 'clear-amulet') {
            newLog.push({ type: 'text', text: `${updatedTarget.name}'s Clear Amulet prevents its stats from being lowered!` });
            return { updatedTarget: target, newLog };
        }

        const abilityEffect = abilityEffects[targetAbility];
        if (abilityEffect?.onStatLowered) {
            abilityEffect.onStatLowered(updatedTarget, currentBattleState, newLog, (t, s, c, l, cs) => {
                const result = calculateStatChange(t, s, c, cs);
                Object.assign(t, result.updatedTarget);
                l.push(...result.newLog);
            });
        }
        
        if (currentBattleState.field.magicRoomTurns === 0) {
            const whiteHerbEffect = itemEffects['white-herb']?.onStatLowered;
            if (whiteHerbEffect && updatedTarget.heldItem?.name.toLowerCase() === 'white herb') {
                whiteHerbEffect(updatedTarget, currentBattleState, newLog);
            }
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

        // Create a backup of the original state before transforming
        transformer.basePokemonState = JSON.parse(JSON.stringify(transformer));

        // Copy properties from the target
        transformer.name = target.name;
        transformer.sprites = { ...target.sprites };
        transformer.sprite = target.sprite;
        transformer.shinySprite = target.shinySprite;
        transformer.types = [...target.types];
        transformer.weight = target.weight;

        // Copy base stats and current stat stages
        transformer.stats = { ...target.stats }; // Copy the calculated stats
        transformer.stat_stages = { ...target.stat_stages };

        // Copy moveset, setting PP to 5 for each move
        transformer.moves = target.moves.map(move => ({
            ...move,
            pp: 5,
            maxPp: 5,
        }));

        // Mark as transformed
        transformer.transformed = true;
    };

export const resolveFormChange = (pokemon, form, newLog) => {
        console.group(`--- INSIDE resolveFormChange for ${pokemon.name} ---`);
        if (!pokemon || !form) {
            console.error("RESOLVE CHECK FAILED: Missing pokemon or form data.");
            console.groupEnd();
            return false;
        }
        newLog.push({ type: 'text', text: `${pokemon.name}'s ${form.triggerAbility || 'ability'} was triggered!` });
        console.log("Pokémon state BEFORE transformation:", JSON.parse(JSON.stringify(pokemon)));

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
        console.log(`HP RECALCULATION: New Max HP is ${newMaxHp}. New Current HP is ${pokemon.currentHp}.`);

        pokemon.transformed = true;
        console.log("Pokémon state AFTER transformation:", JSON.parse(JSON.stringify(pokemon)));
        console.groupEnd();
        return true;
    };

export const revertFormChange = (pokemon, newLog) => {
        console.group(`--- INSIDE revertFormChange for ${pokemon.name} ---`);
        if (!pokemon.baseForm) {
            console.error("REVERT CHECK FAILED: Pokémon has no baseForm to revert to.");
            console.groupEnd();
            return false;
        }
        newLog.push({ type: 'text', text: `${pokemon.name} reverted to its base form!` });
        console.log("Pokémon state BEFORE reverting:", JSON.parse(JSON.stringify(pokemon)));

        const oldMaxHp = pokemon.maxHp;
        const hpPercent = pokemon.currentHp / oldMaxHp;

        Object.assign(pokemon, pokemon.baseForm);

        const newMaxHp = calculateStat(pokemon.baseStats.hp, pokemon.level, true);
        pokemon.maxHp = newMaxHp;
        pokemon.currentHp = Math.floor(newMaxHp * hpPercent);
        console.log(`HP RECALCULATION: Reverted Max HP is ${newMaxHp}. Reverted Current HP is ${pokemon.currentHp}.`);

        pokemon.transformed = false;
        delete pokemon.baseForm;
        console.log("Pokémon state AFTER reverting:", JSON.parse(JSON.stringify(pokemon)));
        console.groupEnd();
        return true;
    };