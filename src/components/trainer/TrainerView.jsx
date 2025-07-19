import React, { useState, useEffect, useMemo } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getSprite } from '../../utils/api';
import { TYPE_COLORS, MOVE_CATEGORY_ICONS, POCKETS, CATEGORY_TO_POCKET_MAPPING, MAX_PARTY_SIZE } from '../../config/gameData';
import ViewPokemonModal from './ViewPokemonModal';
import TrainerPokemonCard from './TrainerPokemonCard';
import ItemDetailModal from './ItemDetailModal';

const TrainerView = () => {
    const { state, selectedCampaign } = useManagerContext();
    const { user } = state;
    const [myTrainer, setMyTrainer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('ROSTER');
    const [currentBoxIndex, setCurrentBoxIndex] = useState(0);
    const [viewingPokemon, setViewingPokemon] = useState(null);
    const [selectedPokemon, setSelectedPokemon] = useState(null);
    const [activePocket, setActivePocket] = useState(POCKETS[0]);
    const [heldPokemon, setHeldPokemon] = useState(null);
    const [isOrganizeMode, setIsOrganizeMode] = useState(false);
    const [viewingItem, setViewingItem] = useState(null);

    const finalPermissions = useMemo(() => {
        const defaults = { canViewRoster: true, canViewBox: false, canViewBag: false, canEditNicknames: false, canUseItems: false, canOrganizeBox: false };
        const campaignDefaults = selectedCampaign?.defaultPermissions || {};
        const trainerOverrides = myTrainer?.overridePermissions || {};
        return { ...defaults, ...campaignDefaults, ...trainerOverrides };
    }, [selectedCampaign, myTrainer]);

    useEffect(() => {
        if (!user?.uid || !selectedCampaign?.id) return;

        setLoading(true);
        const trainersRef = collection(db, 'campaigns', selectedCampaign.id, 'trainers');
        const q = query(trainersRef, where("userId", "==", user.uid));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            if (querySnapshot.empty) {
                setMyTrainer(null);
            } else {
                const trainerData = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
                setMyTrainer(trainerData);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, selectedCampaign]);

    useEffect(() => {
        if (myTrainer && myTrainer.roster.length > 0) {
            const stillExists = myTrainer.roster.some(p => p.id === selectedPokemon?.id);
            if (!stillExists) { setSelectedPokemon(myTrainer.roster[0]); }
        } else { setSelectedPokemon(null); }
    }, [myTrainer, myTrainer?.roster, selectedPokemon?.id]);

    useEffect(() => {
        if (selectedPokemon && myTrainer) {
            const updatedPokemonInRoster = myTrainer.roster.find(p => p.id === selectedPokemon.id);
            const updatedPokemonInBox = myTrainer.boxes?.flatMap(b => b.pokemon).find(p => p.id === selectedPokemon.id);
            const updatedPokemon = updatedPokemonInRoster || updatedPokemonInBox;
            if (updatedPokemon) { setSelectedPokemon(updatedPokemon); }
        }
    }, [myTrainer]);

    useEffect(() => { setCurrentBoxIndex(0); }, [myTrainer]);

    // --- LOGIC FUNCTIONS ---
    const handleNicknameSave = async (pokemonId, newNickname) => {
        if (!myTrainer || !newNickname.trim()) return;
        const newRoster = [...myTrainer.roster];
        const newBoxes = JSON.parse(JSON.stringify(myTrainer.boxes));
        let wasUpdated = false;
        const rosterIndex = newRoster.findIndex(p => p.id === pokemonId);
        if (rosterIndex > -1) {
            newRoster[rosterIndex].name = newNickname;
            wasUpdated = true;
        } else {
            for (const box of newBoxes) {
                const boxIndex = box.pokemon.findIndex(p => p.id === pokemonId);
                if (boxIndex > -1) {
                    box.pokemon[boxIndex].name = newNickname;
                    wasUpdated = true;
                    break;
                }
            }
        }
        if (wasUpdated) {
            const trainerDocRef = doc(db, 'campaigns', selectedCampaign.id, 'trainers', myTrainer.id);
            try {
                await updateDoc(trainerDocRef, { roster: newRoster, boxes: newBoxes, });
            } catch (error) { console.error("Failed to save nickname:", error); }
        }
    };

    // Corrected handleSlotClick to use 'myTrainer'
    const handleSlotClick = async (destination) => {
        if (!myTrainer) return;
        if (!heldPokemon && destination.pokemon) {
            setHeldPokemon({ pokemon: destination.pokemon, origin: destination });
            return;
        }
        if (heldPokemon) {
            if (heldPokemon.origin.type === destination.type && heldPokemon.origin.index === destination.index && heldPokemon.origin.boxId === destination.boxId) {
                setHeldPokemon(null);
                return;
            }
            if (destination.type === 'roster' && !destination.pokemon && myTrainer.roster.length >= MAX_PARTY_SIZE) {
                alert("Party is full. You must swap with a party member.");
                return;
            }
            const trainersCollectionPath = `campaigns/${selectedCampaign.id}/trainers`;
            const trainerDocRef = doc(db, trainersCollectionPath, myTrainer.id);
            let newRoster = [...myTrainer.roster];
            let newBoxes = JSON.parse(JSON.stringify(myTrainer.boxes));
            if (heldPokemon.origin.type === 'roster') {
                newRoster.splice(heldPokemon.origin.index, 1);
            } else {
                const originBoxIndex = newBoxes.findIndex(b => b.id === heldPokemon.origin.boxId);
                if (originBoxIndex !== -1) { newBoxes[originBoxIndex].pokemon.splice(heldPokemon.origin.index, 1); }
            }
            const pokemonToDrop = heldPokemon.pokemon;
            const pokemonAtDestination = destination.pokemon;
            if (pokemonAtDestination) {
                if (heldPokemon.origin.type === 'roster') {
                    newRoster.splice(heldPokemon.origin.index, 0, pokemonAtDestination);
                } else {
                    const originBoxIndex = newBoxes.findIndex(b => b.id === heldPokemon.origin.boxId);
                    if (originBoxIndex !== -1) { newBoxes[originBoxIndex].pokemon.splice(heldPokemon.origin.index, 0, pokemonAtDestination); }
                }
            }
            if (destination.type === 'roster') {
                newRoster.splice(destination.index, (pokemonAtDestination ? 1 : 0), pokemonToDrop);
            } else {
                const destBoxIndex = newBoxes.findIndex(b => b.id === destination.boxId);
                if (destBoxIndex !== -1) { newBoxes[destBoxIndex].pokemon.splice(destination.index, (pokemonAtDestination ? 1 : 0), pokemonToDrop); }
            }
            try {
                await updateDoc(trainerDocRef, { roster: newRoster, boxes: newBoxes });
                setHeldPokemon(null);
            } catch (error) {
                alert(`Move failed: ${error.message}`);
            }
        }
    };
    const handleRenameBox = async (newName) => {
        if (!myTrainer || !finalPermissions.canRenameBoxes) return;

        // Create a deep copy to avoid state mutation issues
        const newBoxes = structuredClone(myTrainer.boxes);

        // Update the name of the currently selected box
        newBoxes[currentBoxIndex].name = newName;

        const trainerDocRef = doc(db, 'campaigns', selectedCampaign.id, 'trainers', myTrainer.id);
        try {
            await updateDoc(trainerDocRef, { boxes: newBoxes });
        } catch (error) {
            console.error("Failed to rename box:", error);
        }
    };
    const handleCardClick = (pokemon, destination) => {
        // If "Organize Mode" is on or we're holding a Pokémon, the only action is to move it.
        if ((isOrganizeMode || heldPokemon) && finalPermissions.canOrganizeBox) {
            handleSlotClick(destination);
            return; // Stop here.
        }

        // If not in Organize Mode, perform the default click action.
        if (destination.type === 'roster') {
            // If the Pokémon is in the Roster, update the bottom panel.
            setSelectedPokemon(pokemon);
        } else {
            // If the Pokémon is in the Box, open the pop-up modal.
            setViewingPokemon(pokemon);
        }
    };

    const getMoveDescription = (move) => {
        if (!move?.effect_entries?.length) return "No description available.";
        const entry = move.effect_entries.find(e => e.language?.name === 'en') || move.effect_entries[0];
        return entry.short_effect.replace(/\$effect_chance/g, move.meta?.ailment_chance);
    };

    if (loading) { return <div className="text-center p-12 text-xl">Loading...</div>; }
    if (!myTrainer) { return <div className="text-center p-12 text-gray-400">Your DM has not assigned a trainer to you yet.</div>; }

    const partyForDisplay = [...(myTrainer.roster || [])];
    while (partyForDisplay.length < 6) { partyForDisplay.push(null); }

    return (
        <div className="p-4 md:p-6">
            {viewingItem && <ItemDetailModal item={viewingItem} onClose={() => setViewingItem(null)} />}
            {viewingPokemon && <ViewPokemonModal pokemon={viewingPokemon} onClose={() => setViewingPokemon(null)} />}
            <h1 className="text-4xl font-bold text-yellow-400 mb-2 capitalize">Trainer: {myTrainer.name}</h1>
            <p className="text-gray-400 mb-4">Viewing campaign: {selectedCampaign.name}</p>
            <div className="flex space-x-2 border-b-2 border-gray-700 mb-4">
                <button onClick={() => setView('ROSTER')} className={`px-4 py-2 font-semibold text-lg ${view === 'ROSTER' ? 'border-b-4 border-yellow-500 text-white' : 'text-gray-400'}`}>Roster</button>
                {finalPermissions.canViewBox && <button onClick={() => setView('BOX')} className={`px-4 py-2 font-semibold text-lg ${view === 'BOX' ? 'border-b-4 border-yellow-500 text-white' : 'text-gray-400'}`}>Box</button>}
                {finalPermissions.canViewBag && <button onClick={() => setView('BAG')} className={`px-4 py-2 font-semibold text-lg ${view === 'BAG' ? 'border-b-4 border-yellow-500 text-white' : 'text-gray-400'}`}>Bag</button>}
            </div>


            {/* ====================================================== */}
            {/* Roster View Content (The Two-Panel HUD)              */}
            {/* ====================================================== */}
            {view === 'ROSTER' && (
                <div className="space-y-4">
                    {/* TOP PANEL - PARTY SUMMARY CARDS */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-2xl font-semibold">Party Pokémon ({myTrainer.roster?.length || 0})</h3>
                            {finalPermissions.canOrganizeBox && (
                                <button
                                    onClick={() => setIsOrganizeMode(prev => !prev)}
                                    className={`font-bold py-1 px-3 rounded-md text-sm text-white transition-colors ${isOrganizeMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-500'}`}
                                >
                                    {isOrganizeMode ? 'Done Organizing' : 'Organize'}
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[...Array(6)].map((_, index) => {
                                const pokemon = myTrainer.roster[index];
                                const destination = { type: 'roster', index, pokemon };
                                const isHeld = heldPokemon?.pokemon.id === pokemon?.id;

                                return pokemon ? (
                                    <div className={`rounded-lg transition-all duration-200 ${selectedPokemon?.id === pokemon.id && !isHeld ? 'bg-indigo-700 ring-2 ring-indigo-400' : ''} ${isHeld ? 'opacity-30 ring-2 ring-yellow-400' : ''}`}>
                                        <TrainerPokemonCard
                                            pokemon={pokemon}
                                            permissions={finalPermissions}
                                            onSaveNickname={handleNicknameSave}
                                            onClick={() => handleCardClick(pokemon, destination)}
                                        />
                                    </div>
                                ) : (
                                    <div key={`empty-roster-${index}`} onClick={() => handleCardClick(null, destination)} className="m-1 bg-gray-800/50 rounded-lg w-full h-full flex items-center justify-center cursor-pointer hover:bg-gray-700/50 border-2 border-dashed border-gray-600">
                                        {heldPokemon && <span className="text-gray-500">Drop Here</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* BOTTOM PANEL - MASTER DETAIL VIEW */}
                    {selectedPokemon && (
                        <div className="bg-gray-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="md:col-span-1 flex flex-col items-center">
                                <img src={getSprite(selectedPokemon)} alt={selectedPokemon.name} className="h-60 w-60" />
                                <div className="text-center mt-2 w-full">
                                    <div className="flex justify-center gap-2 mb-3">
                                        {selectedPokemon.types.map(type => <span key={type} className={`px-3 py-1 text-base rounded font-bold ${TYPE_COLORS[type]}`}>{type.toUpperCase()}</span>)}
                                    </div>
                                    <h3 className="text-4xl font-bold">{selectedPokemon.name}</h3>
                                    <div className="w-full bg-gray-900 rounded-full h-5 my-2 border border-gray-600">
                                        <div className="bg-green-500 h-full rounded-full text-center text-xs font-bold text-white flex items-center justify-center" style={{ width: `${(selectedPokemon.currentHp / selectedPokemon.maxHp) * 100}%` }}>
                                            {selectedPokemon.currentHp} / {selectedPokemon.maxHp}
                                        </div>
                                    </div>
                                    <p className="text-sm">Lvl {selectedPokemon.level} {selectedPokemon.gender !== 'Genderless' && <span>({selectedPokemon.gender})</span>}</p>
                                    {selectedPokemon.status !== 'None' && <p className="text-sm font-bold text-yellow-400">{selectedPokemon.status}</p>}
                                </div>
                            </div>
                            <div className="md:col-span-1 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-gray-900/70 p-3 rounded-lg">
                                        <h4 className="font-bold text-indigo-300 border-b border-indigo-500/50 pb-1 mb-2">Ability</h4>
                                        <p className="font-semibold capitalize text-white text-lg">{selectedPokemon.ability?.replace(/-/g, ' ')}</p>
                                        <p className="text-xs text-gray-400 mt-1">{selectedPokemon.abilityDescription || "No description available."}</p>
                                    </div>
                                    <div className="bg-gray-900/70 p-3 rounded-lg flex flex-col text-center">
                                        <h4 className="font-bold text-indigo-300 border-b border-indigo-500/50 pb-1 mb-2">Held Item</h4>
                                        {selectedPokemon.heldItem ? (
                                            <div className="flex-grow flex flex-col items-center justify-center gap-2">
                                                <img src={selectedPokemon.heldItem.sprite} alt={selectedPokemon.heldItem.name} className="w-16 h-16" />
                                                <p className="font-semibold capitalize text-white">{selectedPokemon.heldItem.name}</p>
                                            </div>
                                        ) : <div className="flex-grow flex items-center justify-center text-gray-400">None</div>}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-indigo-300 mb-1">Moves</h4>
                                    <div className="space-y-2">
                                        {(selectedPokemon.moves || []).map(move => (
                                            <div key={move.name} className={`p-2 rounded-md bg-gray-900`}>
                                                <div className="flex justify-between items-center mb-1"><p className="font-semibold capitalize text-white mix-blend-screen">{move.name}</p><p className="text-xs">{move.pp}/{move.maxPp} PP</p></div>
                                                <div className="flex gap-4 text-xs text-gray-400 mb-1"><div className="flex items-center gap-1"><span className={`w-3 h-3 rounded-full ${TYPE_COLORS[move.type]}`}></span>{move.type}</div><div className="flex items-center gap-1">{MOVE_CATEGORY_ICONS[move.damage_class]} {move.damage_class}</div><span>Pwr: {move.power || '—'}</span><span>Acc: {move.accuracy || '—'}</span></div>
                                                <p className="text-xs text-gray-300 italic">{getMoveDescription(move)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="md:col-span-1">
                                <h4 className="font-bold text-indigo-300 mb-2">Base Stats</h4>
                                <div className="space-y-1 text-sm">{Object.entries(selectedPokemon.baseStats || {}).map(([stat, value]) => (<div key={stat} className="grid grid-cols-3 items-center"><span className="capitalize font-semibold col-span-1">{stat.replace('special-', 'Sp. ')}</span><span className="font-mono text-right col-span-1">{value}</span><div className="col-span-1 bg-gray-900 ml-2 rounded-full h-3"><div className="bg-yellow-500 h-3 rounded-full" style={{ width: `${(value / 255) * 100}%` }}></div></div></div>))}</div>
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* ====================================================== */}
            {/* Box View Content (Simple Grid)                       */}
            {/* ====================================================== */}
            {view === 'BOX' && finalPermissions.canViewBox && (
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-2xl font-semibold">Pokémon in Box</h3>
                        {finalPermissions.canOrganizeBox && (
                            <button
                                onClick={() => setIsOrganizeMode(prev => !prev)}
                                className={`font-bold py-1 px-3 rounded-md text-sm text-white transition-colors ${isOrganizeMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-500'}`}
                            >
                                {isOrganizeMode ? 'Done Organizing' : 'Organize'}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center justify-center gap-4 mb-3 bg-gray-900 p-2 rounded-md">
                        <button
                            onClick={() => setCurrentBoxIndex(i => Math.max(0, i - 1))}
                            disabled={currentBoxIndex === 0}
                            className="px-3 py-1 bg-indigo-600 rounded hover:bg-indigo-700 disabled:bg-gray-600"
                        >
                            ←
                        </button>

                        {/* The box name is now an input field */}
                        <input
                            type="text"
                            value={myTrainer.boxes?.[currentBoxIndex]?.name || ''}
                            onChange={(e) => handleRenameBox(e.target.value)}
                            // The input is disabled if the player doesn't have permission
                            disabled={!finalPermissions.canRenameBoxes}
                            className="bg-gray-700 p-1 rounded-md border border-gray-600 text-lg text-yellow-300 font-bold text-center w-40 disabled:bg-transparent disabled:border-transparent disabled:cursor-default"
                        />

                        <button
                            onClick={() => setCurrentBoxIndex(i => Math.min((myTrainer.boxes?.length || 1) - 1, i + 1))}
                            disabled={currentBoxIndex >= (myTrainer.boxes?.length || 1) - 1}
                            className="px-3 py-1 bg-indigo-600 rounded hover:bg-indigo-700 disabled:bg-gray-600"
                        >
                            →
                        </button>
                    </div>
                    {/* The new interactive Pokémon Grid */}
                    <div className="grid grid-cols-6 gap-2 mb-4 max-w-max mx-auto">
                        {[...Array(30)].map((_, index) => {
                            const currentBox = myTrainer.boxes?.[currentBoxIndex];
                            const pokemon = currentBox?.pokemon[index];
                            const destination = { type: 'box', boxId: currentBox?.id, index, pokemon };
                            const isHeld = heldPokemon?.pokemon.id === pokemon?.id;
                            return (
                                // This outer div is now the SAME for both filled and empty slots
                                <div
                                    key={pokemon ? pokemon.id : `empty-box-${index}`}
                                    className={`m-1 ${finalPermissions.canOrganizeBox ? 'cursor-grab' : 'cursor-pointer'}`}
                                    onClick={() => handleCardClick(pokemon, destination)}
                                >
                                    {pokemon ? (
                                        // Inner div for a FILLED slot
                                        <div className={`relative group flex items-center justify-center rounded-md w-[120px] h-[120px] transition-colors ${isHeld ? 'opacity-30 ring-2 ring-yellow-400' : 'bg-gray-700/50 hover:bg-gray-600/50'}`}>
                                            <img src={getSprite(pokemon)} alt={pokemon.name} className="h-24 w-24 pointer-events-none" />
                                        </div>
                                    ) : (
                                        // Inner div for an EMPTY slot
                                        <div className="bg-gray-800/50 rounded-md w-[120px] h-[120px] flex items-center justify-center border-2 border-dashed border-gray-600 transition-colors hover:bg-gray-700/50">
                                            {heldPokemon && finalPermissions.canOrganizeBox && <span className="text-gray-500 text-xs text-center">Drop</span>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}


            {/* ====================================================== */}
            {/* Bag View Content (Simple List)                       */}
            {/* ====================================================== */}
            {view === 'BAG' && finalPermissions.canViewBag && (
                <div>
                    <h3 className="text-2xl font-semibold mb-3">My Bag</h3>

                    <div className="flex space-x-1 rounded-lg bg-gray-900 p-1 mb-4">
                        {POCKETS.map(pocket => (
                            <button
                                key={pocket}
                                onClick={() => setActivePocket(pocket)}
                                className={`w-full rounded-lg py-2 text-sm font-medium leading-5 transition-all duration-200 ease-in-out capitalize ${activePocket === pocket ? 'bg-yellow-600 text-black shadow' : 'text-gray-300 hover:bg-gray-700/50'}`}
                            >
                                {pocket.replace(/-/g, ' ')}
                            </button>
                        ))}
                    </div>

                    <div className="bg-gray-800 p-4 rounded-lg">
                        <ul className="space-y-2 max-h-96 overflow-y-auto">
                            {Object.values(myTrainer.bag || {}).filter(item => {
                                const itemPocket = CATEGORY_TO_POCKET_MAPPING[item.category] || 'Other';
                                return itemPocket === activePocket;
                            }).sort((a, b) => a.name.localeCompare(b.name))
                                .map(item => (
                                    // 4. Add onClick and cursor-pointer to the <li>
                                    <li key={item.name} onClick={() => setViewingItem(item)} className="flex items-center gap-4 p-2 bg-gray-700 rounded-md cursor-pointer hover:bg-indigo-800">
                                        <img src={item.sprite} alt={item.name} className="w-8 h-8" />
                                        <span className="flex-grow capitalize">{item.name.replace(/-/g, ' ')}</span>
                                        <span className="font-semibold">x{item.quantity}</span>
                                    </li>
                                ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrainerView;