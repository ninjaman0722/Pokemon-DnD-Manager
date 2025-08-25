// src/components/manager/setup/Step1_Settings.jsx
import React from 'react';
import { WEATHER_TYPES, TERRAIN_TYPES, ENTRY_HAZARDS } from '../../../config/gameData';

const Step1_Settings = ({
    // Core settings props (unchanged)
    battleType, setBattleType, numTrainers, setNumTrainers,
    pokemonPerTrainer, setPokemonPerTrainer, numOpponentTrainers, setNumOpponentTrainers,
    
    // New props for field settings
    fieldSettings,
    onFieldSettingChange,
    onHazardChange
}) => {
    console.log('[Step1_Settings] Received fieldSettings prop:', fieldSettings);
    return (
        <div>
            <h2 className="text-2xl font-semibold mb-6 text-indigo-300">Encounter Settings</h2>
            
            {/* --- Team Settings --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 border-b border-gray-700 pb-6">
                 <div>
                    <label className="block text-sm font-medium mb-1 text-gray-400">Battle Type</label>
                    <select value={battleType} onChange={e => setBattleType(e.target.value)} className="bg-gray-700 p-2 rounded-md w-full">
                        <option value="TRAINER">Party vs Trainer</option>
                        <option value="WILD">Party vs Wild</option>
                        <option value="BOSS">Party vs Boss</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 text-gray-400">Pokémon per Player Trainer</label>
                    <select value={pokemonPerTrainer} onChange={e => setPokemonPerTrainer(Number(e.target.value))} disabled={battleType === 'BOSS'} className="bg-gray-700 p-2 rounded-md w-full disabled:bg-gray-600">
                        {[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 text-gray-400">Active Player Trainers</label>
                    <select value={numTrainers} onChange={e => setNumTrainers(Number(e.target.value))} disabled={battleType === 'BOSS'} className="bg-gray-700 p-2 rounded-md w-full disabled:bg-gray-600">
                        {[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1 text-gray-400">Active Opponent Trainers</label>
                    <select value={numOpponentTrainers} onChange={e => setNumOpponentTrainers(Number(e.target.value))} disabled={battleType !== 'TRAINER'} className="bg-gray-700 p-2 rounded-md w-full disabled:bg-gray-600">
                        {[1, 2, 3, 4, 5, 6].map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                </div>
            </div>

            {/* --- NEW: Field & Environment Section --- */}
            <div className="mt-6">
                <h3 className="text-xl font-semibold mb-4 text-indigo-400">Field & Environment</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    {/* Weather & Terrain */}
                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-400">Weather</label>
                        <select name="weather" value={fieldSettings.weather} onChange={onFieldSettingChange} className="bg-gray-700 p-2 rounded-md w-full capitalize">
                            {WEATHER_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-400">Terrain</label>
                        <select name="terrain" value={fieldSettings.terrain} onChange={onFieldSettingChange} className="bg-gray-700 p-2 rounded-md w-full capitalize">
                            {TERRAIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    {/* Trick Room */}
                    <div className="md:col-span-2 flex items-center justify-center gap-3 bg-gray-900/50 p-3 rounded-md">
                        <label htmlFor="trickRoom" className="text-sm font-medium text-purple-400">Trick Room Active?</label>
                        <input
                            id="trickRoom"
                            name="trickRoom"
                            type="checkbox"
                            checked={fieldSettings.trickRoom}
                            onChange={onFieldSettingChange}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-indigo-600 focus:ring-indigo-500"
                        />
                    </div>

                    {/* Player Hazards */}
                    <div>
                        <p className="block text-sm font-medium mb-2 text-gray-400">Player Side Hazards</p>
                        <div className="space-y-2">
                            {ENTRY_HAZARDS.map(hazard => (
                                <div key={hazard} className="flex items-center gap-2">
                                    <input id={`player-${hazard}`} type="checkbox" checked={!!fieldSettings.playerHazards[hazard]} onChange={(e) => onHazardChange('player', hazard, e.target.checked)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-indigo-600" />
                                    <label htmlFor={`player-${hazard}`} className="text-sm">{hazard}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Opponent Hazards */}
                    <div>
                        <p className="block text-sm font-medium mb-2 text-gray-400">Opponent Side Hazards</p>
                        <div className="space-y-2">
                            {ENTRY_HAZARDS.map(hazard => (
                                <div key={hazard} className="flex items-center gap-2">
                                    <input id={`opponent-${hazard}`} type="checkbox" checked={!!fieldSettings.opponentHazards[hazard]} onChange={(e) => onHazardChange('opponent', hazard, e.target.checked)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-indigo-600" />
                                    <label htmlFor={`opponent-${hazard}`} className="text-sm">{hazard}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Step1_Settings;