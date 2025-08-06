// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

jest.mock('./utils/api', () => ({
  __esModule: true,
  // Create blank mock functions for the API calls.
  // By default, they do nothing and return 'undefined'.
  fetchPokemonData: jest.fn(),
  fetchMoveData: jest.fn(),
  fetchItemData: jest.fn(),
  
  // For functions in api.js that DON'T make network calls,
  // we tell Jest to use the REAL implementation.
  calculateStat: jest.requireActual('./utils/api').calculateStat,
  getSprite: jest.requireActual('./utils/api').getSprite,
  calculateHitChance: jest.requireActual('./utils/api').calculateHitChance,
  calculateCritStage: jest.requireActual('./utils/api').calculateCritStage,
}));