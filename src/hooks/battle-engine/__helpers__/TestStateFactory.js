// This factory provides functions to easily create mock data for tests.

/**
 * Creates a complete Pokémon object with sensible defaults.
 * @param {string} name - The name of the Pokémon.
 * @param {object} overrides - An object with properties to override the defaults.
 * @returns {object} A complete Pokémon object for use in tests.
 */
export const createPokemon = (name, overrides = {}) => {
  const defaults = {
    id: `${name.toLowerCase()}-id-${Math.random()}`,
    name: name,
    level: 50,
    ability: 'overgrow',
    item: null,
    status: 'None',
    types: ['normal'],
    moves: [],
    stats: { attack: 50, defense: 50, 'special-attack': 50, 'special-defense': 50, speed: 50, hp: 100 },
    stat_stages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0 },
    volatileStatuses: [],
    maxHp: 100,
    currentHp: 100,
    fainted: false,
  };
  return { ...defaults, ...overrides };
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