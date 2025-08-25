// src/components/manager/setup/Step3_OpponentTeam.jsx
import React from 'react';
import AutocompleteInput from '../../common/AutocompleteInput'; // Adjust path as needed
import PokemonCard from '../PokemonCard'; // Adjust path as needed
import { MAX_PARTY_SIZE } from '../../../config/gameData'; // Adjust path as needed

const Step3_OpponentTeam = ({
    // Props for Wild Battles (unchanged)
    battleType,
    wildPokemonToAdd,
    setWildPokemonToAdd,
    handleWildPokemonSelect,
    combinedPokemonList,
    
    // New Props for Multi-Trainer Opponent Selection
    numOpponentTrainers,
    opponents,
    toggleOpponentTrainerSelection,
    opponentTrainerIds,
    selectedOpponentTrainers,
    toggleOpponentPokemonSelection,
    opponentTeam
}) => {
    return (
        <div>
            <h2 className="text-2xl font-semibold text-indigo-300">Opponent Team Selection</h2>
            <div className="my-4">
                {battleType === 'WILD' ? (
                    <div>
                        <p className="mb-2 text-sm text-gray-400">Add Wild Pokémon:</p>
                        <AutocompleteInput
                            value={wildPokemonToAdd}
                            onChange={setWildPokemonToAdd}
                            onSelect={handleWildPokemonSelect}
                            placeholder="Search to add & edit wild Pokémon..."
                            sourceList={combinedPokemonList}
                        />
                    </div>
                ) : (
                    <div>
                        <div className="mb-4">
                            <p className="mb-2 text-sm text-gray-400">1. Select {numOpponentTrainers} Opponent(s):</p>
                            <div className="flex flex-wrap gap-2">
                                {opponents
                                    .filter(t => (battleType === 'BOSS' ? t.category === 'bosses' : true))
                                    .map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => toggleOpponentTrainerSelection(t.id)}
                                        className={`p-2 rounded-md text-sm ${
                                            opponentTrainerIds.includes(t.id) ? 'bg-red-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
                                        }`}
                                    >
                                        {t.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {opponentTrainerIds.length > 0 && (
                             <div className="space-y-4">
                                <p className="mb-2 text-sm text-gray-400">2. Select up to {MAX_PARTY_SIZE} total Pokémon for the opponent team:</p>
                                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                    {selectedOpponentTrainers.map(trainer => (
                                        <div key={trainer.id}>
                                            <h4 className="font-bold text-red-300">{trainer.name}'s Roster</h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-1">
                                                {trainer.roster.map(p => (
                                                    <PokemonCard
                                                        key={p.id}
                                                        pokemon={p}
                                                        // THIS IS THE FIX: Pass trainer info with the Pokémon, just like the player selection step.
                                                        onSelect={() => toggleOpponentPokemonSelection({ ...p, originalTrainerId: trainer.id, originalTrainer: trainer.name })}
                                                        isSelected={opponentTeam.some(sel => sel.id === p.id)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Step3_OpponentTeam;