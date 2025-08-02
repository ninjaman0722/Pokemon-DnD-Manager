// src/utils/api.js
import { getEffectiveAbility, getStatModifier } from '../hooks/battle-engine/battleUtils';
import { POKEAPI_BASE_URL, STAGE_MULTIPLIERS } from '../config/gameData';
import { officialFormsData } from '../config/officialFormsData';

/**
 * @typedef {Object} Stats
 * @property {number} hp
 * @property {number} attack
 * @property {number} defense
 * @property {number} special-attack
 * @property {number} special-defense
 * @property {number} speed
 */

/**
 * @typedef {Object} Pokemon
 * @property {string} id - The unique ID for this instance of the Pokémon.
 * @property {string} name - The display name (e.g., "Charizard").
 * @property {number} level
 * @property {{id: string, name: string}} ability
 * @property {Array<{id: string, name: string}>} abilities
 * @property {{id: string, name: string} | null} heldItem
 * @property {string} status
 * @property {string[]} types
 * @property {any[]} moves
 * @property {Stats} stats - The calculated stats for the current level.
 * @property {Stats} baseStats - The base stats from the API.
 * @property {object} stat_stages
 * @property {any[]} volatileStatuses
 * @property {number} maxHp
 * @property {number} currentHp
 * @property {boolean} fainted
 */
const toTitleCase = (str) => {
    if (!str) return '';
    return str.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
};

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
            return { name: toTitleCase(itemName), id: itemKey, sprite: null, category: 'unknown', effect_entries: [] };
        }
        const data = await response.json();
        const result = {
            name: toTitleCase(data.name),
            id: data.name, // The functional, hyphenated ID from the API
            sprite: data.sprites.default,
            category: data.category.name.replace(/-/g, ' '),
            effect_entries: data.effect_entries
        };
        itemDataCache.set(itemKey, result);
        return result;
    } catch (error) {
        console.error(error);
        return { name: toTitleCase(itemName), id: itemKey, sprite: null, category: 'unknown', effect_entries: [] };
    }
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
            name: toTitleCase(data.name),
            id: data.name, // The functional, hyphenated ID
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

/**
 * Fetches and constructs a complete Pokémon object.
 * @param {string} name - The name of the Pokémon to fetch.
 * @param {number} [level=50] - The level of the Pokémon.
 * @param {string} [heldItemName=''] - The name of the held item.
 * @param {Array} [customMovesList=[]] - A list of custom moves.
 * @returns {Promise<Pokemon>} - A promise that resolves to a complete Pokémon object.
 */

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

    const defaultMoveSetNames = pokeData.moves
        .filter(m => m.version_group_details.some(d => d.move_learn_method.name === 'level-up'))
        .sort((a, b) => {
            const detailA = a.version_group_details.find(d => d.move_learn_method.name === 'level-up');
            const detailB = b.version_group_details.find(d => d.move_learn_method.name === 'level-up');
            const levelA = detailA ? detailA.level_learned_at : 0;
            const levelB = detailB ? detailB.level_learned_at : 0;
            return levelB - levelA;
        })
        .slice(0, 1)
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
    const fullAbilities = abilityResults
        .filter(r => r.status === 'fulfilled')
        .map(r => ({
            ...r.value,
            name: toTitleCase(r.value.name), // Display Name
            id: r.value.name // Functional ID
        }));
    const moves = moveResults.filter(r => r.status === 'fulfilled').map(r => r.value);
    const baseStats = Object.fromEntries(pokeData.stats.map(s => [s.stat.name, s.base_stat]));
    const types = pokeData.types.map(t => t.type.name);

    // --- CORRECTED ORDER ---
    // Declare these identifiers first.
    const speciesName = speciesData.name;
    const speciesIdentifier = pokeData.name;

    // Now, calculate the HP using the identifier.
    const newMaxHp = calculateStat(baseStats.hp, level, true, speciesIdentifier);
    // --- END CORRECTION ---

    let formLookupKey = speciesName;
    if (formLookupKey.includes('-')) {
        const baseName = formLookupKey.split('-')[0];
        if (officialFormsData[baseName]) {
            formLookupKey = baseName;
        }
    }
    const forms = officialFormsData[formLookupKey] || [];
    const defaultAbility = fullAbilities.find(a => !a.is_hidden) || fullAbilities[0] || null;
    const stats = {
        hp: newMaxHp,
        attack: calculateStat(baseStats.attack, level),
        defense: calculateStat(baseStats.defense, level),
        'special-attack': calculateStat(baseStats['special-attack'], level),
        'special-defense': calculateStat(baseStats['special-defense'], level),
        speed: calculateStat(baseStats.speed, level),
    };
    return {
        id: `${pokeKey}-${Math.random().toString(36).substring(2, 9)}`,
        pokeApiId: pokeData.id,
        name: toTitleCase(speciesIdentifier), // Display Name
        id: speciesIdentifier, // Functional ID
        speciesName: speciesName,
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
        stats: stats,
        baseStats,
        currentHp: newMaxHp,
        maxHp: newMaxHp,
        moves: moves.map(m => ({ ...m, pp: m.maxPp })),
        allMoveNames: allLearnableMoveNames,
        types,
        abilities: fullAbilities,
        ability: defaultAbility, // This is now an object: { name, id }
        heldItem: heldItem, // This is now an object: { name, id }
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

// Add this main calculation function to api.js
export const calculateHitChance = (attacker, defender, move, battleState) => {
    // --- ADDED: Check for special cases that guarantee a hit ---
    const attackerAbilityId = getEffectiveAbility(attacker, battleState)?.id;
    const defenderAbilityId = getEffectiveAbility(defender, battleState)?.id;
    if (attackerAbilityId === 'no-guard' || defenderAbilityId === 'no-guard') return 100;
    if (move.accuracy === null) return 100;

    // Case 1: No Guard ability on either Pokémon
    if (attackerAbilityId === 'no-guard' || defenderAbilityId === 'no-guard') {
        return 100;
    }
    // Case 2: Move has null accuracy (e.g., Aerial Ace) - bypasses checks
    if (move.accuracy === null) {
        return 100;
    }
    // Case 3: Weather-dependent accuracy
    if ((move.id === 'thunder' || move.id === 'hurricane') && (battleState.field.weather === 'rain' || battleState.field.weather === 'heavy-rain')) {
        return 100;
    }
    if (move.id === 'blizzard' && battleState.field.weather === 'snow') {
        return 100;
    }

    if (defender.volatileStatuses?.includes('Charging') && ['fly', 'dig', 'dive'].includes(defender.chargingMove?.id)) {
        return 0;
    }

    let accuracy = move.accuracy;

    // --- REWRITTEN: Accurate Accuracy/Evasion Stage Calculation ---
    // 1. Get the individual stages, clamping them to the -6 to +6 range.
    const accuracyStage = Math.max(-6, Math.min(6, attacker.stat_stages.accuracy));
    const evasionStage = Math.max(-6, Math.min(6, defender.stat_stages.evasion));

    // 2. Look up the fractional multipliers for each stage.
    const accMod = STAGE_MULTIPLIERS[accuracyStage];
    const evaMod = STAGE_MULTIPLIERS[evasionStage];

    // 3. Calculate the final stage modifier by multiplying by the attacker's
    //    accuracy and dividing by the defender's evasion.
    const stageMultiplier = (accMod.num / accMod.den) / (evaMod.num / evaMod.den);
    accuracy *= stageMultiplier;
    
    // --- "Other Modifiers" (Abilities, Items, etc.) - no change here ---
    const attackerItemId = attacker.heldItem?.id;
    const defenderItemId = defender.heldItem?.id;

    // Abilities
    if (attackerAbilityId === 'compound-eyes') accuracy *= 1.3;
    if (attackerAbilityId === 'victory-star') accuracy *= 1.1; // ADDED: Victory Star
    if (defenderAbilityId === 'sand-veil' && battleState.field.weather === 'sandstorm') accuracy *= 0.8;
    if (defenderAbilityId === 'snow-cloak' && battleState.field.weather === 'snow') accuracy *= 0.8;
    if (defenderAbilityId === 'tangled-feet' && defender.volatileStatuses.some(s => (s.name || s) === 'Confused')) accuracy *= 0.5;

    // Items
    if (attackerItemId === 'wide-lens') accuracy *= 1.1;
    if (defenderItemId === 'bright-powder' || defenderItemId === 'lax-incense') accuracy *= 0.9; // ADDED: Lax Incense
    
    // CORRECTED: No need to recalculate stats here; they are already calculated.
    const attackerSpeed = attacker.stats.speed * getStatModifier(attacker.stat_stages.speed);
    const defenderSpeed = defender.stats.speed * getStatModifier(defender.stat_stages.speed);
    if (attackerItemId === 'zoom-lens' && attackerSpeed < defenderSpeed) {
        accuracy *= 1.2;
    }

    // Field Effects
    if (battleState.field.gravityTurns > 0) accuracy *= (5/3); // ADDED: Gravity

    return Math.round(Math.min(100, accuracy));
};

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

export const calculateStat = (base, level, isHp = false, pokemonName = '') => {
    // Special case for Shedinja, whose HP is always 1.
    if (isHp && pokemonName.toLowerCase().includes('shedinja')) {
        return 1;
    }

    if (!base || !level) return 0;
    if (isHp) return Math.floor(((2 * base) * level) / 100) + level + 10;
    return Math.floor(((2 * base) * level) / 100) + 5;
};

export const calculateCritStage = (pokemon, move, highCritRateMovesSet) => {
    let stage = 0;

    // --- CORRECTED: Use the move's ID for the lookup ---
    if (highCritRateMovesSet.has(move.id)) {
        stage += 1;
    }

    if (getEffectiveAbility(pokemon)?.id === 'super-luck') {
        stage += 1;
    }

    // --- CORRECTED: Use the item's ID for all checks ---
    const heldItemId = pokemon.heldItem?.id;
    if (heldItemId === 'scope-lens' || heldItemId === 'razor-claw') {
        stage += 1;
    }
    
    // --- CORRECTED: Use the Pokémon's ID for species-specific checks ---
    if (heldItemId === 'stick' && pokemon.id.includes('farfetchd')) { // Note: 'farfetchd' is the API name
        stage += 2;
    }
    if (heldItemId === 'lucky-punch' && pokemon.id === 'chansey') {
        stage += 2;
    }

    if (pokemon.volatileStatuses?.includes('High Crit-Rate')) {
        stage += 2;
    }

    return Math.min(stage, 3);
};
