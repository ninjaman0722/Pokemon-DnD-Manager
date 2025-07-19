// src/components/trainer/TrainerPokemonCard.jsx
import React, { useState } from 'react';
import { getSprite } from '../../utils/api';
import { TYPE_COLORS } from '../../config/gameData';

const TrainerPokemonCard = ({ pokemon, permissions, onSaveNickname, onClick }) => {
    // State to manage whether the input field is visible
    const [isEditing, setIsEditing] = useState(false);
    // State to hold the value of the input field
    const [nickname, setNickname] = useState(pokemon.name);

    const handleSave = (e) => {
        e.stopPropagation();

        const trimmedNickname = nickname.trim();

        if (!trimmedNickname) {
            // --- THIS IS THE CHANGE ---
            // Get the original species name (e.g., "skeledirge")
            const originalName = pokemon.speciesName;
            // Create a new capitalized version (e.g., "Skeledirge")
            const capitalizedName = originalName.charAt(0).toUpperCase() + originalName.slice(1);
            // Save the newly capitalized version to the database
            onSaveNickname(pokemon.id, capitalizedName);
            // --- END CHANGE ---
        }
        else if (trimmedNickname !== pokemon.name) {
            onSaveNickname(pokemon.id, trimmedNickname);
        }

        setIsEditing(false);
    };

    const handleNameClick = (e) => {
        e.stopPropagation(); // Prevent the main card click from firing
        // Only enter edit mode if the permission is granted
        if (permissions.canEditNicknames) {
            setIsEditing(true);
        }
    };

    return (
        <div
            onClick={onClick}
            className={`m-1 cursor-pointer p-2 bg-gray-700 rounded-md flex flex-col justify-between transition-all duration-200 ${pokemon.fainted ? 'opacity-50' : ''}`}
        >
            {pokemon.fainted && (<div className="absolute inset-0 flex items-center justify-center z-20"><span className="text-red-500 font-bold text-lg transform -rotate-12 bg-black/50 px-2 py-1 rounded">FAINTED</span></div>)}
            {pokemon.heldItem?.sprite && <div className="absolute top-1 right-1 bg-gray-500/50 p-0.5 rounded-full z-10" title={pokemon.heldItem.name}><img src={pokemon.heldItem.sprite} alt={pokemon.heldItem.name} className="h-6 w-6" /></div>}

            <div className="text-center">
                <img src={getSprite(pokemon)} alt={pokemon.name} className="mx-auto h-20 w-20 pointer-events-none" />

                {/* Nickname editing logic */}
                {isEditing ? (
                    <input
                        type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(e); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-center bg-gray-900 rounded-md text-white mt-1"
                        autoFocus
                    />
                ) : (
                    <p className="text-sm font-semibold truncate mt-1 cursor-pointer" onClick={handleNameClick}>
                        {pokemon.name}
                        {permissions.canEditNicknames && <span className="text-xs text-gray-400 ml-1 hover:underline">(edit)</span>}
                    </p>
                )}

                {/* --- THESE ARE THE MISSING LINES --- */}
                <p className="text-xs text-gray-300">Lvl {pokemon.level}</p>
                <div className="w-full bg-gray-900 rounded-full h-2 my-1">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(pokemon.currentHp / pokemon.maxHp) * 100}%` }}></div>
                </div>
                {/* --- END MISSING LINES --- */}
            </div>
            <div className="flex flex-wrap justify-center gap-1 mt-1">{pokemon.types?.map(type => <span key={type} className={`px-1.5 py-0.5 text-xs rounded-full uppercase font-bold ${TYPE_COLORS[type]}`}>{type}</span>)}</div>
        </div>
    );
};

export default TrainerPokemonCard;