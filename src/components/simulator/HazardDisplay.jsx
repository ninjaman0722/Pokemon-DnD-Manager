// src/components/simulator/HazardDisplay.jsx

import React from 'react';

// You can find these icons online (e.g., from Bulbapedia) and place them in your public/assets folder
const HAZARD_ICONS = {
    'stealth-rock': '/assets/stealth-rock.png',
    'spikes': '/assets/spikes.png',
    'toxic-spikes': '/assets/toxic-spikes.png',
    'sticky-web': '/assets/sticky-web.png',
};

const HazardDisplay = ({ side, hazards }) => {
    // If there are no hazards for this side, don't render anything
    if (!hazards || Object.keys(hazards).length === 0) {
        return null;
    }

    const positionClass = side === 'player' ? 'left-4' : 'right-4';

    return (
        <div className={`absolute bottom-4 ${positionClass} flex items-center gap-2 bg-gray-900/50 p-2 rounded-lg`}>
            {Object.entries(hazards).map(([hazardKey, layers]) => {
                if (layers === 0) return null; // Don't show hazards with 0 layers

                return (
                    <div key={hazardKey} className="relative" title={`${hazardKey.replace('-', ' ')} (x${layers})`}>
                        <img 
                            src={HAZARD_ICONS[hazardKey]} 
                            alt={hazardKey} 
                            className="w-8 h-8" 
                        />
                        {layers > 1 && (
                            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                                {layers}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default HazardDisplay;