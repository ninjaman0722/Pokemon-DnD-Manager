// This factory provides functions to easily create mock data for tests.
import { calculateStat, fetchPokemonData } from '../../../utils/api';
/**
 * Creates a complete Pokémon object with sensible defaults.
 * @param {string} name - The name of the Pokémon.
 * @param {object} overrides - An object with properties to override the defaults.
 * @returns {object} A complete Pokémon object for use in tests.
 */
export const createPokemon = (name, overrides = {}) => {
  // 1. Determine the level for calculation
  const level = overrides.level || 50; // Default to level 50 if not provided

  // 2. Calculate stats if baseStats are provided
  let calculatedStats = {};
  let calculatedMaxHp = 100; // Default HP

  if (overrides.baseStats) {
    calculatedStats = {
      attack: calculateStat(overrides.baseStats.attack, level),
      defense: calculateStat(overrides.baseStats.defense, level),
      'special-attack': calculateStat(overrides.baseStats['special-attack'], level),
      'special-defense': calculateStat(overrides.baseStats['special-defense'], level),
      speed: calculateStat(overrides.baseStats.speed, level),
    };
    calculatedMaxHp = calculateStat(overrides.baseStats.hp, level, true);
  }

  // 3. Set up the defaults, now incorporating the calculated stats
  const defaults = {
    id: `${name.toLowerCase()}-id-${Math.random()}`,
    name: name,
    level: level,
    ability: 'overgrow',
    item: null,
    status: 'None',
    types: ['normal'],
    moves: [],
    stats: calculatedStats,
    stat_stages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 },
    volatileStatuses: [],
    maxHp: calculatedMaxHp,
    currentHp: calculatedMaxHp, // Start with full HP
    fainted: false,
  };

  // 4. Return the merged object
  return { ...defaults, ...overrides, stats: { ...defaults.stats, ...overrides.stats } };
};

/**
 * Creates a complete, realistic Pokémon object by fetching data from the PokéAPI.
 * @param {string} name - The name of the Pokémon to fetch.
 * @param {object} overrides - An object with properties to override the fetched data (e.g., level, heldItem, status).
 * @returns {Promise<object>} A promise that resolves to a complete Pokémon object for use in tests.
 */
export const createPokemonFromApi = async (name, overrides = {}) => {
    // 1. Fetch the complete, realistic Pokémon data from your api.js utility
    const fetchedPokemon = await fetchPokemonData(name, overrides.level || 50);

    // 2. Merge the fetched data with any specific overrides needed for the test
    const finalPokemon = {
        ...fetchedPokemon,
        ...overrides,
        // Ensure nested objects like stats are also merged correctly
        stats: { ...fetchedPokemon.stats, ...overrides.stats }, 
    };

    // 3. If overrides change HP, ensure currentHp is updated
    if (overrides.maxHp && !overrides.currentHp) {
        finalPokemon.currentHp = overrides.maxHp;
    }

    return finalPokemon;
};

/**
 * Creates a complete battle state object.
 * @param {Array<object>} playerTeam - An array of Pokémon objects for the player.
 *p * @param {Array<object>} opponentTeam - An array of Pokémon objects for the opponent.
 * @param {object} fieldOverrides - An object with properties to override the default field state.
 * @returns {object} A complete battleState object.
 */
export const createBattleState = (playerTeam, opponentTeam, fieldOverrides = {}) => {
  const fieldDefaults = { weather: 'none', terrain: 'none', hazards: {}, trickRoomTurns: 0 };
  
  return {
    teams: [
      { id: 'players', pokemon: playerTeam },
      { id: 'opponent', pokemon: opponentTeam }
    ],
    activePokemonIndices: {
      players: [0], // Assumes the first Pokémon in the array is active
      opponent: [0]
    },
    field: { ...fieldDefaults, ...fieldOverrides },
    log: [],
    turn: 1,
  };
};

/**
 * A simple helper to find a Pokémon by name in the final battle state.
 * @param {object} finalBattleState - The state object after a turn has been executed.
 * @param {string} name - The name of the Pokémon to find.
 * @returns {object} The Pokémon object.
 */
export const findPokemon = (finalBattleState, name) => {
  return finalBattleState.teams.flatMap(t => t.pokemon).find(p => p.name === name);
};