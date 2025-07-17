// src/components/trainer/TrainerView.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useManagerContext } from '../../context/ManagerContext';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getSprite } from '../../utils/api';
import { TYPE_COLORS, MOVE_CATEGORY_ICONS } from '../../config/gameData';

const TrainerView = () => {
    const { state, selectedCampaign } = useManagerContext();
    const { user } = state;
    const [myTrainer, setMyTrainer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedPokemon, setSelectedPokemon] = useState(null);
    
    const finalPermissions = useMemo(() => {
        // Start with sensible defaults in case permissions aren't set in the database
        const defaults = {
            canViewRoster: true,
            canViewBox: false,
            canViewBag: false,
            canEditNicknames: false,
            canUseItems: false,
        };

        const campaignDefaults = selectedCampaign?.defaultPermissions || {};
        const trainerOverrides = myTrainer?.overridePermissions || {};

        // Merge them all, with overrides taking top priority
        return {
            ...defaults,
            ...campaignDefaults,
            ...trainerOverrides
        };
    }, [selectedCampaign, myTrainer]);
    const handleNicknameSave = async (pokemonId, newNickname) => {
        // Ensure we have the necessary data and the nickname isn't empty
        if (!myTrainer || !newNickname.trim()) return;

        // Find the specific Pokémon in either the roster or the box
        let isRosterPokemon = true;
        let pokemonIndex = myTrainer.roster.findIndex(p => p.id === pokemonId);

        if (pokemonIndex === -1) {
            isRosterPokemon = false;
            pokemonIndex = myTrainer.box.findIndex(p => p.id === pokemonId);
        }

        // If the Pokémon wasn't found anywhere, do nothing.
        if (pokemonIndex === -1) return;

        // Create copies of the arrays to avoid mutating state directly
        const newRoster = [...myTrainer.roster];
        const newBox = [...myTrainer.box];

        // Prepare the payload to update Firestore
        let updatePayload = {};

        if (isRosterPokemon) {
            // Update the name of the Pokémon in the new roster array
            newRoster[pokemonIndex] = { ...newRoster[pokemonIndex], name: newNickname };
            updatePayload = { roster: newRoster };
        } else {
            // Update the name of the Pokémon in the new box array
            newBox[pokemonIndex] = { ...newBox[pokemonIndex], name: newNickname };
            updatePayload = { box: newBox };
        }

        // Save the updated array back to Firestore
        const trainerDocRef = doc(db, 'campaigns', selectedCampaign.id, 'trainers', myTrainer.id);
        try {
            await updateDoc(trainerDocRef, updatePayload);
        } catch (error) {
            console.error("Failed to save nickname:", error);
            // In a real app, you might dispatch an error to the UI here
        }
    };
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
                if (!selectedPokemon) {
                    setSelectedPokemon(trainerData.roster[0]);
                }
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user, selectedCampaign]);

    useEffect(() => {
        if (myTrainer && myTrainer.roster.length > 0) {
            const stillExists = myTrainer.roster.some(p => p.id === selectedPokemon?.id);
            if (!stillExists) {
                setSelectedPokemon(myTrainer.roster[0]);
            }
        } else {
            setSelectedPokemon(null);
        }
    }, [myTrainer?.roster]);


    if (loading) {
        return <div className="text-center p-12 text-xl">Loading Your Trainer Data...</div>;
    }

    if (!myTrainer) {
        return <div className="text-center p-12 text-gray-400">Your DM has not assigned a trainer to you yet.</div>;
    }

    const partyForDisplay = [...(myTrainer.roster || [])];
    while (partyForDisplay.length < 6) {
        partyForDisplay.push(null);
    }
    const getMoveDescription = (move) => {
        if (!move?.effect_entries?.length) return "No description available.";
        const entry = move.effect_entries.find(e => e.language?.name === 'en') || move.effect_entries[0];
        return entry.short_effect.replace(/\$effect_chance/g, move.meta?.ailment_chance);
    };
    const TrainerPokemonCard = ({ pokemon, permissions, onSaveNickname }) => {
        // State to manage whether the input field is visible
        const [isEditing, setIsEditing] = useState(false);
        // State to hold the value of the input field
        const [nickname, setNickname] = useState(pokemon.name);

        const handleSave = () => {
            // Only save if the name has actually changed
            if (nickname.trim() && nickname !== pokemon.name) {
                onSaveNickname(pokemon.id, nickname);
            }
            setIsEditing(false); // Exit edit mode
        };

        const handleNameClick = () => {
            // Only enter edit mode if the permission is granted
            if (permissions.canEditNicknames) {
                setIsEditing(true);
            }
        };

        return (
            <div className={`relative p-2 bg-gray-700 rounded-md flex flex-col justify-between transition-all duration-200 ${pokemon.fainted ? 'opacity-50' : ''}`}>
                {pokemon.fainted && (<div className="absolute inset-0 flex items-center justify-center z-20"><span className="text-red-500 font-bold text-lg transform -rotate-12 bg-black/50 px-2 py-1 rounded">FAINTED</span></div>)}
                {pokemon.heldItem?.sprite && <div className="absolute top-1 right-1 bg-gray-500/50 p-0.5 rounded-full z-10" title={pokemon.heldItem.name}><img src={pokemon.heldItem.sprite} alt={pokemon.heldItem.name} className="h-6 w-6" /></div>}

                <div className="text-center">
                    <img src={getSprite(pokemon)} alt={pokemon.name} className="mx-auto h-20 w-20" />

                    {/* --- THIS IS THE UPDATED LOGIC --- */}
                    {isEditing ? (
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            onBlur={handleSave} // Save when you click away
                            onKeyDown={(e) => e.key === 'Enter' && handleSave()} // Save when you press Enter
                            className="w-full text-center bg-gray-900 rounded-md text-white mt-1"
                            autoFocus
                        />
                    ) : (
                        <p className="text-sm font-semibold truncate mt-1 cursor-pointer" onClick={handleNameClick}>
                            {pokemon.name}
                            {permissions.canEditNicknames && <span className="text-xs text-gray-400 ml-1 hover:underline">(edit)</span>}
                        </p>
                    )}
                    {/* --- END UPDATED LOGIC --- */}

                </div>
                <div className="flex flex-wrap justify-center gap-1 mt-1">{pokemon.types?.map(type => <span key={type} className={`px-1.5 py-0.5 text-xs rounded-full uppercase font-bold ${TYPE_COLORS[type]}`}>{type}</span>)}</div>
            </div>
        );
    };
    return (
        <div className="p-4 md:p-6 space-y-4">
            {/* ================================================================== */}
            {/* TOP PANEL - PARTY SUMMARY CARDS (WITH NITPICK CHANGES)           */}
            {/* ================================================================== */}
            <div>
                <h2 className="text-2xl font-bold mb-3">Party Pokémon</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {partyForDisplay.map((pokemon, index) => (
                        pokemon ? (
                            <div
                                key={pokemon.id}
                                onClick={() => setSelectedPokemon(pokemon)}
                                className={`p-2 rounded-lg cursor-pointer transition-all duration-200 ${selectedPokemon?.id === pokemon.id ? 'bg-indigo-700 ring-2 ring-indigo-400' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                <div className="text-center">
                                    <p className="font-bold text-sm truncate">{pokemon.name}</p>
                                    <p className="text-xs text-gray-300">Lvl {pokemon.level}</p>
                                    <div className="w-full bg-gray-900 rounded-full h-2 my-1">
                                        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(pokemon.currentHp / pokemon.maxHp) * 100}%` }}></div>
                                    </div>
                                </div>
                                <img src={getSprite(pokemon)} alt={pokemon.name} className="h-20 w-20 mx-auto" />
                                <div className="flex justify-center gap-1 mt-1">
                                    {pokemon.types.map(type => <span key={type} className={`px-1.5 py-0.5 text-[10px] rounded font-bold ${TYPE_COLORS[type]}`}>{type.toUpperCase()}</span>)}
                                </div>
                                <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                                    <span className="truncate" title={pokemon.ability}>{pokemon.ability}</span>
                                    {/* --- NITPICK CHANGE: Item icon bigger --- */}
                                    {pokemon.heldItem && <img src={pokemon.heldItem.sprite} alt={pokemon.heldItem.name} title={pokemon.heldItem.name} className="h-6 w-6" />}
                                </div>
                                <div className="mt-1 space-y-1 text-xs">
                                    {(pokemon.moves || []).slice(0, 4).map(move => (
                                        /* --- NITPICK CHANGE: Move background is now the type color --- */
                                        <div key={move.name} className={`flex justify-between items-center p-1 rounded ${TYPE_COLORS[move.type]}`}>
                                            <span className="truncate font-semibold text-white mix-blend-screen" title={move.name}>{move.name}</span>
                                            <span className="text-gray-200 font-mono">{move.pp}/{move.maxPp}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div key={`empty-${index}`} className="p-2 rounded-lg bg-gray-800/50 flex items-center justify-center h-full min-h-[240px]">
                                <span className="text-gray-600 text-3xl font-bold">?</span>
                            </div>
                        )
                    ))}
                </div>
            </div>
            {selectedPokemon && (
                <div className="bg-gray-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Left Column: Sprite and Identity */}
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

                    {/* Middle Column: Abilities, Items, and Moves */}
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
                                    <div key={move.name} className={`p-2 rounded-md ${TYPE_COLORS[move.type]}`}>
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="font-semibold capitalize text-white mix-blend-screen">{move.name}</p>
                                            <p className="text-xs">{move.pp}/{move.maxPp} PP</p>
                                        </div>
                                        <div className="flex gap-4 text-xs text-gray-400 mb-1">
                                            <div className="flex items-center gap-1"><span className={`w-3 h-3 rounded-full ${TYPE_COLORS[move.type]}`}></span>{move.type}</div>
                                            <div className="flex items-center gap-1">{MOVE_CATEGORY_ICONS[move.damage_class]} {move.damage_class}</div>
                                            <span>Pwr: {move.power || '—'}</span>
                                            <span>Acc: {move.accuracy || '—'}</span>
                                        </div>
                                        {/* --- THIS IS THE NEWLY ADDED MOVE DESCRIPTION --- */}
                                        <p className="text-xs text-gray-300 italic">{getMoveDescription(move)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* --- THIS IS THE RESTORED STATS PANEL --- */}
                    <div className="md:col-span-1">
                        <h4 className="font-bold text-indigo-300 mb-2">Base Stats</h4>
                        <div className="space-y-1 text-sm">
                            {Object.entries(selectedPokemon.baseStats || {}).map(([stat, value]) => (
                                <div key={stat} className="grid grid-cols-3 items-center">
                                    <span className="capitalize font-semibold col-span-1">{stat.replace('special-', 'Sp. ')}</span>
                                    <span className="font-mono text-right col-span-1">{value}</span>
                                    <div className="col-span-1 bg-gray-900 ml-2 rounded-full h-3"><div className="bg-yellow-500 h-3 rounded-full" style={{ width: `${(value / 255) * 100}%` }}></div></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrainerView;