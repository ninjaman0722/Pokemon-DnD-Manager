// src/components/manager/SaveScenarioModal.jsx
import React, { useState } from 'react';

const SaveScenarioModal = ({ onSave, onClose }) => {
    const [scenarioName, setScenarioName] = useState('');

    const handleSaveClick = () => {
        if (scenarioName.trim()) {
            onSave(scenarioName.trim());
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
                <h2 className="text-2xl font-bold text-indigo-400">Save Battle Scenario</h2>
                <div>
                    <label htmlFor="scenario-name" className="block text-sm font-medium text-gray-400 mb-1">
                        Scenario Name
                    </label>
                    <input
                        type="text"
                        id="scenario-name"
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        placeholder="e.g., Rival Battle 3"
                        className="w-full bg-gray-900 p-2 rounded-md border border-gray-600"
                    />
                </div>
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveClick}
                        disabled={!scenarioName.trim()}
                        className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md font-semibold disabled:bg-gray-500"
                    >
                        Save Scenario
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SaveScenarioModal;