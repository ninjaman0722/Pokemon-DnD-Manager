// src/components/battle/MasterControlPanel.jsx
import React from 'react';
import { WEATHER_TYPES, TERRAIN_TYPES, ENTRY_HAZARDS } from '../../config/gameData';

const MasterControlPanel = ({
    allActivePokemon,
    activePanelPokemonId,
    queuedActions, 
    isCompactView,
    allActionsQueued,
    phase,
    turn,
    field,
    isProcessingTurn,
    onToggleCompactView,
    onPokemonSelect,
    onExecuteTurn,
    onTurnChange,
    onFieldChange,
    onHazardChange,
    playerTeamId,   // <-- New Prop
    opponentTeamId,  // <-- New Prop
    targetingInfo
}) => {
    const handleFieldUpdate = (key, value) => {
        const newField = { ...field, [key]: value };
        if (key === 'weather') {
            newField.weatherTurns = value === 'none' ? 0 : 5;
        }
        if (key === 'terrain') {
            newField.terrainTurns = value === 'none' ? 0 : 5;
        }
        onFieldChange(newField);
    };

    const hazardButton = (side, hazard, change) => {
        const key = hazard.toLowerCase().replace(' ', '-');
        const currentLayers = field.hazards?.[side]?.[key] || 0;
        let newLayers = Math.max(0, currentLayers + change);
        if (key === 'stealth-rock' || key === 'sticky-web') {
            newLayers = Math.min(1, newLayers);
        }
        if (key === 'spikes' || key === 'toxic-spikes') {
            newLayers = Math.min(3, newLayers);
        }
        onHazardChange(side, key, newLayers);
    };

    const sides = [
        { id: playerTeamId, name: 'Player' },
        { id: opponentTeamId, name: 'Opponent' }
    ].filter(side => side.id);

    return (
        <div className="bg-gray-900 rounded-lg p-4 flex flex-col gap-2 h-full">
            <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-2 flex-shrink-0">
                <h3 className="text-lg font-bold text-indigo-300">Controls</h3>
                <button onClick={onToggleCompactView} className="text-sm bg-gray-700 hover:bg-gray-800 px-2 py-1 rounded">
                    {isCompactView ? 'Detailed View' : 'Compact View'}
                </button>
            </div>

            <div className="flex-grow overflow-y-auto space-y-2 pr-1">
                {allActivePokemon.map(p => (
                    <button key={p.id} onClick={() => onPokemonSelect(p.id)} disabled={targetingInfo.isActive} className={`w-full text-left px-3 py-2 font-semibold rounded transition-colors ${activePanelPokemonId === p.id ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'} disabled:cursor-not-allowed`}>
                        {p.name} {queuedActions[p.id] || p.chargingMove || p.rampageMove || p.lockedMove ? '✓' : ''}
                    </button>
                ))}
            </div>

            <div className="flex-shrink-0 space-y-2 text-sm">
                <div className="p-2 border border-gray-700 rounded-lg space-y-2">
                    <h4 className="text-xs font-bold text-center text-gray-400">ENTRY HAZARDS</h4>
                    {sides.map(sideInfo => (
                        <div key={sideInfo.id} className="grid grid-cols-2 gap-x-2">
                            <span className="font-semibold capitalize text-indigo-300">{sideInfo.name}'s Side:</span>
                            <div className="grid grid-cols-4 gap-1">
                                {ENTRY_HAZARDS.map(hazard => {
                                    const hazardKey = hazard.toLowerCase().replace(' ', '-');
                                    return (
                                        <div key={hazardKey} className="flex flex-col items-center">
                                            {/* Use sideInfo.id to get the correct count */}
                                            <span className="text-xs">{field.hazards?.[sideInfo.id]?.[hazardKey] || 0}</span>
                                            <div className="flex">
                                                {/* Use sideInfo.id to call the handler with the correct ID */}
                                                <button onClick={() => hazardButton(sideInfo.id, hazard, -1)} className="bg-red-800 h-4 w-4 text-xs flex items-center justify-center rounded-l">-</button>
                                                <button onClick={() => hazardButton(sideInfo.id, hazard, 1)} className="bg-green-800 h-4 w-4 text-xs flex items-center justify-center rounded-r">+</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-2 border border-gray-700 rounded-lg">
                    <div>
                        <label className="block text-xs font-medium text-gray-400">Weather</label>
                        <select value={field.weather} onChange={(e) => handleFieldUpdate('weather', e.target.value)} className="w-full bg-gray-700 p-1 rounded-md capitalize">
                            {WEATHER_TYPES.map(w => <option key={w} value={w}>{w.replace(/-/g, ' ')}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-400">Turns Left</label>
                        <input type="number" value={field.weatherTurns} onChange={(e) => handleFieldUpdate('weatherTurns', Number(e.target.value))} className="w-full bg-gray-700 p-1 rounded-md text-center" min="0" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-400">Terrain</label>
                        <select value={field.terrain} onChange={(e) => handleFieldUpdate('terrain', e.target.value)} className="w-full bg-gray-700 p-1 rounded-md capitalize">
                            {TERRAIN_TYPES.map(t => <option key={t} value={t}>{t.replace(/-/g, ' ')}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-400">Turns Left</label>
                        <input type="number" value={field.terrainTurns} onChange={(e) => handleFieldUpdate('terrainTurns', Number(e.target.value))} className="w-full bg-gray-700 p-1 rounded-md text-center" min="0" />
                    </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                    <label htmlFor="turn-input" className="font-semibold">Current Turn:</label>
                    <input id="turn-input" type="number" value={turn} onChange={(e) => onTurnChange(Number(e.target.value))} className="w-20 bg-gray-700 p-1 rounded-md text-center border border-gray-600" min="1"/>
                </div>
                <button
                    onClick={onExecuteTurn}
                    disabled={!allActionsQueued || phase !== 'ACTION_SELECTION' || isProcessingTurn}
                    className="w-full bg-green-600 hover:bg-green-700 font-bold py-2 px-6 rounded-lg text-lg disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                    {isProcessingTurn ? 'Processing...' : 'Execute Turn'}
                </button>
            </div>
        </div>
    );
};

export default MasterControlPanel;