import React, { memo } from 'react';
import { getSprite } from '../../utils/api'; // Import the helper function

const PokemonCard = ({ pokemon, onSelect, isSelected }) => (
    <div onClick={onSelect} className={`p-2 rounded-md cursor-pointer text-center ${isSelected ? 'bg-blue-600 ring-2 ring-white' : 'bg-gray-700 hover:bg-gray-600'}`}>
        <img 
            src={getSprite(pokemon)} 
            alt={pokemon.name} 
            className="mx-auto h-20 w-20" 
        />
        <p className="text-sm font-semibold truncate">{pokemon.name}</p>
        <p className="text-xs text-gray-400 truncate">Lvl {pokemon.level}</p>
    </div>
);

export default memo(PokemonCard);