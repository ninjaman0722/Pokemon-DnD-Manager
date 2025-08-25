// src/components/simulator/TurnResolutionModal.jsx
import React, { useState, useEffect } from 'react';
import { TYPE_COLORS } from '../../config/gameData';
import { calculateTurnPreview } from '../../hooks/battle-engine/turnPreviewCalculator';

const TurnResolutionModal = ({ isOpen, battleState, queuedActions, onConfirm, onCancel }) => {
    const [dmOverrides, setDmOverrides] = useState({});
    const [currentTurnData, setCurrentTurnData] = useState(null);

    // This effect recalculates the preview every time a choice is made
    useEffect(() => {
        if (isOpen && battleState) {
            const { previewActions, chanceEvents, turnOrder } = calculateTurnPreview(battleState, queuedActions, dmOverrides);
            setCurrentTurnData({ previewActions, chanceEvents, turnOrder });
        }
    }, [dmOverrides, isOpen, battleState, queuedActions]);

    // This effect initializes the default choices ONLY when the modal first opens
    useEffect(() => {
        if (isOpen) {
            const { chanceEvents } = calculateTurnPreview(battleState, queuedActions, {});
            const initialOverrides = {};
            chanceEvents?.forEach(event => {
                const key = event.key;
                if (key.startsWith('isFullyParalyzed_') || key.startsWith('isImmobilizedByLove_') || key.startsWith('willHurtSelfInConfusion_') || key.startsWith('willTriggerHarvest_')) {
                    initialOverrides[key] = true;
                } else if (key.startsWith('willWakeUp_') || key.startsWith('willThaw_') || key.startsWith('willApplyEffect_') || key.startsWith('willTrigger') || key.startsWith('willApplyStatChange_') || key.startsWith('healer_proc_') || key.startsWith('willActivateQuickClaw_')) {
                    initialOverrides[key] = false;
                }
            });
            setDmOverrides(initialOverrides);
        }
    }, [isOpen, battleState, queuedActions]);

    if (!isOpen || !currentTurnData) return null;

    // This function is now very simple
    const handleOverrideChange = (key, value) => {
        setDmOverrides(prev => ({ ...prev, [key]: value }));
    };

    const handleConfirm = () => onConfirm(dmOverrides);

    const groupedChances = currentTurnData.chanceEvents?.reduce((acc, event) => {
        const type = event.type || 'General';
        if (!acc[type]) { acc[type] = []; }
        acc[type].push(event);
        return acc;
    }, {});

    return (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[100] p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-4xl p-6 space-y-4 max-h-[90vh] flex flex-col">
                <h2 className="text-3xl font-bold text-indigo-400 text-center flex-shrink-0">Resolve Turn Actions</h2>
                <div className="flex-grow overflow-y-auto space-y-3 pr-2">
                    {currentTurnData.previewActions?.map((action) => {
                        // Since the action object itself has all the data, the structure simplifies
                        if (action.type !== 'FIGHT' || !action.move) {
                            return null;
                        }

                        return (
                            <div key={action.pokemon.id} className="bg-gray-900 p-4 rounded-lg space-y-3">
                                <h3 className="font-bold text-xl">
                                    <span className="text-yellow-300">{action.pokemon.name}</span> uses <span className={`capitalize px-1.5 py-0.5 rounded-md ${TYPE_COLORS[action.move.type] || 'bg-gray-500'}`}>{action.move.name}</span>
                                    {action.resolutionText && <span className="ml-2 text-red-400 italic">{action.resolutionText}</span>}
                                </h3>
                                {action.targetResolutions?.map(res => (
                                    <div key={res.target.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 p-2 bg-gray-800/50 rounded">
                                        <p><span className="font-bold">On {res.target.name}</span> (Dmg: <span className="text-orange-400">{res.expectedDamage}</span>)</p>
                                <div className="flex items-center gap-x-4">
                                    {res.chances.map(event => {
                                        // An event is visible if it has no dependency OR if its dependency is checked.
                                        const isVisible = !event.dependsOn || !!dmOverrides[event.dependsOn];
                                        if (!isVisible) return null; // Don't render it at all if not visible.

                                        return (
                                            <label key={event.key} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white">
                                                <input type="checkbox" checked={!!dmOverrides[event.key]} onChange={(e) => handleOverrideChange(event.key, e.target.checked)} className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded text-indigo-500 focus:ring-indigo-600" />
                                                {event.label}
                                            </label>
                                        )
                                    })}
                                </div>
                                    </div>
                                ))}
                            </div>
                        )
                    })}
                    {groupedChances && Object.entries(groupedChances).map(([type, events]) => (
                        <div key={type} className="bg-gray-900 p-4 rounded-lg space-y-2">
                            <h3 className="font-bold text-xl text-yellow-300">{type}</h3>
                            {events.map(event => {
                                // --- REPLACE THE EXISTING LOGIC WITH THIS BLOCK ---
                                const isVisible = !event.dependsOn || !!dmOverrides[event.dependsOn];
                                if (!isVisible) return null;

                                // Check if another option in the same exclusive group is already checked.
                                const anotherInGroupIsChecked = event.mutuallyExclusiveGroup &&
                                    Object.entries(dmOverrides).some(([key, value]) => {
                                        // Find the event corresponding to the key in dmOverrides
                                        const otherEvent = currentTurnData.chanceEvents.find(e => e.key === key);
                                        return value && // Is it checked?
                                               otherEvent?.mutuallyExclusiveGroup === event.mutuallyExclusiveGroup && // Is it in the same group?
                                               otherEvent.key !== event.key; // Is it a different event?
                                    });
                                
                                const isDisabled = anotherInGroupIsChecked;

                                return (
                                    <div key={event.key} className="p-2 bg-gray-800/50 rounded">
                                        <label className={`flex items-center gap-x-4 text-sm w-full ${isDisabled ? 'cursor-not-allowed text-gray-500' : 'cursor-pointer text-gray-300 hover:text-white'}`}>
                                            <input 
                                                type="checkbox" 
                                                checked={!!dmOverrides[event.key]} 
                                                onChange={(e) => handleOverrideChange(event.key, e.target.checked)} 
                                                disabled={isDisabled}
                                                className="form-checkbox h-4 w-4 bg-gray-700 border-gray-500 rounded text-indigo-500 focus:ring-indigo-600 disabled:opacity-50" 
                                            />
                                            <span>{event.label}</span>
                                        </label>
                                    </div>
                                )
                                // --- END REPLACEMENT ---
                            })}
                        </div>
                    ))}
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