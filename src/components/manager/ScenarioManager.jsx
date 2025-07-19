// src/components/manager/ScenarioManager.jsx
import React, { useState, useEffect } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
import { db } from '../../config/firebase';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import ScenarioPreview from './ScenarioPreview';

const ScenarioManager = ({ onEditScenario }) => {
    const { state } = useManagerContext();
    const { selectedCampaignId } = state;
    const [scenarios, setScenarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedScenarioId, setExpandedScenarioId] = useState(null);

    useEffect(() => {
        if (!selectedCampaignId) return;

        setLoading(true);
        const scenariosRef = collection(db, 'campaigns', selectedCampaignId, 'scenarios');
        const q = query(scenariosRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const scenariosData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setScenarios(scenariosData);
            setLoading(false);
        });

        return () => unsubscribe(); // Cleanup listener on unmount
    }, [selectedCampaignId]);

    const handleDeleteScenario = async (scenarioId) => {
        if (window.confirm("Are you sure you want to delete this scenario? This cannot be undone.")) {
            const scenarioDocRef = doc(db, 'campaigns', selectedCampaignId, 'scenarios', scenarioId);
            try {
                await deleteDoc(scenarioDocRef);
            } catch (error) {
                console.error("Failed to delete scenario:", error);
            }
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        // Add a visual confirmation if you like
    };
    const handleToggleDetails = (scenarioId) => {
        // If the clicked scenario is already expanded, collapse it. Otherwise, expand it.
        setExpandedScenarioId(currentId => currentId === scenarioId ? null : scenarioId);
    };
    if (loading) {
        return <p>Loading scenarios...</p>;
    }

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold mb-4 text-indigo-300 border-b border-gray-700 pb-2">Saved Scenarios</h2>
            {scenarios.length === 0 ? (
                <p className="text-gray-400 italic">You haven't saved any scenarios for this campaign yet.</p>
            ) : (
                <ul className="space-y-3">
                    {/* REPLACE the scenarios.map(...) with this new version */}
                    {scenarios.map(scenario => (
                        <React.Fragment key={scenario.id}>
                            <li key={scenario.id} className="bg-gray-700/50 p-3 rounded-md flex justify-between items-center">
                                <div>
                                    <p className="font-bold">{scenario.name}</p>
                                    <p className="text-xs text-gray-400">
                                        Created: {scenario.createdAt?.toDate().toLocaleDateString() || 'N/A'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => onEditScenario(scenario)}
                                        className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-1 px-3 rounded-md text-sm"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleToggleDetails(scenario.id)}
                                        className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-1 px-3 rounded-md text-sm"
                                    >
                                        {expandedScenarioId === scenario.id ? 'Hide' : 'Details'}
                                    </button>
                                    <button
                                        onClick={() => copyToClipboard(scenario.id)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded-md text-sm"
                                        title="Copy Scenario ID for Simulator"
                                    >
                                        Copy ID
                                    </button>
                                    <button
                                        onClick={() => handleDeleteScenario(scenario.id)}
                                        className="bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-3 rounded-md text-sm"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </li>
                            {/* This block conditionally renders the preview */}
                            {expandedScenarioId === scenario.id && (
                                <li className="bg-gray-800 p-4 rounded-md -mt-2">
                                    <ScenarioPreview scenario={scenario} />
                                </li>
                            )}
                        </React.Fragment>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ScenarioManager;

