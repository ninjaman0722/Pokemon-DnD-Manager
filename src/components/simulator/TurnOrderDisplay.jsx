import React from 'react';

const TurnOrderDisplay = ({ turnOrder, turn }) => (
    <div className="h-12 bg-gray-800 rounded-lg mb-2 p-2 flex items-center justify-center gap-2 text-sm flex-shrink-0">
        <span className="font-bold mr-2">Turn {turn}:</span>
        {turnOrder.length === 0 ? <span className="text-gray-400">Waiting for actions...</span> : turnOrder.map((action, i) => (
            <img key={i} src={action.pokemon.sprite} alt={action.pokemon.name} className="h-8 w-8 bg-gray-700/50 rounded-full" title={`${action.pokemon.name} - ${action.type}`} />
        ))}
    </div>
);

export default TurnOrderDisplay;