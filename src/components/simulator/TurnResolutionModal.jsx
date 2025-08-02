// src/components/simulator/TurnResolutionModal.jsx
import React, { useState, useEffect } from 'react';
import { TYPE_COLORS } from '../../config/gameData';

const TurnResolutionModal = ({ isOpen, turnData, onConfirm, onCancel }) => {
    // This state still accumulates all decisions for the entire turn.
    const [dmOverrides, setDmOverrides] = useState({});

    // --- NEW: State to track which action we are currently resolving ---
    const [currentIndex, setCurrentIndex] = useState(0);
    const handleConfirm = () => {
        onConfirm(dmOverrides);
    };
    // Reset the index if the modal is reopened with new data
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(0);
            setDmOverrides({});
        }
    }, [isOpen]);

    if (!isOpen || turnData.length === 0) return null;

    const handleOverrideChange = (key, value) => {
        setDmOverrides(prev => ({ ...prev, [key]: value }));
    };

    // --- NEW: Get only the current action to display ---
    const currentAction = turnData[currentIndex];
    const isLastAction = currentIndex >= turnData.length - 1;

    // A safety check in case there's no action to display
    if (!currentAction) {
        return null;
    }

return (
    <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[100] p-4">
        <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-4xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <h2 className="text-3xl font-bold text-indigo-400 text-center flex-shrink-0">Resolve Turn Actions</h2>
            <div className="flex-grow overflow-y-auto space-y-3 pr-2">
                {turnData.map((action) => {
                    const headerColor = TYPE_COLORS[action.move.type] || 'bg-gray-500';

                    return (
                        <div key={action.id} className="bg-gray-900 p-4 rounded-lg space-y-3">
                            <h3 className="font-bold text-xl">
                                <span className="text-yellow-300">{action.attacker.name}</span> uses <span className={`capitalize px-1.5 py-0.5 rounded-md ${headerColor}`}>{action.move.name}</span>
                                {action.resolutionType === 'MULTI_HIT' && ` (${action.hitResolutions.length} Hits)`}
                            </h3>

                            {/* --- RENDERER FOR MULTI-HIT MOVES --- */}
                            {action.resolutionType === 'MULTI_HIT' && action.hitResolutions.map(res => (
                                <div key={`${res.hitNumber}-${res.target.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 p-2 bg-gray-800/50 rounded">
                                    <p><span className="font-bold">Hit {res.hitNumber} on {res.target.name}</span> (Dmg: <span className="text-orange-400">{res.expectedDamage}</span>)</p>
                                    <div className="flex items-center gap-x-4">
                                        {/* --- CHANGED: Replaced Yes/No buttons with a checkbox --- */}
                                        {res.chances.map(({ key, label }) => (
                                            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white">
                                                <input
                                                    type="checkbox"
                                                    checked={!!dmOverrides[key]}
                                                    onChange={(e) => handleOverrideChange(key, e.target.checked)}
                                                    className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded text-indigo-500 focus:ring-indigo-600"
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {/* --- RENDERER FOR AOE AND SINGLE-TARGET MOVES --- */}
                            {(action.resolutionType === 'AOE' || action.resolutionType === 'SINGLE') && action.targetResolutions.map(res => (
                                <div key={res.target.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 p-2 bg-gray-800/50 rounded">
                                    <p><span className="font-bold">On {res.target.name}</span> (Dmg: <span className="text-orange-400">{res.expectedDamage}</span>)</p>
                                    <div className="flex items-center gap-x-4">
                                        {/* --- CHANGED: Replaced Yes/No buttons with a checkbox --- */}
                                        {res.chances.map(({ key, label }) => (
                                             <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white">
                                                <input
                                                    type="checkbox"
                                                    checked={!!dmOverrides[key]}
                                                    onChange={(e) => handleOverrideChange(key, e.target.checked)}
                                                    className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded text-indigo-500 focus:ring-indigo-600"
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-end gap-4 pt-4 border-t border-gray-700 flex-shrink-0">
                <button onClick={onCancel} className="bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md font-semibold text-lg">Cancel</button>
                <button onClick={handleConfirm} className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-md font-semibold text-lg">Execute Turn</button>
            </div>
        </div>
    </div>
);
};

export default TurnResolutionModal;