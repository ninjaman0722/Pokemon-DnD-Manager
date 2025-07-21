// src/components/simulator/TargetingBanner.jsx

import React from 'react';

const TargetingBanner = ({ targetingInfo, onConfirm, onCancel }) => {
    // If targeting isn't active, don't render anything
    if (!targetingInfo.isActive) {
        return null;
    }

    return (
        <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-black p-4 text-center z-30 shadow-lg">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-center items-center gap-4">
                <h2 className="text-xl font-bold">
                    Select Target(s) for {targetingInfo.baseAction.move.name}
                </h2>
                <div className="flex gap-2">
                    <button 
                        onClick={onConfirm} 
                        disabled={targetingInfo.selected.length === 0} 
                        className="bg-green-700 hover:bg-green-800 text-white font-bold py-2 px-6 rounded-lg text-lg disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        Confirm
                    </button>
                    <button 
                        onClick={onCancel} 
                        className="bg-red-700 hover:bg-red-800 text-white font-bold py-2 px-6 rounded-lg text-lg"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TargetingBanner;