// src/components/manager/setup/Step2_PlayerTeam.jsx
import React from 'react';
import PokemonCard from '../PokemonCard'; // Assuming PokemonCard is in a sibling folder

const Step2_PlayerTeam = ({
    partyMembers,
    numTrainers,
    pokemonPerTrainer,
    playerTrainerIds,
    playerTeam,
    togglePlayerTrainerSelection,
    togglePlayerPokemonSelection,
    selectedPlayerTrainers
}) => {
    return (
        <div>
            <h2 className="text-2xl font-semibold text-indigo-300">Player Team Selection</h2>
            <div className="my-4">
                <p className="mb-2 text-sm text-gray-400">1. Select {numTrainers} Party Member(s):</p>
                <div className="flex flex-wrap gap-2">
                    {partyMembers.map(t => (
                        <button
                            key={t.id}
                            onClick={() => togglePlayerTrainerSelection(t.id)}
                            className={`p-2 rounded-md text-sm ${
                                playerTrainerIds.includes(t.id) ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                        >
                            {t.name}
                        </button>
                    ))}
                </div>
            </div>

            {playerTrainerIds.length > 0 && (
                <div className="space-y-4">
                    <p className="mb-2 text-sm text-gray-400">2. Select up to {pokemonPerTrainer} Pokémon per trainer:</p>
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                        {selectedPlayerTrainers.map(trainer => (
                            <div key={trainer.id}>
                                <h4 className="font-bold text-indigo-300">{trainer.name}'s Roster</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-1">
                                    {trainer.roster.map(p => (
                                        <PokemonCard
                                            key={p.id}
                                            pokemon={{ ...p, originalTrainerId: trainer.id }}
                                            onSelect={() => togglePlayerPokemonSelection({ ...p, originalTrainerId: trainer.id, originalTrainer: trainer.name })}
                                            isSelected={playerTeam.some(sel => sel.id === p.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Step2_PlayerTeam;