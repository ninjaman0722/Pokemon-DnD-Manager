import React, { useState } from 'react';
import CustomPokemonCreator from './CustomPokemonCreator';
import CustomMoveCreator from './CustomMoveCreator';
import CustomAbilityCreator from './CustomAbilityCreator';

const CustomContentManager = () => {
    const [view, setView] = useState('POKEMON'); // POKEMON, MOVES, ABILITIES

    const renderView = () => {
        switch (view) {
            case 'POKEMON':
                return <CustomPokemonCreator />;
            case 'MOVES':
                return <CustomMoveCreator />;
            case 'ABILITIES':
                return <CustomAbilityCreator />;
            default:
                return <CustomPokemonCreator />;
        }
    };

    return (
        <div className="p-4 md:p-8">
            <h1 className="text-4xl font-bold text-indigo-400 mb-2">Custom Content Creator</h1>
            <p className="text-gray-400 mb-6">Create and manage custom Pokémon, moves, and abilities for your campaign.</p>
            
            <div className="flex space-x-1 rounded-lg bg-gray-900 p-1 mb-6 max-w-md">
                {['POKEMON', 'MOVES', 'ABILITIES'].map(viewName => (
                    <button
                        key={viewName}
                        onClick={() => setView(viewName)}
                        className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all duration-200 ease-in-out capitalize
                            ${view === viewName ? 'bg-indigo-600 text-white shadow' : 'text-gray-300 hover:bg-gray-700/50'}`}
                    >
                        {viewName}
                    </button>
                ))}
            </div>

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                {renderView()}
            </div>
        </div>
    );
};

export default CustomContentManager;