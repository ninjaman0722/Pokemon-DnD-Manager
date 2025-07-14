import React, { useState, useEffect, useRef } from 'react';

const AutocompleteInput = ({ value, onChange, onSelect, placeholder, sourceList }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        if (value.length > 0 && sourceList.length > 0) {
            const filtered = sourceList.filter(p => p.toLowerCase().replace(/-/g, ' ').startsWith(value.toLowerCase())).slice(0, 10);
            setSuggestions(filtered);
            setShowSuggestions(true);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, [value, sourceList]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (itemName) => {
        // UPDATED: We now call onSelect with the original, unmodified itemName.
        onSelect(itemName);
        setShowSuggestions(false);
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-20 w-full bg-gray-700 border border-gray-600 rounded-md mt-1 max-h-48 overflow-y-auto">
                    {suggestions.map(itemName => (
                        <li key={itemName} onClick={() => handleSelect(itemName)} className="px-3 py-2 cursor-pointer hover:bg-indigo-600 capitalize">
                            {itemName.replace(/-/g, ' ')}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default AutocompleteInput;