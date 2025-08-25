// src/components/manager/setup/Step4_Review.jsx
import React from 'react';
import TeamPreviewCard from '../TeamPreviewCard'; // Adjust path as needed

const Step4_Review = ({
    playerTeam,
    selectedPlayerTrainers,
    opponentTeam,
    battleType,
    setEditingPokemon,
    numOpponentTrainers,
    opponentTrainer,
    selectedOpponentTrainers
}) => {
    return (
        <div>
            <h2 className="text-2xl font-semibold text-indigo-300 mb-4">Review & Launch</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Player Team Review (Correct) */}
                <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        Player Team <span className="text-gray-400">({playerTeam.length})</span>
                        {playerTeam.length > 0 ? <span className="text-green-400 text-sm font-bold">✓ READY</span> : <span className="text-red-400 text-sm font-bold">✗ INCOMPLETE</span>}
                    </h3>
                    <div className="space-y-3 p-2 bg-gray-900/50 rounded-lg max-h-96 overflow-y-auto">
                        {selectedPlayerTrainers.map(trainer => {
                            const teamForTrainer = playerTeam.filter(p => p.originalTrainerId === trainer.id);
                            if (teamForTrainer.length === 0) return null;
                            return (
                                <div key={trainer.id}>
                                    <h4 className="font-bold text-indigo-300">{trainer.name}</h4>
                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        {teamForTrainer.map((p, i) => (
                                            <TeamPreviewCard key={p.id} pokemon={p} onSelect={() => {}} isActive={i === 0} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Opponent Team Review (Updated) */}
                <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        Opponent Team <span className="text-gray-400">({opponentTeam.length})</span>
                        {opponentTeam.length > 0 ? <span className="text-green-400 text-sm font-bold">✓ READY</span> : <span className="text-red-400 text-sm font-bold">✗ INCOMPLETE</span>}
                    </h3>
                    <div className="space-y-3 p-2 bg-gray-900/50 rounded-lg max-h-96 overflow-y-auto">
                        {battleType === 'WILD' ? (
                            <div className="grid grid-cols-2 gap-2">
                                {opponentTeam.map((p, i) => (
                                    <TeamPreviewCard key={p.id} pokemon={p} onSelect={() => setEditingPokemon(p)} isActive={true} />
                                ))}
                            </div>
                        ) : (
                            selectedOpponentTrainers.map(trainer => {
                                const teamForTrainer = opponentTeam.filter(p => p.originalTrainerId === trainer.id);
                                if (teamForTrainer.length === 0) return null;

                                return (
                                    <div key={trainer.id}>
                                        <h4 className="font-bold text-red-300">{trainer.name}</h4>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                            {/* THIS IS THE FIX: The logic now mirrors the player's side, using the index 'i' within the trainer's sub-team. */}
                                            {teamForTrainer.map((p, i) => (
                                                <TeamPreviewCard key={p.id} pokemon={p} onSelect={() => {}} isActive={i === 0} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        
                        {battleType === 'BOSS' && opponentTrainer?.finalPokemon && (
                            <div className="mt-2 pt-2 border-t border-gray-700">
                                <h4 className="text-lg font-semibold text-red-400">Final Pokémon:</h4>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <TeamPreviewCard pokemon={opponentTrainer.finalPokemon} onSelect={() => {}} isActive={false} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Step4_Review;