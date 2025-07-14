// src/utils/api.js

import { POKEAPI_BASE_URL } from '../config/gameData';
import { officialFormsData } from '../config/officialFormsData';

const BASE_FORM_MAP = {
    'darmanitan-galar': 'darmanitan-galar-standard',
    'darmanitan': 'darmanitan-standard',
    'mimikyu': 'mimikyu-disguised',
    'aegislash': 'aegislash-shield',
    'morpeko': 'morpeko-full-belly',
    'eiscue': 'eiscue-ice',
    'minior': 'minior-red-meteor',
};

const itemDataCache = new Map();
export async function fetchItemData(itemName) {
    if (!itemName) return null;
    const itemKey = itemName.toLowerCase().replace(/\s/g, '-');
    if (itemDataCache.has(itemKey)) { return itemDataCache.get(itemKey); }
    try {
        const response = await fetch(`${POKEAPI_BASE_URL}item/${itemKey}/`);
        if (!response.ok) {
            console.warn(`Item "${itemName}" not found.`);
            return { name: itemName, sprite: null, category: 'unknown', effect_entries: [] };
        }
        const data = await response.json();
        const result = {
            name: data.name.replace(/-/g, ' '),
            sprite: data.sprites.default,
            category: data.category.name.replace(/-/g, ' '),
            effect_entries: data.effect_entries
        };
        itemDataCache.set(itemKey, result);
        return result;
    } catch (error) {
        console.error(error);
        return { name: itemName, sprite: null, category: 'unknown', effect_entries: [] };
    }
}
export const getAccuracyEvasionModifier = (stage) => {
    const multipliers = {
        '6': 3,    // 9/3
        '5': 2.66, // 8/3
        '4': 2.33, // 7/3
        '3': 2,    // 6/3
        '2': 1.66, // 5/3
        '1': 1.33, // 4/3
        '0': 1,
        '-1': 0.75, // 3/4
        '-2': 0.6,  // 3/5
        '-3': 0.5,  // 3/6
        '-4': 0.43, // 3/7
        '-5': 0.36, // 3/8
        '-6': 0.33  // 3/9
    };
    return multipliers[stage] || 1;
};

// Add this main calculation function to api.js
export const calculateHitChance = (attacker, defender, move, battleState) => {
    // Moves that never miss (e.g., Aerial Ace)
    if (move.accuracy === null) return 100;

    let accuracy = move.accuracy;
    const attackerAbility = getEffectiveAbility(attacker)?.toLowerCase();
    const defenderAbility = getEffectiveAbility(defender)?.toLowerCase();
    const attackerItem = attacker.heldItem?.name.toLowerCase();
    const defenderItem = defender.heldItem?.name.toLowerCase();

    // Step 1: Stat Stages (Accuracy vs. Evasion)
    const accuracyStage = attacker.stat_stages.accuracy;
    const evasionStage = defender.stat_stages.evasion;
    const stageMultiplier = getAccuracyEvasionModifier(accuracyStage - evasionStage);
    accuracy *= stageMultiplier;

    // Step 2: Ability Effects
    if (attackerAbility === 'compound-eyes') accuracy *= 1.3;
    if (defenderAbility === 'sand-veil' && battleState.field.weather === 'sandstorm') accuracy *= 0.8;
    if (defenderAbility === 'snow-cloak' && battleState.field.weather === 'snow') accuracy *= 0.8;
    if (defenderAbility === 'tangled-feet' && attacker.volatileStatuses.some(s => (s.name || s) === 'Confused')) accuracy *= 0.5;

    // Step 3: Item Effects
    if (attackerItem === 'wide-lens') accuracy *= 1.1;
    if (defenderItem === 'bright-powder') accuracy *= 0.9;
    
    // Zoom Lens requires a speed check
    const attackerSpeed = calculateStat(attacker.stats.speed, attacker.level) * getStatModifier(attacker.stat_stages.speed);
    const defenderSpeed = calculateStat(defender.stats.speed, defender.level) * getStatModifier(defender.stat_stages.speed);
    if (attackerItem === 'zoom-lens' && attackerSpeed < defenderSpeed) {
        accuracy *= 1.2;
    }

    return Math.round(Math.min(100, accuracy));
};
const pokemonDataCache = new Map();
export async function fetchPokemonData(name, level = 50, heldItemName = '', customMovesList = []) {
    let pokeKey = name.toLowerCase().replace(/\s/g, '-');
    if (BASE_FORM_MAP[pokeKey]) {
        pokeKey = BASE_FORM_MAP[pokeKey];
    }
    
    let pokeData;
    if (pokemonDataCache.has(pokeKey)) {
        pokeData = pokemonDataCache.get(pokeKey);
    } else {
        const pokeRes = await fetch(`${POKEAPI_BASE_URL}pokemon/${pokeKey}`);
        if (!pokeRes.ok) throw new Error(`Pokémon "${name}" not found.`);
        pokeData = await pokeRes.json();
        pokemonDataCache.set(pokeKey, pokeData);
    }

    const speciesRes = await fetch(pokeData.species.url);
    const speciesData = await speciesRes.json();
    
    let defaultGender = 'Genderless';
    if (speciesData.gender_rate !== -1) {
        defaultGender = (speciesData.gender_rate === 8) ? 'Female' : 'Male';
    }

    const itemPromise = fetchItemData(heldItemName);
    const abilityPromises = pokeData.abilities.map(a => fetch(a.ability.url).then(res => res.json()));
    
    const allLearnableMoveNames = [...new Set(pokeData.moves.map(m => m.move.name.replace(/-/g, ' ')))];

    // --- THIS IS THE CORRECTED, SAFER SORTING LOGIC ---
    const defaultMoveSetNames = pokeData.moves
        .filter(m => m.version_group_details.some(d => d.move_learn_method.name === 'level-up'))
        .sort((a, b) => {
            const detailA = a.version_group_details.find(d => d.move_learn_method.name === 'level-up');
            const detailB = b.version_group_details.find(d => d.move_learn_method.name === 'level-up');
            // Safely get the level, defaulting to 0 if not found
            const levelA = detailA ? detailA.level_learned_at : 0;
            const levelB = detailB ? detailB.level_learned_at : 0;
            return levelB - levelA;
        })
        .slice(0, 4)
        .map(m => m.move.name.replace(/-/g, ' '));

    const movePromises = defaultMoveSetNames.map(async (moveName) => {
        const customMoveOverride = customMovesList.find(cm => cm.name.toLowerCase() === moveName.toLowerCase());
        if (customMoveOverride) {
            return { ...customMoveOverride, maxPp: customMoveOverride.pp || 10 };
        }
        const moveData = await fetchMoveData(moveName);
        return { ...moveData, maxPp: moveData.pp };
    });

    const [itemResult, abilityResults, moveResults] = await Promise.all([
        itemPromise,
        Promise.allSettled(abilityPromises),
        Promise.allSettled(movePromises)
    ]);

    const heldItem = itemResult;
    // Filter out rejected promises and get the fulfilled values
    const fullAbilities = abilityResults.filter(r => r.status === 'fulfilled').map(r => r.value);
    const moves = moveResults.filter(r => r.status === 'fulfilled').map(r => r.value);

    const baseStats = Object.fromEntries(pokeData.stats.map(s => [s.stat.name, s.base_stat]));
    const types = pokeData.types.map(t => t.type.name);
    const newMaxHp = calculateStat(baseStats.hp, level, true);
    
    const speciesName = speciesData.name;
    const speciesIdentifier = pokeData.name;
    let formLookupKey = speciesName;
    if (formLookupKey.includes('-')) {
        const baseName = formLookupKey.split('-')[0];
        // If the base name (e.g., "darmanitan") exists as a key, use it.
        if (officialFormsData[baseName]) {
            formLookupKey = baseName;
        }
    }
    const forms = officialFormsData[formLookupKey] || [];
    
    return {
        id: crypto.randomUUID(),
        pokeApiId: pokeData.id,
        name: speciesIdentifier.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        speciesName: speciesName,
        speciesIdentifier: speciesIdentifier,
        level,
        gender: defaultGender,
        sprites: {
            male: pokeData.sprites.front_default,
            female: pokeData.sprites.front_female,
            shiny_male: pokeData.sprites.front_shiny,
            shiny_female: pokeData.sprites.front_shiny_female,
        },
        sprite: pokeData.sprites.front_default,
        shinySprite: pokeData.sprites.front_shiny,
        baseStats,
        currentHp: newMaxHp,
        maxHp: newMaxHp,
        moves: moves.map(m => ({ ...m, pp: m.maxPp })),
        allMoveNames: allLearnableMoveNames,
        types,
        abilities: fullAbilities.map(a => ({...a, name: a.name.replace(/-/g, ' ')})),
        ability: (fullAbilities.find(a => !a.is_hidden)?.name || fullAbilities[0]?.name || '').replace(/-/g, ' '),
        heldItem: heldItem,
        status: 'None',
        volatileStatuses: [],
        fainted: false,
        weight: pokeData.weight,
        stat_stages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 },
        forms: forms,
        lastMoveUsed: null,
        encoredMove: null,
        encoreTurns: 0,
        tauntTurns: 0,
        infatuatedWith: null,
        originalAbility: null,
        custapBerryActivated: false,
        boosterBoost: null,
        boosterApplied: false,
        originalHeldItem: heldItem,
        lastConsumedItem: null
    };
}

const moveDataCache = new Map();
export async function fetchMoveData(moveName) {
    if (!moveName) return null;
    const moveKey = moveName.toLowerCase().replace(/\s/g, '-');
    if (moveDataCache.has(moveKey)) { return moveDataCache.get(moveKey); }
    try {
        const response = await fetch(`${POKEAPI_BASE_URL}move/${moveKey}/`);
        if (!response.ok) throw new Error(`Move "${moveName}" not found.`);
        const data = await response.json();
        
        const englishEffectEntry = data.effect_entries.find(e => e.language.name === 'en') || { short_effect: 'No description available.' };

        const moveData = {
            name: data.name.replace(/-/g, ' '),
            type: data.type.name,
            damage_class: data.damage_class.name,
            power: data.power || 0,
            accuracy: data.accuracy || 100,
            pp: data.pp,
            target: data.target,
            effect_entries: [englishEffectEntry], 
            meta: data.meta,
            stat_changes: data.stat_changes,
            effects: [],
            isOverride: true,
        };
        moveDataCache.set(moveKey, moveData);
        return moveData;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export const getSprite = (pokemon) => {
    if (!pokemon) return '';
    if (pokemon.sprites) {
        if (pokemon.isShiny) {
            return pokemon.gender === 'Female' && pokemon.sprites.shiny_female
                ? pokemon.sprites.shiny_female
                : pokemon.sprites.shiny_male;
        }
        return pokemon.gender === 'Female' && pokemon.sprites.female
            ? pokemon.sprites.female
            : pokemon.sprites.male;
    }
    return pokemon.isShiny ? pokemon.shinySprite : pokemon.sprite;
};

export const calculateStat = (base, level, isHp = false) => {
    if (!base || !level) return 0;
    if (isHp) return Math.floor(((2 * base) * level) / 100) + level + 10;
    return Math.floor(((2 * base) * level) / 100) + 5;
};

export const calculateCritStage = (pokemon, move, highCritRateMovesSet) => {
    let stage = 0;

    // Check for high crit-rate moves
    if (highCritRateMovesSet.has(move.name.toLowerCase().replace(/\s/g, '-'))) {
        stage += 1;
    }

    // Check for abilities like Super Luck
    if (getEffectiveAbility(pokemon)?.toLowerCase() === 'super luck') {
        stage += 1;
    }

    // Check for held items that boost crit rate
    const heldItemName = pokemon.heldItem?.name.toLowerCase();
    if (heldItemName === 'scope lens' || heldItemName === 'razor claw') {
        stage += 1;
    }
    // Check for species-specific crit items
    if (heldItemName === 'stick' && pokemon.name.toLowerCase().includes('farfetch')) {
        stage += 2;
    }
    if (heldItemName === 'lucky punch' && pokemon.name.toLowerCase() === 'chansey') {
        stage += 2;
    }

    // Check for volatile statuses like Focus Energy
    if (pokemon.volatileStatuses?.includes('High Crit-Rate')) {
        stage += 2;
    }

    // Return the final stage, capped at 3 (which is 100%)
    return Math.min(stage, 3);
};
