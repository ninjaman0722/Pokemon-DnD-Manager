import React from "react";

export const POKEAPI_BASE_URL = "https://pokeapi.co/api/v2/";
export const MAX_PARTY_SIZE = 6;

export const NON_VOLATILE_STATUSES = ["None", "Burned", "Frozen", "Paralyzed", "Poisoned", "Badly Poisoned", "Asleep"];
export const VOLATILE_STATUSES = ["Infatuated", "Trapped", "Cursed", "Confused", "Leech Seed", "Nightmare", "Encore", "Taunt", "Embargo", "Identified", "Perish Song"];
export const ALL_STATUS_CONDITIONS = {
    "None": { short: 'OK', color: 'bg-green-500' },
    "Burned": { short: 'BRN', color: 'bg-orange-500' },
    "Frozen": { short: 'FRZ', color: 'bg-cyan-400' },
    "Paralyzed": { short: 'PAR', color: 'bg-yellow-400' },
    "Poisoned": { short: 'PSN', color: 'bg-purple-500' },
    "Badly Poisoned": { short: 'PSN', color: 'bg-purple-700' },
    "Asleep": { short: 'SLP', color: 'bg-gray-400' },
    "Infatuated": { short: 'INF', color: 'bg-pink-500' },
    "Trapped": { short: 'TRP', color: 'bg-yellow-800' },
    "Cursed": { short: 'CRS', color: 'bg-indigo-900' },
    "Confused": { short: 'CNF', color: 'bg-teal-500' },
    "Leech Seed": { short: 'LCH', color: 'bg-lime-600' },
    "Nightmare": { short: 'Ngt', color: 'bg-gray-800' },
    "Encore": { short: 'ENC', color: 'bg-pink-400' },
    "Taunt": { short: 'TNT', color: 'bg-red-700' },
    "Embargo": { short: 'EMB', color: 'bg-gray-600' },
    "Identified": { short: 'IDD', color: 'bg-blue-300 text-black' },
    "Perish Song": { short: 'PER', color: 'bg-purple-800' }
};
export const MOVE_CATEGORY_ICONS = {
    physical: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M21.728 10.463l-5.74-5.74-1.414 1.414 4.326 4.327-4.326 4.327 1.414 1.414 5.74-5.74a1 1 0 000-1.414zM11.728 4.723L6 10.463a1 1 0 000 1.414l5.728 5.74 1.414-1.414-4.314-4.327 4.314-4.327-1.414-1.414z" /></svg>,
    special: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 4a8 8 0 100 16 8 8 0 000-16zM2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12z" /></svg>,
    status: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 100-16 8 8 0 000 16z" /></svg>
};

export const TYPE_ICONS = {
    normal: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M12 17.25a5.25 5.25 0 01-5.25-5.25H12v5.25z" clipRule="evenodd" /><path d="M12.75 17.25a5.25 5.25 0 005.25-5.25H12.75v5.25zM12 6.75a5.25 5.25 0 00-5.25 5.25H12V6.75z" /><path d="M12.75 6.75a5.25 5.25 0 015.25 5.25H12.75V6.75z" /></svg>,
    fire: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071 1.052A9.75 9.75 0 0110.303 9.75H4.5a.75.75 0 000 1.5h5.803a9.75 9.75 0 01-2.164 6.412.75.75 0 101.24 0A8.25 8.25 0 0018.75 9.75h.75a.75.75 0 000-1.5h-.75a8.25 8.25 0 00-2.25-5.714.75.75 0 00-1.286-.75z" clipRule="evenodd" /></svg>,
    water: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 3a.75.75 0 01.75.75v3.165a3.75 3.75 0 01-1.5 0V6a.75.75 0 01.75-.75zm0 8.25a3.75 3.75 0 01-1.555-7.143.75.75 0 11.555 1.357A2.25 2.25 0 0013.5 13.5a.75.75 0 011.5 0 3.75 3.75 0 01-3 0z" clipRule="evenodd" /></svg>,
    grass: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M15.75 2.25a.75.75 0 00.584-1.246l-4.5-5.25a.75.75 0 00-1.168 0l-4.5 5.25A.75.75 0 006 2.25h9.75zM12 6a.75.75 0 01.75.75v5.518l1.97-1.97a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L8.22 11.36a.75.75 0 111.06-1.06l1.97 1.97V6.75A.75.75 0 0112 6zM4.5 19.5a.75.75 0 01.75-.75h13.5a.75.75 0 010 1.5H5.25a.75.75 0 01-.75-.75z" /></svg>,
    electric: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v1.285a.75.75 0 00.75.75h.25a.75.75 0 01.75.75v1.5a.75.75 0 00.75.75h.25a.75.75 0 00.75-.75v-1.5a.75.75 0 01.75-.75h.25a.75.75 0 01.75.75v1.5a.75.75 0 00.75.75h.25a.75.75 0 00.75-.75V6a.75.75 0 01.75-.75h.25a.75.75 0 00.5-.707V3.555A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533.75.75 0 00-1.5 0z" /><path fillRule="evenodd" d="M12.75 12.75a.75.75 0 01.75-.75h.25a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-.25a.75.75 0 01-.75-.75v-1.5zM10.5 12.75a.75.75 0 01.75-.75h.25a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-.25a.75.75 0 01-.75-.75v-1.5zM8.25 12.75a.75.75 0 01.75-.75h.25a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-.25a.75.75 0 01-.75-.75v-1.5zM15 12.75a.75.75 0 01.75-.75h.25a.75.75 0 01.75.75v1.5a.75.75 0 01-.75.75h-.25a.75.75 0 01-.75-.75v-1.5z" clipRule="evenodd" /></svg>,
    ice: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 1.5a8.25 8.25 0 100 16.5 8.25 8.25 0 000-16.5zm-3 7.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg>,
    fighting: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M16.5 3.75a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0V5.56l-3.22 3.22a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 010-1.06l3.22-3.22H16.5a.75.75 0 01-.75-.75zM3.75 16.5a.75.75 0 01.75.75v1.19l3.22-3.22a.75.75 0 011.06 0l1.5 1.5a.75.75 0 010 1.06l-3.22 3.22H8.25a.75.75 0 010-1.5h-.06l-1.69 1.69a.75.75 0 01-1.06-1.06L7.19 18.5H3.75a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg>,
    poison: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 8.25a.75.75 0 000 1.5h.75a.75.75 0 000-1.5h-.75zm-1.5.75a.75.75 0 01.75-.75h.75a.75.75 0 010 1.5h-.75a.75.75 0 01-.75-.75zm-1.5-.75a.75.75 0 000 1.5h.75a.75.75 0 000-1.5h-.75zm4.5.75a.75.75 0 01.75-.75h.75a.75.75 0 010 1.5h-.75a.75.75 0 01-.75-.75zm1.5-.75a.75.75 0 000 1.5h.75a.75.75 0 000-1.5h-.75z" clipRule="evenodd" /><path d="M12 6.75a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3a.75.75 0 01.75-.75z" /></svg>,
    ground: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm1.5 0a8.25 8.25 0 1016.5 0 8.25 8.25 0 00-16.5 0z" clipRule="evenodd" /><path fillRule="evenodd" d="M12 1.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5a.75.75 0 01.75-.75zM8.25 4.5a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zm7.5 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75z" clipRule="evenodd" /></svg>,
    flying: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12.378 1.602a.75.75 0 00-.756 0L3 7.225V19.5a.75.75 0 00.75.75h16.5a.75.75 0 00.75-.75V7.225l-8.622-5.623zM12 3.425l6.38 4.156-6.38 4.156L5.62 7.581 12 3.425z" /></svg>,
    psychic: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 2.25a.75.75 0 01.75.75v18a.75.75 0 01-1.5 0v-18a.75.75 0 01.75-.75zM12 6a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h3a.75.75 0 01.75.75zm0 3a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h3a.75.75 0 01.75.75zm0 3a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h3a.75.75 0 01.75.75z" /></svg>,
    bug: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 1.5a8.25 8.25 0 100 16.5 8.25 8.25 0 000-16.5z" clipRule="evenodd" /><path fillRule="evenodd" d="M12 6.75a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5a.75.75 0 01.75-.75zm0 6a.75.75 0 01.75.75v.008a.75.75 0 01-1.5 0v-.008a.75.75 0 01.75-.75z" clipRule="evenodd" /></svg>,
    rock: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l3.75 3.75a.75.75 0 01-1.06 1.06l-2.72-2.72V10.5a.75.75 0 01-1.5 0V4.53L8.28 7.28a.75.75 0 01-1.06-1.06l3.75-3.75z" clipRule="evenodd" /><path fillRule="evenodd" d="M12 12.75a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75z" clipRule="evenodd" /><path fillRule="evenodd" d="M6.75 15a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg>,
    ghost: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 2.25a.75.75 0 01.75.75v.194l.346.173a.75.75 0 010 1.34l-.346.173V6a.75.75 0 01-1.5 0v-1.12l-.346-.173a.75.75 0 010-1.34l.346-.173V3a.75.75 0 01.75-.75zM12 9a.75.75 0 01.75.75v10.5a.75.75 0 01-1.5 0V9.75A.75.75 0 0112 9z" /></svg>,
    dragon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 2.25a.75.75 0 01.75.75v.518a.75.75 0 01-.75.75h-.018a.75.75 0 01-.75-.75V3a.75.75 0 01.75-.75z" /><path fillRule="evenodd" d="M12 6.75a.75.75 0 01.75.75v7.5a.75.75 0 01-1.5 0v-7.5a.75.75 0 01.75-.75z" clipRule="evenodd" /><path d="M12 18a.75.75 0 01.75.75v.518a.75.75 0 01-.75.75h-.018a.75.75 0 01-.75-.75v-.518a.75.75 0 01.75-.75z" /></svg>,
    dark: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v.518l.983.492a.75.75 0 010 1.34l-.983.491v1.838l.983.492a.75.75 0 010 1.34l-.983.491v1.838l.983.492a.75.75 0 010 1.34l-.983.491v1.838l.983.492a.75.75 0 010 1.34l-.983.491v.518a.75.75 0 01-1.5 0v-.518l-.983-.492a.75.75 0 010-1.34l.983-.491v-1.838l-.983-.492a.75.75 0 010-1.34l.983-.491v-1.838l-.983-.492a.75.75 0 010-1.34l.983-.491V3a.75.75 0 01.75-.75z" clipRule="evenodd" /></svg>,
    steel: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.944 1.54l-.022.076a1.99 1.99 0 00-1.884 1.884l-.076.022a1.99 1.99 0 00-1.54 1.944l.076.022c.112.033.22.07.324.11a1.99 1.99 0 001.54 1.944l.022.076c.033.111.07.219.11.324a1.99 1.99 0 001.944 1.54l.022-.076a1.99 1.99 0 001.884-1.884l.076-.022a1.99 1.99 0 001.54-1.944l-.076-.022a1.99 1.99 0 00-1.54-1.944l-.022-.076a1.99 1.99 0 00-1.944-1.54l-.022.076a1.99 1.99 0 00-1.884 1.884l-.076.022a1.99 1.99 0 00-1.54 1.944l.076.022c.11.033.22.07.324.11a1.99 1.99 0 001.54 1.944l.022.076c.033.11.07.219.11.324a1.99 1.99 0 001.944 1.54l.022-.076a1.99 1.99 0 001.884-1.884l.076-.022a1.99 1.99 0 001.54-1.944l-.076-.022a1.99 1.99 0 00-1.54-1.944l-.022-.076a1.99 1.99 0 00-1.944-1.54z" clipRule="evenodd" /></svg>,
    fairy: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354l-4.503 3.123c-.996.608-2.231-.289-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" /></svg>,
};

export const TYPE_ENHANCING_ITEMS = {
    'black-belt': 'fighting', 'black-glasses': 'dark', 'charcoal': 'fire', 'dragon-fang': 'dragon',
    'hard-stone': 'rock', 'magnet': 'electric', 'metal-coat': 'steel', 'miracle-seed': 'grass',
    'mystic-water': 'water', 'never-melt-ice': 'ice', 'poison-barb': 'poison', 'sharp-beak': 'flying',
    'silk-scarf': 'normal', 'silver-powder': 'bug', 'soft-sand': 'ground', 'spell-tag': 'ghost',
    'twisted-spoon': 'psychic', 'flame-plate': 'fire', 'sky-plate': 'flying', 'toxic-plate': 'poison',
    'earth-plate': 'ground', 'stone-plate': 'rock', 'insect-plate': 'bug', 'spooky-plate': 'ghost',
    'draco-plate': 'dragon', 'dread-plate': 'dark', 'iron-plate': 'steel', 'pixie-plate': 'fairy',
    'meadow-plate': 'grass', 'splash-plate': 'water', 'zap-plate': 'electric', 'icicle-plate': 'ice',
    'fist-plate': 'fighting', 'mind-plate': 'psychic'
};
export const HEALING_MOVES = new Set([
    'recover', 'roost', 'slack-off', 'soft-boiled', 'synthesis', 'moonlight', 'morning-sun',
    'heal-pulse', 'milk-drink', 'heal-order', 'rest'
]);
export const AQUA_RING_MOVE = 'aqua-ring';
export const INGRAIN_MOVE = 'ingrain';
export const DISABLE_INDUCING_MOVES = new Set(['disable']);
export const TORMENT_INDUCING_MOVES = new Set(['torment']);
export const HEAL_BLOCK_INDUCING_MOVES = new Set(['heal-block']);
export const REDIRECTING_MOVES = new Set(['follow-me', 'rage-powder', 'spotlight']);
export const PUNCHING_MOVES = new Set(['comet-punch', 'dizzy-punch', 'double-iron-bash', 'drain-punch', 'dynamic-punch', 'fire-punch', 'focus-punch', 'hammer-arm', 'ice-hammer', 'ice-punch', 'jet-punch', 'mach-punch', 'mega-punch', 'plasma-fists', 'power-up-punch', 'shadow-punch', 'sky-uppercut', 'surging-strikes', 'thunder-punch', 'wicked-blow']);
export const EXPLOSIVE_MOVES = new Set(['explosion', 'self-destruct', 'misty-explosion', 'mind-blown']);
export const SOUND_MOVES = new Set(['boomburst', 'bug-buzz', 'chatter', 'clanging-scales', 'clangorous-soul', 'disarming-voice', 'echoed-voice', 'eerie-spell', 'grass-whistle', 'growl', 'howl', 'hyper-voice', 'metal-sound', 'noble-roar', 'overdrive', 'parting-shot', 'perish-song', 'relic-song', 'round', 'screech', 'shadow-panic', 'sing', 'snarl', 'snore', 'sparkling-aria', 'supersonic', 'torch-song', 'uproar']);
export const AURA_PULSE_MOVES = new Set(['aura-sphere', 'dark-pulse', 'dragon-pulse', 'heal-pulse', 'origin-pulse', 'terrain-pulse', 'water-pulse']);
export const BITING_MOVES = new Set(['bite', 'crunch', 'fire-fang', 'fishious-rend', 'hyper-fang', 'ice-fang', 'jaw-lock', 'poison-fang', 'psychic-fangs', 'strong-jaw', 'thunder-fang']);
export const CONFUSION_INDUCING_MOVES = new Set(['chatter', 'confuse-ray', 'confusion', 'dizzy-punch', 'dynamic-punch', 'flatter', 'psybeam', 'rock-climb', 'shadow-panic', 'signal-beam', 'strange-steam', 'supersonic', 'swagger', 'sweet-kiss', 'teeter-dance', 'water-pulse']);
export const LEECH_SEED_MOVE = 'leech-seed';
export const CURSE_MOVE = 'curse';
export const NIGHTMARE_MOVE = 'nightmare';
export const ENCORE_MOVE = 'encore';
export const TAUNT_MOVE = 'taunt';
export const INFATUATION_MOVE = 'attract';
export const ABILITY_REPLACEMENT_MOVES = new Map([
    ['worry-seed', 'insomnia'],
    ['simple-beam', 'simple']
]);
export const REFLECT_TYPE_MOVES = new Set(['reflect']);
export const LIGHT_SCREEN_TYPE_MOVES = new Set(['light-screen']);
export const AURORA_VEIL_MOVE = new Set(['aurora-veil']);
export const ABILITY_SUPPRESSING_MOVES = new Set(['gastro-acid', 'worry-seed', 'simple-beam', 'entrainment']);
export const MULTI_HIT_MOVES = new Map([
    ['barrage', [2, 5]],
    ['bone-rush', [2, 5]],
    ['comet-punch', [2, 5]],
    ['double-slap', [2, 5]],
    ['fury-attack', [2, 5]],
    ['fury-swipes', [2, 5]],
    ['icicle-spear', [2, 5]],
    ['pin-missile', [2, 5]],
    ['rock-blast', [2, 5]],
    ['scale-shot', [2, 5]],
    ['spike-cannon', [2, 5]],
    ['tail-slap', [2, 5]],
    ['water-shuriken', [2, 5]],
    ['bullet-seed', [2, 5]],
    ['double-kick', [2, 2]],
    ['gear-grind', [2, 2]],
    ['dual-chop', [2, 2]],
    ['dual-wingbeat', [2, 2]],
    ['dragon-darts', [2, 2]],
    ['surging-strikes', [3, 3]],
    ['triple-kick', [1, 3]], // Special case, power increases
    ['triple-axel', [1, 3]], // Special case, power increases
    ['population-bomb', [1, 10]]
]);
export const MOVE_TO_WEATHER_MAP = new Map([
    ['rain-dance', 'rain'],
    ['sunny-day', 'sunshine'],
    ['sandstorm', 'sandstorm'],
    ['snowscape', 'snow'], // Using Snowscape as the modern equivalent of Hail
    ['hail', 'snow']      // Including Hail for backward compatibility
]);

export const WEATHER_EXTENDING_ROCKS = {
    'rain': 'damp rock',
    'sunshine': 'heat rock',
    'sandstorm': 'smooth rock',
    'snow': 'icy rock'
};

export const API_AILMENT_TO_STATUS_MAP = {
    'burn': 'Burned',
    'paralysis': 'Paralyzed',
    'poison': 'Poisoned',
    'freeze': 'Frozen',
    'sleep': 'Asleep',
    'infatuation': 'Infatuated',
    'trap': 'Trapped',
    'curse': 'Cursed',
    'confusion': 'Confused',
    'leech-seed': 'Leech Seed',
    'nightmare': 'Nightmare',
    'encore': 'Encore',
    'taunt': 'Taunt',
    'embargo': 'Embargo',
    'foresight': 'Identified',
    'perish-song': 'Perish Song'
};

export const SPECIAL_EFFECT_MOVES = new Set([
    'curse', 'leech seed', 'taunt', 'encore', 'embargo', 'foresight', 'odor sleuth', 'perish song', 'nightmare'
]);
export const GUARANTEED_CRIT_MOVES = new Set(['frost-breath', 'storm-throw']);
export const PROTECTIVE_MOVES = new Set(['protect', 'detect']);
export const CONSECUTIVE_TURN_MOVES = new Set(['outrage', 'petal-dance', 'thrash']);
export const HIGH_CRIT_RATE_MOVES = new Set(['slash', 'stone-edge', 'leaf-blade', 'night-slash', 'psycho-cut', 'shadow-claw', 'crabhammer', 'cross-chop', 'aeroblast', 'air-cutter', 'drill-run', 'karate-chop', 'poison-tail', 'razor-leaf', 'razor-wind', 'sky-attack', 'spacial-rend']);
export const TWO_TURN_MOVES = new Set(['fly', 'dig', 'dive', 'phantom-force', 'shadow-force', 'solar-beam', 'sky-attack', 'razor-wind']);
export const INVULNERABLE_DURING_CHARGE = new Set(['fly', 'dig', 'dive', 'phantom-force', 'shadow-force']);
export const BINDING_MOVES = new Set(['bind', 'clamp', 'fire-spin', 'infestation', 'magma-storm', 'sand-tomb', 'snap-trap', 'thunder-cage', 'whirlpool', 'wrap']);
export const SELF_STAT_LOWERING_MOVES = new Map([
    // Special Attack -2
    ['draco-meteor', [{ stat: 'special-attack', change: -2 }]],
    ['leaf-storm', [{ stat: 'special-attack', change: -2 }]],
    ['overheat', [{ stat: 'special-attack', change: -2 }]],
    ['fleur-cannon', [{ stat: 'special-attack', change: -2 }]],
    ['psycho-boost', [{ stat: 'special-attack', change: -2 }]],

    // Defenses -1
    ['close-combat', [{ stat: 'defense', change: -1 }, { stat: 'special-defense', change: -1 }]],
    ['shell-smash', [{ stat: 'defense', change: -1 }, { stat: 'special-defense', change: -1 }, { stat: 'attack', change: 2 }, { stat: 'special-attack', change: 2 }, { stat: 'speed', change: 2 }]], // Also boosts offenses/speed

    // Attack & Defense -1
    ['superpower', [{ stat: 'attack', change: -1 }, { stat: 'defense', change: -1 }]],

    // Speed -1
    ['hammer-arm', [{ stat: 'speed', change: -1 }]],
    ['ice-hammer', [{ stat: 'speed', change: -1 }]],

    // Multiple Stats -1
    ['v-create', [{ stat: 'defense', change: -1 }, { stat: 'special-defense', change: -1 }, { stat: 'speed', change: -1 }]],
]);
export const CONTACT_MOVES = new Set([
    'absorb', 'accelerock', 'acrobatics', 'aerial-ace', 'anchor-shot',
    'aqua-cutter', 'aqua-step', 'aqua-tail', 'arm-thrust', 'assurance',
    'astonish', 'attack-order', 'axe-kick', 'barb-barrage', 'behemoth-bash',
    'behemoth-blade', 'bide', 'bind', 'bite', 'blaze-kick',
    'body-press', 'body-slam', 'bolt-beak', 'bolt-strike', 'bounce',
    'branch-poke', 'brave-bird', 'brick-break', 'brutal-swing', 'bug-bite',
    'bulldoze', 'bullet-punch', 'burn-up', 'ceaseless-edge', 'chip-away',
    'circle-throw', 'clamp', 'close-combat', 'collision-course', 'comet-punch',
    'constrict', 'counter', 'covet', 'crabhammer', 'cross-chop', 'cross-poison',
    'crunch', 'crush-claw', 'crush-grip', 'cut', 'darkest-lariet',
    'diamond-storm', 'dire-claw', 'dive', 'dizzy-punch', 'double-edge',
    'double-hit', 'double-iron-bash', 'double-kick', 'double-slap', 'dragon-breath',
    'dragon-claw', 'dragon-hammer', 'dragon-rush', 'dragon-tail', 'drain-punch',
    'drill-peck', 'drill-run', 'dual-chop', 'dual-wingbeat', 'dynamic-punch',
    'electro-drift', 'endeavor', 'facade', 'fake-out', 'false-surrender',
    'feint', 'feint-attack', 'feral-pounce', 'fire-fang', 'fire-lash',
    'fire-punch', 'first-impression', 'fishious-rend', 'flail', 'flame-charge',
    'flame-wheel', 'flare-blitz', 'flip-turn', 'floaty-fall', 'fly',
    'flying-press', 'focus-punch', 'force-palm', 'foul-play', 'fury-attack',
    'fury-cutter', 'fury-swipes', 'fusion-bolt', 'gear-grind', 'gigaton-hammer',
    'grass-knot', 'grassy-glide', 'guillotine', 'gyro-ball', 'hammer-arm',
    'head-charge', 'headbutt', 'headlong-rush', 'heat-crash', 'heavy-slam',
    'high-horsepower', 'high-jump-kick', 'horn-attack', 'horn-drill', 'horn-leech',
    'ice-ball', 'ice-fang', 'ice-hammer', 'ice-punch', 'ice-spinner',
    'icicle-crash', 'icicle-spear', 'infernal-parade', 'iron-head', 'jet-punch',
    'jump-kick', 'karate-chop', 'kowtow-cleave', 'last-resort', 'lunge',
    'leaf-blade', 'leech-life', 'lick', 'liquidation', 'low-kick', 'low-sweep',
    'mach-punch', 'megahorn', 'mega-kick', 'mega-punch', 'metal-claw', 'meteor-mash',
    'mortal-spin', 'mountain-gale', 'needle-arm', 'nuzzle', 'outrage',
    'payback', 'pay-day', 'peck', 'petal-dance', 'phantom-force', 'plasma-fists',
    'play-rough', 'pluck', 'poison-fang', 'poison-jab', 'poison-sting',
    'poison-tail', 'pounce', 'pound', 'power-trip', 'power-up-punch', 'power-whip',
    'pursuit', 'quick-attack', 'rage', 'rage-fist', 'raging-bull', 'raging-fury',
    'rapid-spin', 'razor-shell', 'retaliate', 'revenge', 'reversal', 'rock-climb',
    'rock-smash', 'rolling-kick', 'rollout', 'sacred-sword', 'salt-cure',
    'scratch', 'secret-sword', 'seed-bomb', 'seismic-toss', 'shadow-claw',
    'shadow-punch', 'shadow-sneak', 'shadow-strike', 'shell-side-arm', 'skitter-smack',
    'skull-bash', 'sky-attack', 'sky-drop', 'sky-uppercut', 'slam', 'slash',
    'smart-strike', 'smelling-salts', 'solar-blade', 'spark', 'spiky-shield',
    'spin-out', 'spirit-shackle', 'steel-roller', 'steel-wing', 'stomp',
    'stomping-tantrum', 'stone-axe', 'storm-throw', 'strength', 'struggle',
    'submission', 'sucker-punch', 'sunsteel-strike', 'super-fang', 'superpower',
    'surging-strikes', 'tackle', 'tail-slap', 'take-down', 'thief',
    'thousand-arrows', 'thousand-waves', 'thrash', 'throat-chop', 'thunder-fang',
    'thunder-punch', 'thunderous-kick', 'tickle', 'triple-axel', 'triple-dive',
    'triple-kick', 'trop-kick', 'twin-needle', 'u-turn', 'upper-hand', 'v-create',
    'vice-grip', 'vine-whip', 'vital-throw', 'volt-tackle', 'wake-up-slap',
    'waterfall', 'wave-crash', 'wicked-blow', 'wild-charge', 'wing-attack',
    'wood-hammer', 'wrap', 'wring-out', 'x-scissor', 'zen-headbutt', 'zing-zap'
]);
export const REFLECTABLE_MOVES = new Set([
    'stealth-rock', 'spikes', 'toxic-spikes', 'sticky-web', 'toxic',
    'will-o-wisp', 'thunder-wave', 'leech-seed', 'taunt', 'torment',
    'disable', 'encore', 'confuse-ray', 'swagger', 'attract'
    // Add any other status moves you want to be reflectable
]);
export const RECOIL_MOVES = new Map([
    ['brave-bird', 1 / 3], ['double-edge', 1 / 3], ['flare-blitz', 1 / 3], ['wood-hammer', 1 / 3],
    ['head-smash', 1 / 2], ['submission', 1 / 4], ['take-down', 1 / 4], ['volt-tackle', 1 / 3],
    ['wild-charge', 1 / 4], ['head-charge', 1 / 4],
]);
export const MOVE_TO_TERRAIN_MAP = new Map([
    ['electric-terrain', 'electric-terrain'],
    ['grassy-terrain', 'grassy-terrain'],
    ['misty-terrain', 'misty-terrain'],
    ['psychic-terrain', 'psychic-terrain']
]);
export const DRAIN_MOVES = new Map([
    ['giga-drain', 1 / 2], ['drain-punch', 1 / 2], ['horn-leech', 1 / 2],
    ['absorb', 1 / 2], ['mega-drain', 1 / 2], ['leech-life', 1 / 2],
]);

export const CRIT_CHANCE_PERCENTAGES = {
    0: '4.17%', // 1/24
    1: '12.5%', // 1/8
    2: '50%',   // 1/2
    3: '100%',
};
export const POCKETS = [
    'Medicine',
    'Poké Balls',
    'TMs',
    'Berries',
    'Battle Items',
    'Evolution',
    'Key Items',
    'Other'
];

// 2. REPLACE your old mapping object with this more detailed one.
export const CATEGORY_TO_POCKET_MAPPING = {
    // Medicine Pocket
    'healing': 'Medicine',
    'status cures': 'Medicine',
    'revival': 'Medicine',
    'pp recovery': 'Medicine',
    'vitamins': 'Medicine',
    'effort training': 'Medicine',
    
    // Poké Balls Pocket
    'standard balls': 'Poké Balls',
    'special balls': 'Poké Balls',
    'apricorn balls': 'Poké Balls',

    // TMs Pocket
    'all machines': 'TMs',

    // Berries Pocket
    'all berries': 'Berries',

    // Battle Items Pocket
    'in a pinch': 'Battle Items',
    'picky healing': 'Battle Items',
    'type enhancement': 'Battle Items',
    'choice': 'Battle Items',
    'miracle shooter': 'Battle Items',
    'stat boosts': 'Battle Items',
    'flutes': 'Battle Items',
    'held items': 'Battle Items',

    // Evolution Pocket
    'evolution': 'Evolution',

    // Key Items Pocket
    'key items': 'Key Items',
    'plot advancement': 'Key Items',
    'apricorn box': 'Key Items',
    'data cards': 'Key Items',
};
export const TYPE_COLORS = {
    normal: 'bg-gray-400 text-black',
    fire: 'bg-red-500 text-white',
    water: 'bg-blue-500 text-white',
    electric: 'bg-yellow-400 text-black', // Was yellow-300
    grass: 'bg-green-500 text-white',
    ice: 'bg-cyan-400 text-black',      // Was cyan-300
    fighting: 'bg-orange-700 text-white',
    poison: 'bg-purple-600 text-white',
    ground: 'bg-yellow-600 text-white',
    flying: 'bg-sky-400 text-black',
    psychic: 'bg-pink-500 text-white',     // Was pink-400
    bug: 'bg-lime-500 text-black',
    rock: 'bg-yellow-800 text-white',
    ghost: 'bg-indigo-700 text-white',
    dragon: 'bg-indigo-500 text-white',
    dark: 'bg-gray-700 text-white',
    steel: 'bg-slate-500 text-white',
    fairy: 'bg-pink-400 text-black',      // Was pink-300
};
export const TYPE_CHART = { "normal": { "rock": 0.5, "steel": 0.5, "ghost": 0 }, "fire": { "fire": 0.5, "water": 0.5, "grass": 2, "ice": 2, "bug": 2, "rock": 0.5, "dragon": 0.5, "steel": 2 }, "water": { "fire": 2, "water": 0.5, "grass": 0.5, "ground": 2, "rock": 2, "dragon": 0.5 }, "electric": { "water": 2, "electric": 0.5, "grass": 0.5, "ground": 0, "flying": 2, "dragon": 0.5 }, "grass": { "fire": 0.5, "water": 2, "grass": 0.5, "poison": 0.5, "ground": 2, "flying": 0.5, "bug": 0.5, "rock": 2, "dragon": 0.5, "steel": 0.5 }, "ice": { "fire": 0.5, "water": 0.5, "grass": 2, "ice": 0.5, "ground": 2, "flying": 2, "dragon": 2, "steel": 0.5 }, "fighting": { "normal": 2, "ice": 2, "poison": 0.5, "flying": 0.5, "psychic": 0.5, "bug": 0.5, "rock": 2, "ghost": 0, "dark": 2, "steel": 2, "fairy": 0.5 }, "poison": { "grass": 2, "poison": 0.5, "ground": 0.5, "rock": 0.5, "ghost": 0.5, "steel": 0, "fairy": 2 }, "ground": { "fire": 2, "electric": 2, "grass": 0.5, "poison": 2, "flying": 0, "bug": 0.5, "rock": 2, "steel": 2 }, "flying": { "electric": 0.5, "grass": 2, "fighting": 2, "bug": 2, "rock": 0.5, "steel": 0.5 }, "psychic": { "fighting": 2, "poison": 2, "psychic": 0.5, "dark": 0, "steel": 0.5 }, "bug": { "fire": 0.5, "grass": 2, "fighting": 0.5, "poison": 0.5, "flying": 0.5, "psychic": 2, "ghost": 0.5, "dark": 2, "steel": 0.5, "fairy": 0.5 }, "rock": { "fire": 2, "ice": 2, "fighting": 0.5, "ground": 0.5, "flying": 2, "bug": 2, "steel": 0.5 }, "ghost": { "normal": 0, "psychic": 2, "ghost": 2, "dark": 0.5 }, "dragon": { "dragon": 2, "steel": 0.5, "fairy": 0 }, "dark": { "fighting": 0.5, "psychic": 2, "ghost": 2, "dark": 0.5, "fairy": 0.5 }, "steel": { "fire": 0.5, "water": 0.5, "electric": 0.5, "ice": 2, "rock": 2, "steel": 0.5, "fairy": 2 }, "fairy": { "fighting": 2, "poison": 0.5, "dragon": 2, "dark": 2, "steel": 0.5 } };
export const SELF_DEBUFF_MOVES = new Set(['leaf-storm', 'draco-meteor', 'overheat', 'fleur-cannon', 'psycho-boost', 'superpower', 'close-combat', 'v-create', 'hammer-arm']);

export const SUPER_EFFECTIVE_BERRY_MAP = new Map([
    ['babiri berry', 'steel'],
    ['charti berry', 'rock'],
    ['chilan berry', 'normal'],
    ['chople berry', 'fighting'],
    ['coba berry', 'flying'],
    ['colbur berry', 'dark'],
    ['haban berry', 'dragon'],
    ['kasib berry', 'ghost'],
    ['kebia berry', 'poison'],
    ['occa berry', 'fire'],
    ['passho berry', 'water'],
    ['payapa berry', 'psychic'],
    ['rindo berry', 'grass'],
    ['roseli berry', 'fairy'],
    ['shuca berry', 'ground'],
    ['tanga berry', 'bug'],
    ['wacan berry', 'electric'],
    ['yache berry', 'ice']
]);
export const POKEBALLS = [
    { name: 'poke-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png' },
    { name: 'great-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/great-ball.png' },
    { name: 'ultra-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/ultra-ball.png' },
    { name: 'master-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/master-ball.png' },
    { name: 'safari-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/safari-ball.png' },
    { name: 'level-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/level-ball.png' },
    { name: 'lure-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/lure-ball.png' },
    { name: 'moon-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/moon-ball.png' },
    { name: 'friend-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/friend-ball.png' },
    { name: 'love-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/love-ball.png' },
    { name: 'heavy-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/heavy-ball.png' },
    { name: 'fast-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/fast-ball.png' },
    { name: 'sport-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/sport-ball.png' },
    { name: 'premier-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/premier-ball.png' },
    { name: 'repeat-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/repeat-ball.png' },
    { name: 'timer-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/timer-ball.png' },
    { name: 'nest-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/nest-ball.png' },
    { name: 'net-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/net-ball.png' },
    { name: 'dive-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dive-ball.png' },
    { name: 'luxury-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/luxury-ball.png' },
    { name: 'heal-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/heal-ball.png' },
    { name: 'quick-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/quick-ball.png' },
    { name: 'dusk-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dusk-ball.png' },
    { name: 'cherish-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/cherish-ball.png' },
    { name: 'park-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/park-ball.png' },
    { name: 'dream-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-ball.png' },
    { name: 'beast-ball', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/beast-ball.png' },
];
export const WEATHER_TYPES = ['none', 'sunshine', 'rain', 'sandstorm', 'snow', 'heavy-rain', 'harsh-sunshine', 'strong-winds'];
export const TERRAIN_TYPES = ['none', 'electric-terrain', 'grassy-terrain', 'misty-terrain', 'psychic-terrain'];
export const ENTRY_HAZARDS = ['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web'];

export const STAGE_MULTIPLIERS = {
    '6': { num: 9, den: 3 }, '5': { num: 8, den: 3 }, '4': { num: 7, den: 3 },
    '3': { num: 6, den: 3 }, '2': { num: 5, den: 3 }, '1': { num: 4, den: 3 },
    '0': { num: 3, den: 3 },
    '-1': { num: 3, den: 4 }, '-2': { num: 3, den: 5 }, '-3': { num: 3, den: 6 },
    '-4': { num: 3, den: 7 }, '-5': { num: 3, den: 8 }, '-6': { num: 3, den: 9 }
};
export const UNMISSABLE_MOVES = new Set([
    'aerial-ace',
    'aura-sphere',
    'disarming-voice',
    'feint-attack',
    'magical-leaf',
    'magnet-bomb',
    'power-up-punch',
    'shadow-punch',
    'shock-wave',
    'smart-strike',
    'swift',
    'vital-throw'
]);

export const DELAYED_DAMAGE_MOVES = new Set(['future-sight', 'doom-desire']);

export const OHKO_MOVES = new Set(['fissure', 'guillotine', 'horn-drill', 'sheer-cold']);

// A list of moves that Anticipation treats as Normal-type, regardless of their actual type.
export const ANTICIPATION_NORMAL_TYPE_MOVES = new Set([
    'judgment', 'weather-ball', 'natural-gift', 'revelation-dance', 'multi-attack', 'techno-blast'
]);
export const SWITCHING_MOVES = new Set(['u-turn', 'volt-switch', 'baton-pass', 'flip-turn', 'parting-shot', 'teleport']);
export const PHASING_MOVES = new Set(['dragon-tail', 'circle-throw']);

export const ARMOR_TAIL_IGNORED_TARGETS = new Set([
    'all-other-pokemon', 
    'all-opponents', 
    'opponents-field'
]);