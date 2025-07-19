// src/components/trainer/ItemDetailModal.jsx
import React from 'react';

const ItemDetailModal = ({ item, onClose }) => {
    if (!item) return null;

    // Helper to find the English description
    const getDescription = () => {
        const entry = item.effect_entries?.find(e => e.language.name === 'en');
        return entry ? entry.effect : "No description available.";
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 text-white rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-indigo-400 capitalize">{item.name.replace(/-/g, ' ')}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white font-bold text-2xl">×</button>
                </div>
                <div className="text-center bg-gray-900/50 p-4 rounded-md">
                    <img src={item.sprite} alt={item.name} className="mx-auto w-16 h-16" />
                </div>
                <p className="text-gray-300 text-sm">{getDescription()}</p>
            </div>
        </div>
    );
};

export default ItemDetailModal;