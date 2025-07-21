import React, { useState, useEffect, useRef } from 'react';

const AutocompleteInput = ({ value, onChange, onSelect, placeholder, sourceList }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    // NEW: State to track the highlighted suggestion for keyboard navigation
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
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

    // NEW: Reset highlight index when suggestions change
    useEffect(() => {
        setActiveSuggestionIndex(0);
    }, [suggestions]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // NEW: Function to handle key presses for accessibility
    const handleKeyDown = (e) => {
        // User pressed the down arrow
        if (e.key === 'ArrowDown') {
            e.preventDefault(); // Prevent cursor from moving in the input
            setActiveSuggestionIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        }
        // User pressed the up arrow
        else if (e.key === 'ArrowUp') {
            e.preventDefault(); // Prevent cursor from moving in the input
            setActiveSuggestionIndex(prev => Math.max(prev - 1, 0));
        }
        // User pressed Enter
        else if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission
            if (suggestions.length > 0) {
                onSelect(suggestions[activeSuggestionIndex]);
                setShowSuggestions(false);
            }
        }
        // User pressed Escape
        else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const handleSelect = (itemName) => {
        onSelect(itemName);
        setShowSuggestions(false);
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            {/* THIS IS THE CHANGE: The onKeyDown prop is added to the input element */}
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-gray-900 p-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                onKeyDown={handleKeyDown} // NEW
            />
            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-20 w-full bg-gray-700 border border-gray-600 rounded-md mt-1 max-h-48 overflow-y-auto">
                    {suggestions.map((itemName, index) => ( // NEW: Added index to the map function
                        <li
                            key={itemName}
                            onClick={() => handleSelect(itemName)}
                            // NEW: Conditionally apply a highlight class
                            className={`px-3 py-2 cursor-pointer capitalize ${index === activeSuggestionIndex ? 'bg-indigo-600' : 'hover:bg-indigo-500'}`}
                        >
                            {itemName.replace(/-/g, ' ')}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default AutocompleteInput;