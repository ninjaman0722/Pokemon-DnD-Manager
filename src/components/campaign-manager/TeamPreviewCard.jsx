import React from 'react';
import { getSprite } from '../../utils/api'; // Import the helper function

const TeamPreviewCard = ({ pokemon, onSelect, isActive }) => (
    <div onClick={onSelect} className={`relative p-2 rounded-md bg-gray-900 text-center cursor-pointer hover:bg-gray-800 ${isActive ? 'ring-2 ring-blue-400' : ''}`}>
        {isActive && <div className="absolute top-1 left-1 text-xs bg-blue-500 text-white font-bold rounded-full h-5 w-5 flex items-center justify-center z-10">A</div>}
        <img 
            src={getSprite(pokemon)} 
            alt={pokemon.name} 
            className="mx-auto h-16 w-16" 
        />
        <p className="text-xs truncate">{pokemon.name} (Lvl {pokemon.level})</p>
    </div>
);

export default TeamPreviewCard;