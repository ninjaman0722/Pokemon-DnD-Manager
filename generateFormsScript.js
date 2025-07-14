// generateFormsScript.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Constants for our custom logic, matching your plan
// const FORM_CHANGE_METHOD = {
//     PERMANENT: 'PERMANENT',
//     BATTLE: 'BATTLE',
//     ITEM_HOLD: 'ITEM_HOLD',
// };
// const BASE_FORM_MAP = {
//     'darmanitan': 'darmanitan-standard',
//     'darmanitan-galar': 'darmanitan-galar-standard',
//     'mimikyu': 'mimikyu-disguised',
//     'aegislash': 'aegislash-shield',
//     'morpeko': 'morpeko-full-belly',
//     'eiscue': 'eiscue-ice',
//     'minior': 'minior-red-meteor', // The base form is the meteor
//     'giratina': 'giratina-altered',
//     'shaymin': 'shaymin-land',
//     'cherrim': 'cherrim',
//     'meloetta': 'meloetta-aria',
//     'zygarde': 'zygarde-50',
//     'wishiwashi': 'wishiwashi-solo',
// };
// ====================================================================================
// STEP 1: DEFINE THE MANUAL DATA (Our "Instruction Manual")
// Here we list the forms and the data PokéAPI doesn't have:
// - formName: The exact name the PokéAPI uses for the form's endpoint.
// - changeMethod: The rule for how this form is activated in our app[cite: 85].
// - triggerItem: The item required to activate the form[cite: 90].
// ====================================================================================
const manualFormMap = {
    // --- BATTLE Forms (Mega Evolutions, Primals, etc.) ---
    venusaur: [{ formName: 'venusaur-mega', changeMethod: 'BATTLE', triggerItem: 'Venusaurite' }],
    charizard: [
        { formName: 'charizard-mega-x', changeMethod: 'BATTLE', triggerItem: 'Charizardite X' },
        { formName: 'charizard-mega-y', changeMethod: 'BATTLE', triggerItem: 'Charizardite Y' }
    ],
    blastoise: [{ formName: 'blastoise-mega', changeMethod: 'BATTLE', triggerItem: 'Blastoisinite' }],
    alakazam: [{ formName: 'alakazam-mega', changeMethod: 'BATTLE', triggerItem: 'Alakazite' }],
    gengar: [{ formName: 'gengar-mega', changeMethod: 'BATTLE', triggerItem: 'Gengarite' }],
    kangaskhan: [{ formName: 'kangaskhan-mega', changeMethod: 'BATTLE', triggerItem: 'Kangaskhanite' }],
    pinsir: [{ formName: 'pinsir-mega', changeMethod: 'BATTLE', triggerItem: 'Pinsirite' }],
    gyarados: [{ formName: 'gyarados-mega', changeMethod: 'BATTLE', triggerItem: 'Gyaradosite' }],
    aerodactyl: [{ formName: 'aerodactyl-mega', changeMethod: 'BATTLE', triggerItem: 'Aerodactylite' }],
    mewtwo: [
        { formName: 'mewtwo-mega-x', changeMethod: 'BATTLE', triggerItem: 'Mewtwonite X' },
        { formName: 'mewtwo-mega-y', changeMethod: 'BATTLE', triggerItem: 'Mewtwonite Y' }
    ],
    ampharos: [{ formName: 'ampharos-mega', changeMethod: 'BATTLE', triggerItem: 'Ampharosite' }],
    scizor: [{ formName: 'scizor-mega', changeMethod: 'BATTLE', triggerItem: 'Scizorite' }],
    heracross: [{ formName: 'heracross-mega', changeMethod: 'BATTLE', triggerItem: 'Heracronite' }],
    houndoom: [{ formName: 'houndoom-mega', changeMethod: 'BATTLE', triggerItem: 'Houndoominite' }],
    tyranitar: [{ formName: 'tyranitar-mega', changeMethod: 'BATTLE', triggerItem: 'Tyranitarite' }],
    blaziken: [{ formName: 'blaziken-mega', changeMethod: 'BATTLE', triggerItem: 'Blazikenite' }],
    gardevoir: [{ formName: 'gardevoir-mega', changeMethod: 'BATTLE', triggerItem: 'Gardevoirite' }],
    mawile: [{ formName: 'mawile-mega', changeMethod: 'BATTLE', triggerItem: 'Mawilite' }],
    aggron: [{ formName: 'aggron-mega', changeMethod: 'BATTLE', triggerItem: 'Aggronite' }],
    medicham: [{ formName: 'medicham-mega', changeMethod: 'BATTLE', triggerItem: 'Medichamite' }],
    manectric: [{ formName: 'manectric-mega', changeMethod: 'BATTLE', triggerItem: 'Manectite' }],
    banette: [{ formName: 'banette-mega', changeMethod: 'BATTLE', triggerItem: 'Banettite' }],
    absol: [{ formName: 'absol-mega', changeMethod: 'BATTLE', triggerItem: 'Absolite' }],
    garchomp: [{ formName: 'garchomp-mega', changeMethod: 'BATTLE', triggerItem: 'Garchompite' }],
    lucario: [{ formName: 'lucario-mega', changeMethod: 'BATTLE', triggerItem: 'Lucarionite' }],
    abomasnow: [{ formName: 'abomasnow-mega', changeMethod: 'BATTLE', triggerItem: 'Abomasite' }],
    kyogre: [{ formName: 'kyogre-primal', changeMethod: 'BATTLE', triggerItem: 'Blue Orb' }],
    groudon: [{ formName: 'groudon-primal', changeMethod: 'BATTLE', triggerItem: 'Red Orb' }],
    rayquaza: [{ formName: 'rayquaza-mega', changeMethod: 'BATTLE', triggerMove: 'Dragon Ascent' }],
    meloetta: [ { formName: 'meloetta-pirouette', apiDataSource: 'meloetta-pirouette', changeMethod: 'BATTLE', triggerMove: 'Relic Song' } ],
    aegislash: [ { formName: 'aegislash-blade', apiDataSource: 'aegislash-blade', changeMethod: 'BATTLE', triggerAbility: 'stance-change' } ],
    darmanitan: [
        { formName: 'darmanitan-zen', apiDataSource: 'darmanitan-zen', changeMethod: 'BATTLE', triggerAbility: 'zen-mode', triggerCondition: 'HP_LT_50' },
        { formName: 'darmanitan-galar-zen', apiDataSource: 'darmanitan-galar-zen', changeMethod: 'BATTLE', triggerAbility: 'zen-mode', triggerCondition: 'HP_LT_50', isGalarian: true }
    ],
    zygarde: [ { formName: 'zygarde-complete', apiDataSource: 'zygarde-complete', changeMethod: 'BATTLE', triggerAbility: 'power-construct', triggerCondition: 'HP_LT_50' } ],
    wishiwashi: [ { formName: 'wishiwashi-school', apiDataSource: 'wishiwashi-school', changeMethod: 'BATTLE', triggerAbility: 'schooling', triggerCondition: 'HP_GT_25' } ],
    minior: [ { formName: 'minior-red', apiDataSource: 'minior-red', changeMethod: 'BATTLE', triggerAbility: 'shields-down', triggerCondition: 'HP_LT_50' } ],
    mimikyu: [ { formName: 'mimikyu-busted', apiDataSource: 'mimikyu-busted', changeMethod: 'BATTLE', triggerAbility: 'disguise', triggerCondition: 'ON_DAMAGE' } ],
    eiscue: [ { formName: 'eiscue-noice', apiDataSource: 'eiscue-noice', changeMethod: 'BATTLE', triggerAbility: 'ice-face', triggerCondition: 'ON_PHYSICAL_DAMAGE' } ],
    morpeko: [ { formName: 'morpeko-hangry', apiDataSource: 'morpeko-hangry', changeMethod: 'BATTLE', triggerAbility: 'hunger-switch', triggerCondition: 'END_OF_TURN' } ],
    castform: [
        { formName: 'castform-sunny', changeMethod: 'BATTLE', triggerAbility: 'forecast', triggerCondition: 'WEATHER_SUN' },
        { formName: 'castform-rainy', changeMethod: 'BATTLE', triggerAbility: 'forecast', triggerCondition: 'WEATHER_RAIN' },
        { formName: 'castform-snowy', changeMethod: 'BATTLE', triggerAbility: 'forecast', triggerCondition: 'WEATHER_SNOW' }
    ],
    cherrim: [ 
        { formName: 'cherrim-sunshine', apiDataSource: 'cherrim', changeMethod: 'BATTLE', triggerAbility: 'flower-gift', triggerCondition: 'WEATHER_SUN' }
    ],
    zacian: [{ formName: 'zacian-crowned', changeMethod: 'BATTLE', triggerItem: 'Rusted Sword' }],
    zamazenta: [{ formName: 'zamazenta-crowned', changeMethod: 'BATTLE', triggerItem: 'Rusted Shield' }],
    // --- ITEM_HOLD Forms ---
    arceus: [
        { formName: 'arceus-fighting', changeMethod: 'ITEM_HOLD', triggerItem: 'Fist Plate', apiDataSource: 'arceus', data: { types: ['fighting'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-fighting.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-fighting.png' }}},
        { formName: 'arceus-flying', changeMethod: 'ITEM_HOLD', triggerItem: 'Sky Plate', apiDataSource: 'arceus', data: { types: ['flying'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-flying.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-flying.png' }}},
        { formName: 'arceus-poison', changeMethod: 'ITEM_HOLD', triggerItem: 'Toxic Plate', apiDataSource: 'arceus', data: { types: ['poison'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-poison.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-poison.png' }}},
        { formName: 'arceus-ground', changeMethod: 'ITEM_HOLD', triggerItem: 'Earth Plate', apiDataSource: 'arceus', data: { types: ['ground'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-ground.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-ground.png' }}},
        { formName: 'arceus-rock', changeMethod: 'ITEM_HOLD', triggerItem: 'Stone Plate', apiDataSource: 'arceus', data: { types: ['rock'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-rock.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-rock.png' }}},
        { formName: 'arceus-bug', changeMethod: 'ITEM_HOLD', triggerItem: 'Insect Plate', apiDataSource: 'arceus', data: { types: ['bug'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-bug.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-bug.png' }}},
        { formName: 'arceus-ghost', changeMethod: 'ITEM_HOLD', triggerItem: 'Spooky Plate', apiDataSource: 'arceus', data: { types: ['ghost'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-ghost.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-ghost.png' }}},
        { formName: 'arceus-steel', changeMethod: 'ITEM_HOLD', triggerItem: 'Iron Plate', apiDataSource: 'arceus', data: { types: ['steel'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-steel.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-steel.png' }}},
        { formName: 'arceus-fire', changeMethod: 'ITEM_HOLD', triggerItem: 'Flame Plate', apiDataSource: 'arceus', data: { types: ['fire'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-fire.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-fire.png' }}},
        { formName: 'arceus-water', changeMethod: 'ITEM_HOLD', triggerItem: 'Splash Plate', apiDataSource: 'arceus', data: { types: ['water'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-water.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-water.png' }}},
        { formName: 'arceus-grass', changeMethod: 'ITEM_HOLD', triggerItem: 'Meadow Plate', apiDataSource: 'arceus', data: { types: ['grass'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-grass.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-grass.png' }}},
        { formName: 'arceus-electric', changeMethod: 'ITEM_HOLD', triggerItem: 'Zap Plate', apiDataSource: 'arceus', data: { types: ['electric'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-electric.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-electric.png' }}},
        { formName: 'arceus-psychic', changeMethod: 'ITEM_HOLD', triggerItem: 'Mind Plate', apiDataSource: 'arceus', data: { types: ['psychic'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-psychic.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-psychic.png' }}},
        { formName: 'arceus-ice', changeMethod: 'ITEM_HOLD', triggerItem: 'Icicle Plate', apiDataSource: 'arceus', data: { types: ['ice'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-ice.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-ice.png' }}},
        { formName: 'arceus-dragon', changeMethod: 'ITEM_HOLD', triggerItem: 'Draco Plate', apiDataSource: 'arceus', data: { types: ['dragon'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-dragon.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-dragon.png' }}},
        { formName: 'arceus-dark', changeMethod: 'ITEM_HOLD', triggerItem: 'Dread Plate', apiDataSource: 'arceus', data: { types: ['dark'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-dark.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-dark.png' }}},
        { formName: 'arceus-fairy', changeMethod: 'ITEM_HOLD', triggerItem: 'Pixie Plate', apiDataSource: 'arceus', data: { types: ['fairy'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493-fairy.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/493-fairy.png' }}},
    ],
silvally: [
        { formName: 'silvally-fighting', changeMethod: 'ITEM_HOLD', triggerItem: 'Fighting Memory', apiDataSource: 'silvally', data: { types: ['fighting'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-fighting.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-fighting.png' }}},
        { formName: 'silvally-flying', changeMethod: 'ITEM_HOLD', triggerItem: 'Flying Memory', apiDataSource: 'silvally', data: { types: ['flying'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-flying.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-flying.png' }}},
        { formName: 'silvally-poison', changeMethod: 'ITEM_HOLD', triggerItem: 'Poison Memory', apiDataSource: 'silvally', data: { types: ['poison'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-poison.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-poison.png' }}},
        { formName: 'silvally-ground', changeMethod: 'ITEM_HOLD', triggerItem: 'Ground Memory', apiDataSource: 'silvally', data: { types: ['ground'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-ground.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-ground.png' }}},
        { formName: 'silvally-rock', changeMethod: 'ITEM_HOLD', triggerItem: 'Rock Memory', apiDataSource: 'silvally', data: { types: ['rock'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-rock.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-rock.png' }}},
        { formName: 'silvally-bug', changeMethod: 'ITEM_HOLD', triggerItem: 'Bug Memory', apiDataSource: 'silvally', data: { types: ['bug'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-bug.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-bug.png' }}},
        { formName: 'silvally-ghost', changeMethod: 'ITEM_HOLD', triggerItem: 'Ghost Memory', apiDataSource: 'silvally', data: { types: ['ghost'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-ghost.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-ghost.png' }}},
        { formName: 'silvally-steel', changeMethod: 'ITEM_HOLD', triggerItem: 'Steel Memory', apiDataSource: 'silvally', data: { types: ['steel'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-steel.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-steel.png' }}},
        { formName: 'silvally-fire', changeMethod: 'ITEM_HOLD', triggerItem: 'Fire Memory', apiDataSource: 'silvally', data: { types: ['fire'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-fire.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-fire.png' }}},
        { formName: 'silvally-water', changeMethod: 'ITEM_HOLD', triggerItem: 'Water Memory', apiDataSource: 'silvally', data: { types: ['water'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-water.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-water.png' }}},
        { formName: 'silvally-grass', changeMethod: 'ITEM_HOLD', triggerItem: 'Grass Memory', apiDataSource: 'silvally', data: { types: ['grass'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-grass.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-grass.png' }}},
        { formName: 'silvally-electric', changeMethod: 'ITEM_HOLD', triggerItem: 'Electric Memory', apiDataSource: 'silvally', data: { types: ['electric'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-electric.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-electric.png' }}},
        { formName: 'silvally-psychic', changeMethod: 'ITEM_HOLD', triggerItem: 'Psychic Memory', apiDataSource: 'silvally', data: { types: ['psychic'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-psychic.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-psychic.png' }}},
        { formName: 'silvally-ice', changeMethod: 'ITEM_HOLD', triggerItem: 'Ice Memory', apiDataSource: 'silvally', data: { types: ['ice'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-ice.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-ice.png' }}},
        { formName: 'silvally-dragon', changeMethod: 'ITEM_HOLD', triggerItem: 'Dragon Memory', apiDataSource: 'silvally', data: { types: ['dragon'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-dragon.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-dragon.png' }}},
        { formName: 'silvally-dark', changeMethod: 'ITEM_HOLD', triggerItem: 'Dark Memory', apiDataSource: 'silvally', data: { types: ['dark'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-dark.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-dark.png' }}},
        { formName: 'silvally-fairy', changeMethod: 'ITEM_HOLD', triggerItem: 'Fairy Memory', apiDataSource: 'silvally', data: { types: ['fairy'], sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/773-fairy.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/773-fairy.png' }}},
    ],
genesect: [
        { formName: 'genesect-douse', changeMethod: 'ITEM_HOLD', triggerItem: 'Douse Drive', apiDataSource: 'genesect', data: { sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/649-douse.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/649-douse.png' }}},
        { formName: 'genesect-shock', changeMethod: 'ITEM_HOLD', triggerItem: 'Shock Drive', apiDataSource: 'genesect', data: { sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/649-shock.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/649-shock.png' }}},
        { formName: 'genesect-burn', changeMethod: 'ITEM_HOLD', triggerItem: 'Burn Drive', apiDataSource: 'genesect', data: { sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/649-burn.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/649-burn.png' }}},
        { formName: 'genesect-chill', changeMethod: 'ITEM_HOLD', triggerItem: 'Chill Drive', apiDataSource: 'genesect', data: { sprites: { front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/649-chill.png', front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/649-chill.png' }}},
    ],
    giratina: [ { formName: 'giratina-origin', apiDataSource: 'giratina-origin', changeMethod: 'ITEM_HOLD', triggerItem: 'Griseous Orb' } ],
    dialga: [ { formName: 'dialga-origin', apiDataSource: 'dialga-origin', changeMethod: 'ITEM_HOLD', triggerItem: 'Adamant Crystal' } ],
    palkia: [ { formName: 'palkia-origin', apiDataSource: 'palkia-origin', changeMethod: 'ITEM_HOLD', triggerItem: 'Lustrous Globe' } ],
    ogerpon: [ 
        { formName: 'ogerpon-wellspring-mask', apiDataSource: 'ogerpon-wellspring-mask', changeMethod: 'ITEM_HOLD', triggerItem: 'Wellspring Mask' }, 
        { formName: 'ogerpon-hearthflame-mask', apiDataSource: 'ogerpon-hearthflame-mask', changeMethod: 'ITEM_HOLD', triggerItem: 'Hearthflame Mask' }, 
        { formName: 'ogerpon-cornerstone-mask', apiDataSource: 'ogerpon-cornerstone-mask', changeMethod: 'ITEM_HOLD', triggerItem: 'Cornerstone Mask' }
    ],
};

const POKEAPI_BASE_URL = 'https://pokeapi.co/api/v2/pokemon/';
const OUTPUT_PATH = path.join(__dirname, 'src', 'config', 'officialFormsData.js');

const formatBaseStats = (statsArray) => {
    const statMap = {};
    statsArray.forEach(stat => { statMap[stat.stat.name] = stat.base_stat; });
    return statMap;
};

// Replace your entire generateFormsData function with this one
const generateFormsData = async () => {
    console.log("Starting form data generation...");
    const completeFormsData = {};

    for (const pokemonName in manualFormMap) {
        console.log(`\nProcessing ${pokemonName}...`);
        const formsToProcess = manualFormMap[pokemonName];
        const processedForms = [];

        for (const manualForm of formsToProcess) {
            let apiData;
            // This is the new, foolproof logic. It uses the explicit source from the map, or defaults to the form name.
            const nameToFetch = manualForm.apiDataSource || manualForm.formName;
            
            try {
                console.log(`  Fetching data for '${nameToFetch}'...`);
                const response = await axios.get(`${POKEAPI_BASE_URL}${nameToFetch}`);
                apiData = response.data;
                
                // Build the final data object directly from the correct API call
                const finalData = {
                    // 1. Name and ID always come from our manual definition of the form.
                    speciesName: manualForm.formName,
                    name: manualForm.formName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),

                    // 2. Core battle data comes from the API page we fetched.
                    types: apiData.types.map(t => t.type.name),
                    baseStats: formatBaseStats(apiData.stats),
                    ability: apiData.abilities.find(a => !a.is_hidden)?.ability.name,
                    sprites: {
                        front_default: apiData.sprites.front_default,
                        front_shiny: apiData.sprites.front_shiny
                    }
                };

                // 3. Manual overrides from our map have the final say.
                const completeForm = {
                    ...manualForm,
                    data: {
                        ...finalData,
                        ...manualForm.data,
                        sprites: { ...finalData.sprites, ...manualForm.data?.sprites }
                    }
                };
                
                processedForms.push(completeForm);
                console.log(`  Successfully processed ${manualForm.formName}.`);

            } catch (error) {
                 console.error(`  !! Failed to fetch or process data for ${manualForm.formName}. URL attempted: ${nameToFetch}. Error: ${error.message}`);
                 continue;
            }
        }
        if (processedForms.length > 0) {
            completeFormsData[pokemonName] = processedForms;
        }
    }

    const fileContent = `// This file is auto-generated by generateFormsScript.js. Do not edit manually.\n\n` +
                        `export const officialFormsData = ${JSON.stringify(completeFormsData, null, 2)};`;

    fs.writeFileSync(OUTPUT_PATH, fileContent, 'utf8');
    console.log(`\n✅ Form data generation complete! File saved to ${OUTPUT_PATH}`);
};

generateFormsData();