import React, { useState } from 'react';
import AutocompleteInput from '../common/AutocompleteInput';

const OfficialSearchModal = ({ title, sourceList, onSelect, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const handleSelect = () => {
        if (searchTerm) {
            onSelect(searchTerm);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-lg p-6 space-y-4">
                <h2 className="text-2xl font-bold text-indigo-400">{title}</h2>
                <form onSubmit={(e) => { e.preventDefault(); handleSelect(); }}>
                    <AutocompleteInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        onSelect={setSearchTerm}
                        placeholder="Search for an official Pokémon..."
                        sourceList={sourceList}
                    />
                </form>
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md font-semibold">Cancel</button>
                    <button onClick={handleSelect} disabled={!searchTerm} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md font-semibold disabled:bg-gray-500">Edit Selected</button>
                </div>
            </div>
        </div>
    );
};

export default OfficialSearchModal;