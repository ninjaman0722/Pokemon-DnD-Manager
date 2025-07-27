// src/components/manager/InventoryView.jsx
import React, { useState } from 'react';
import { fetchItemData } from '../../utils/api';
import AutocompleteInput from '../common/AutocompleteInput';
import { POCKETS, CATEGORY_TO_POCKET_MAPPING } from '../../config/gameData'; // <-- Import new constants

const InventoryView = ({ trainer, itemList, onBagUpdate, dispatch }) => {
    // Default to the first pocket instead of 'all'
    const [activePocket, setActivePocket] = useState(POCKETS[0]);
    const [itemSearch, setItemSearch] = useState('');
    const [quantityToAdd, setQuantityToAdd] = useState(1);

    const bag = trainer.bag || {};

    const handleAddItem = async (name, quantity = 1) => {
        if (!name) return;
        const itemKey = name.replace(/\s/g, '-').toLowerCase();
        const itemData = await fetchItemData(itemKey);
        console.log('DEBUGGING ITEM DATA:', itemData);
        if (!itemData) {
            dispatch({ type: 'SET_ERROR', payload: `Could not find item: ${name}` });
            return;
        }
        const newBag = { ...bag, [itemKey]: { ...itemData, name: itemData.name, quantity: (bag[itemKey]?.quantity || 0) + quantity } };
        onBagUpdate(newBag);
        setItemSearch('');
        setQuantityToAdd(1);
    };

    const handleQuantityChange = (itemKey, newQuantity) => {
        const qty = Math.max(0, Math.min(999, newQuantity));
        if (qty === 0) {
            const { [itemKey]: _, ...rest } = bag;
            onBagUpdate(rest);
        } else {
            onBagUpdate({ ...bag, [itemKey]: { ...bag[itemKey], quantity: qty } });
        }
    };

    // Updated filtering logic to use the POCKET mapping
    const filteredItems = Object.values(bag)
        .filter(item => {
            const itemPocket = CATEGORY_TO_POCKET_MAPPING[item.category] || 'Other';
            return itemPocket === activePocket;
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div>
            {/* Updated tabs to use the static POCKETS array */}
            <div className="flex space-x-1 rounded-lg bg-gray-900 p-1 mb-4">
                {POCKETS.map(pocket => (
                    <button
                        key={pocket}
                        onClick={() => setActivePocket(pocket)}
                        className={`w-full rounded-lg py-2 text-sm font-medium leading-5 transition-all duration-200 ease-in-out capitalize ${activePocket === pocket ? 'bg-indigo-600 text-white shadow' : 'text-gray-300 hover:bg-gray-700/50'}`}
                    >
                        {pocket.replace(/-/g, ' ')}
                    </button>
                ))}
            </div>

            {/* The rest of the component remains largely the same */}
            <ul className="space-y-1 max-h-72 overflow-y-auto pr-2">
                {filteredItems.length === 0 ? (
                    <p className="text-gray-400 italic text-center py-4">This pocket is empty.</p>
                ) : filteredItems.map(item => (
                    <li key={item.name} className="p-2 rounded-md flex items-center justify-between hover:bg-gray-700/50">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <img src={item.sprite || 'https://placehold.co/32x32/4a5568/e2e8f0?text=?'} alt={item.name} className="w-8 h-8" />
                            <span className="capitalize truncate font-medium" title={item.name}>{item.name.replace(/-/g, ' ')}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <input type="number" value={item.quantity} onChange={e => handleQuantityChange(item.id, parseInt(e.target.value, 10) || 0)} className="w-16 bg-gray-900 p-1 rounded-md border border-gray-600 text-center" />
                            <button onClick={() => handleQuantityChange(item.id, 0)} className="bg-red-600 w-6 h-6 rounded font-bold text-xs flex items-center justify-center">✕</button>
                        </div>
                    </li>
                ))}
            </ul>

            <div className="mt-4 pt-4 border-t border-gray-600">
                <form onSubmit={e => { e.preventDefault(); handleAddItem(itemSearch, quantityToAdd); }} className="space-y-2">
                    <AutocompleteInput value={itemSearch} onChange={setItemSearch} onSelect={(name) => handleAddItem(name, 1)} placeholder="Search to add item..." sourceList={itemList} />
                    <div className="flex gap-2">
                        <input type="number" value={quantityToAdd} onChange={e => setQuantityToAdd(Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)))} className="w-20 bg-gray-900 p-2 rounded-md border border-gray-600" />
                        <button type="submit" className="flex-grow bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md font-semibold disabled:bg-gray-500" disabled={!itemSearch}>Add to Bag</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default InventoryView;