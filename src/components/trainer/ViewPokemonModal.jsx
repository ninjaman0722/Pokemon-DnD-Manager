// src/components/trainer/ViewPokemonModal.jsx
import React from 'react';
import { getSprite } from '../../utils/api';
import { TYPE_COLORS, MOVE_CATEGORY_ICONS } from '../../config/gameData';

const ViewPokemonModal = ({ pokemon, onClose }) => {
    if (!pokemon) return null;
    
    // The pokemon object from Firestore already has its final stats calculated.
    const stats = pokemon.stats || {};

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-bold capitalize">{pokemon.name}</h2>
                        <p className="text-gray-400">Lvl {pokemon.level}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                </div>

                {/* Core Info */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-shrink-0 text-center">
                        <img src={getSprite(pokemon)} alt={pokemon.name} className="w-32 h-32 bg-gray-700/50 rounded-md mx-auto" />
                        <div className="flex flex-wrap justify-center gap-2 mt-2">
                            {pokemon.types?.map((type, index) => {
                                const typeName = (typeof type === 'object' && type !== null) ? type.name : type;
                                return (
                                    <span key={`${typeName}-${index}`} className={`px-2 py-1 text-sm rounded-full uppercase font-bold ${TYPE_COLORS[typeName]}`}>
                                        {typeName}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex-grow space-y-3">
                        <div>
                            <h4 className="font-semibold text-indigo-300">Ability</h4>
                            <p className="capitalize">{pokemon.ability?.replace(/-/g, ' ')}</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-indigo-300">Held Item</h4>
                            <p className="capitalize">{pokemon.heldItem?.name || 'None'}</p>
                        </div>
                         <div>
                            <h4 className="font-semibold text-indigo-300">Stats</h4>
                            <ul className="text-sm grid grid-cols-3 gap-2 mt-1">
                                {Object.entries(stats).map(([key, value]) => 
                                    <li key={key} className="bg-gray-700 p-2 rounded text-center">
                                        <span className="font-semibold capitalize block">{key.replace('special-', 'Sp. ')}</span> {value}
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Moveset */}
                <div>
                    <h3 className="text-lg font-semibold text-indigo-300 mb-2">Moveset</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(pokemon.moves || []).map(move => (
                            <div key={move.name} className="bg-gray-700 p-3 rounded-lg">
                                <div className="flex justify-between items-center mb-1">
                                    <h4 className="font-bold capitalize">{move.name}</h4>
                                    <div className="flex items-center gap-2 text-xs">
                                        <div title={move.damage_class}>{MOVE_CATEGORY_ICONS[move.damage_class]}</div>
                                        <span className={`px-2 py-0.5 rounded uppercase font-bold text-xs ${TYPE_COLORS[move.type]}`}>{move.type}</span>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-400 flex justify-between">
                                    <span>Power: {move.power || '—'}</span>
                                    <span>Accuracy: {move.accuracy || '—'}</span>
                                    <span>PP: {move.pp} / {move.maxPp}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ViewPokemonModal;