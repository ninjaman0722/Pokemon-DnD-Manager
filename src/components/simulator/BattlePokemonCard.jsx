// src/components/simulator/BattlePokemonCard.jsx

import React from 'react';
import HPBar from '../common/HPBar';
import { ALL_STATUS_CONDITIONS } from '../../config/gameData';

const BattlePokemonCard = ({ pokemon, isPlayerSide, onClick, isSelectable, isSelected }) => {
    if (!pokemon) return null;

    // --- THIS IS THE CORRECTED SPRITE LOGIC ---
    // It directly uses the 'sprites' object from the Pokémon data, which will
    // automatically be correct for both base forms and transformed forms.
    const getSpriteUrl = (pkmn) => {
        // Guard against missing data
        if (!pkmn) return '';

        // Check for the new properties we discovered from the console log.
        if (pkmn.isShiny && pkmn.shinySprite) {
            return pkmn.shinySprite;
        }
        if (!pkmn.isShiny && pkmn.sprite) {
            return pkmn.sprite;
        }
        
        // Add a fallback for the nested sprites object, just in case.
        if (pkmn.isShiny && pkmn.sprites?.shiny) {
            return pkmn.sprites.shiny;
        }
        if (!pkmn.isShiny && pkmn.sprites?.default) {
            return pkmn.sprites.default;
        }

        // If all checks fail, log a warning and return an empty string.
        console.warn("Could not find a valid sprite URL for:", pkmn);
        return '';
    };

    const spriteUrl = getSpriteUrl(pokemon);

    let ringClass = '';
    if (isSelected) {
        ringClass = 'ring-4 ring-green-400';
    } else if (isSelectable) {
        ringClass = 'ring-4 ring-yellow-400';
    }

    return (
        <div onClick={onClick} className={`relative flex flex-col items-center transition-all duration-300 cursor-pointer ${pokemon.fainted ? 'opacity-50' : 'opacity-100'} ${ringClass} rounded-lg`}>
            {/* The <img> tag now uses our corrected spriteUrl */}
            <img src={spriteUrl} alt={pokemon.name} className="h-32 w-32 drop-shadow-lg" />
            
            <div className="bg-gray-900/70 p-2 rounded-lg w-56 text-center">
                <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-lg">{pokemon.name}</h3>
                    <span className="text-md">Lvl {pokemon.level}</span>
                </div>
                <HPBar currentHp={pokemon.currentHp} maxHp={pokemon.maxHp} className="h-4 border-2 border-gray-900" />
                {isPlayerSide && <p className="text-sm mt-1 font-mono">{pokemon.currentHp}/{pokemon.maxHp}</p>}
                <div className="flex justify-center items-center gap-1 mt-1 h-5">
                    {pokemon.status && pokemon.status !== 'None' && (
                        <span className={`text-white text-xs font-bold ${ALL_STATUS_CONDITIONS[pokemon.status]?.color} px-1.5 py-0.5 rounded-full`}>
                            {ALL_STATUS_CONDITIONS[pokemon.status]?.short}
                        </span>
                    )}
                    {pokemon.volatileStatuses?.map(statusName => {
                        const statusInfo = ALL_STATUS_CONDITIONS[statusName];
                        if (!statusInfo) return null;
                        return <span key={statusName} className={`text-white text-xs font-bold ${statusInfo.color} px-1.5 py-0.5 rounded-full`}>{statusInfo.short}</span>
                    })}
                </div>
                <div className="text-xs text-gray-300 mt-1 capitalize">
                    {pokemon.ability && <span>Ability: {pokemon.ability.replace(/-/g, ' ')}</span>}
                    {pokemon.heldItem && <span className="ml-2">Item: {pokemon.heldItem.name.replace(/-/g, ' ')}</span>}
                </div>
            </div>
        </div>
    );
};

export default BattlePokemonCard;