import React, { useState } from 'react';
import { MOVE_CATEGORY_ICONS, TYPE_COLORS } from '../../config/gameData';

const BattleLog = ({ log, onClearLog }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [openDetails, setOpenDetails] = useState({});

    const filteredLog = log.filter(entry => {
        if (!searchTerm) return true;
        const lowerSearch = searchTerm.toLowerCase();
        const entryText = entry.text || `${entry.attackerName} used ${entry.moveName} on ${entry.defenderName}`;
        return entryText.toLowerCase().includes(lowerSearch) || `turn ${entry.turn}`.includes(lowerSearch);
    });

    const toggleDetails = (index) => {
        setOpenDetails(prev => ({ ...prev, [index]: !prev[index] }));
    }

    const renderLogEntry = (entry, index) => {
        const effectivenessColors = {
            "It's super effective!": "text-green-400",
            "It's not very effective...": "text-red-400",
            "It had no effect...": "text-gray-400"
        };

        if (entry.type === 'attack') {
            const typeColorClasses = TYPE_COLORS[entry.moveType] || 'bg-gray-500';
            return (
                <div key={index} className="p-3 rounded-lg bg-gray-800/50">
                    {/* The main attack message */}
                    <div className="flex items-center gap-2">
                        <p className="text-sm">
                            <span className="font-bold">{entry.attackerName}</span> used <span className={`font-bold capitalize px-2 py-0.5 rounded-md ${typeColorClasses}`}>{entry.moveName}</span> on <span className="font-bold">{entry.defenderName}</span>!
                        </p>
                        {/* The category icon remains for clarity */}
                        <div title={entry.moveCategory} className="h-5 w-5 bg-white/10 rounded-full p-0.5 text-white flex items-center justify-center">
                            {MOVE_CATEGORY_ICONS[entry.moveCategory]}
                        </div>
                    </div>

                    {/* The rest of the log details */}
                    {entry.isCritical && <p className="text-sm font-bold text-yellow-400">A critical hit!</p>}
                    {entry.effectivenessText && <p className={`text-sm italic ${effectivenessColors[entry.effectivenessText] || ''}`}>{entry.effectivenessText}</p>}
                    {entry.damage > 0 && <p className="text-sm">Dealt <span className="font-bold text-orange-400">{entry.damage}</span> damage.</p>}
                    {entry.statChanges?.map((msg, i) => <p key={i} className="text-sm italic text-blue-300">{msg}</p>)}
                    {entry.fainted && <p className="text-sm font-bold text-red-500">{entry.defenderName} fainted!</p>}
                    {entry.recoilMessage && <p className="text-sm italic text-orange-500">{entry.recoilMessage}</p>}
                    {entry.drainMessage && <p className="text-sm italic text-lime-400">{entry.drainMessage}</p>}

                    <button onClick={() => toggleDetails(index)} className="text-xs text-gray-400 hover:text-white mt-2">
                        {openDetails[index] ? 'Hide Details' : 'Show Details'}
                    </button>
                    {openDetails[index] && (
                        <ul className="text-xs text-gray-300 mt-1 pl-2 border-l-2 border-gray-700 space-y-1">
                            {Object.entries(entry.breakdown).map(([key, value]) => (
                                <li key={key}><strong>{key}:</strong> {value}</li>
                            ))}
                        </ul>
                    )}
                </div>
            );
        }

        // For simple text entries
        return (
            <div key={index} className="p-3">
                <p className="text-sm italic text-gray-400">{entry.text}</p>
            </div>
        );
    };

    return (
        <div className="bg-gray-900 rounded-lg p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-2 flex-shrink-0">
                <h3 className="text-lg font-bold text-indigo-300">Battle Log</h3>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="Search Log..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm w-32"
                    />
                    <button onClick={onClearLog} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-md text-sm">Clear</button>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                {filteredLog.length > 0 ? [...filteredLog].reverse().map(renderLogEntry) : <p className="text-gray-500 italic text-center mt-4">Log is empty.</p>}
            </div>
        </div>
    );
};
export default BattleLog;