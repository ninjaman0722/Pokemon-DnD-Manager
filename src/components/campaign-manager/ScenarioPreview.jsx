// src/components/manager/ScenarioPreview.jsx
import React from 'react';
import { getSprite } from '../../utils/api';

const ScenarioPreview = ({ scenario }) => {
    // The scenario object contains a 'teams' object with 'player' and 'opponent' keys.
    const playerTeam = scenario.teams.player;
    const opponentTeam = scenario.teams.opponent;

    const PokemonPill = ({ pokemon }) => (
        <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-full">
            <img src={getSprite(pokemon)} alt={pokemon.name} className="h-8 w-8" />
            <span className="text-sm font-medium pr-2">{pokemon.name} (Lvl {pokemon.level})</span>
        </div>
    );

    return (
        <div className="space-y-4">
            <div>
                <h4 className="font-bold text-lg text-green-400">Player Team</h4>
                <div className="flex flex-wrap gap-2 mt-2">
                    {playerTeam.pokemon.map(p => <PokemonPill key={p.id} pokemon={p} />)}
                </div>
            </div>
            <div>
                <h4 className="font-bold text-lg text-red-400">Opponent Team</h4>
                <div className="flex flex-wrap gap-2 mt-2">
                    {opponentTeam.pokemon.map(p => <PokemonPill key={p.id} pokemon={p} />)}
                </div>
            </div>
        </div>
    );
};

export default ScenarioPreview;