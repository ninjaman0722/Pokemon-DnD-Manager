// src/ManagerApp.jsx

import React, { useState, useEffect, useReducer, useRef } from 'react';
import { ManagerContext } from './context/ManagerContext';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { auth, db, appId } from './config/firebase';
import TrainerManager from './components/manager/TrainerManager';
import BattleSetup from './components/manager/BattleSetup';
import { POKEAPI_BASE_URL } from './config/gameData';
import { officialFormsData } from './config/officialFormsData'; // Import our generated data

const initialState = {
    view: 'TRAINER_MANAGER',
    trainers: [],
    battleState: null,
    loading: 'Authenticating...',
    error: null,
    selectedTrainerId: null,
    pokemonList: [],
    itemList: [],
    moveList: [],
    abilityList: [],
    customPokemon: [],
    customMoves: [],
    customAbilities: [],
    combinedPokemonList: [],
    combinedItemList: [],
    combinedMoveList: [],
    combinedAbilityList: [],
    userId: null,
};

function appReducer(state, action) {
    switch (action.type) {
        case 'SET_LOADING': return { ...state, loading: action.payload, error: null };
        case 'SET_ERROR': return { ...state, error: action.payload, loading: null };
        case 'DISMISS_ERROR': return { ...state, error: null };
        case 'SET_VIEW': return { ...state, view: action.payload, error: null };
        case 'SET_TRAINERS': return { ...state, trainers: action.payload };
        case 'SELECT_TRAINER': return { ...state, selectedTrainerId: action.payload };
        case 'SET_POKEMON_LIST': return { ...state, pokemonList: action.payload };
        case 'SET_ITEM_LIST': return { ...state, itemList: action.payload };
        case 'SET_MOVE_LIST': return { ...state, moveList: action.payload };
        case 'SET_ABILITY_LIST': return { ...state, abilityList: action.payload };
        case 'SET_CUSTOM_POKEMON': return { ...state, customPokemon: action.payload };
        case 'SET_CUSTOM_MOVES': return { ...state, customMoves: action.payload };
        case 'SET_CUSTOM_ABILITIES': return { ...state, customAbilities: action.payload };
        case 'SET_COMBINED_LISTS': return { 
            ...state, 
            combinedPokemonList: action.payload.pokemon, 
            combinedItemList: action.payload.items,
            combinedMoveList: action.payload.moves,
            combinedAbilityList: action.payload.abilities,
        };
        case 'AUTH_SUCCESS': return { ...state, userId: action.payload, loading: 'Initializing App...' };
        default: return state;
    }
}

function ManagerApp() {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const selectedTrainerIdRef = useRef(state.selectedTrainerId);

    useEffect(() => {
        selectedTrainerIdRef.current = state.selectedTrainerId;
    }, [state.selectedTrainerId]);

    useEffect(() => {
        if (!auth) {
            dispatch({ type: 'SET_ERROR', payload: 'Firebase could not be initialized.' });
            return;
        }
        const unsubAuth = onAuthStateChanged(auth, user => {
            if (user) {
                dispatch({ type: 'AUTH_SUCCESS', payload: user.uid });
            } else {
                signInAnonymously(auth).catch(error => {
                    dispatch({ type: 'SET_ERROR', payload: `Authentication failed: ${error.message}` });
                });
            }
        });
        return () => unsubAuth();
    }, []);

    useEffect(() => {
        const combineData = () => {
            // --- NEW, DATA-DRIVEN FILTERING LOGIC ---
            
            // 1. Create a set of all temporary BATTLE-only form names to exclude.
            const battleOnlyFormNames = new Set();
            Object.values(officialFormsData).forEach(formsArray => {
                formsArray.forEach(form => {
                    // We now also check for triggerAbility/Move to exclude things like Zen Mode
                    if (form.changeMethod === 'BATTLE' || form.triggerAbility) {
                        battleOnlyFormNames.add(form.formName);
                    }
                });
            });

            // 2. Filter the main list from the API to exclude those temporary forms.
            // This correctly keeps permanent regional forms like 'ninetales-alola'.
            const officialPokemonNames = state.pokemonList.filter(p => !battleOnlyFormNames.has(p));

            // 3. Combine with your custom Pokémon.
            const customPokemonNames = state.customPokemon.map(p => p.name.toLowerCase());
            const combinedPokemon = [...new Set([...officialPokemonNames, ...customPokemonNames])].sort();

            const officialItemNames = state.itemList.map(i => i.toLowerCase());
            const combinedItems = [...new Set([...officialItemNames])].sort();

            const officialMoveNames = state.moveList.map(m => m.toLowerCase());
            const customMoveNames = state.customMoves.map(m => m.name.toLowerCase());
            const combinedMoves = [...new Set([...officialMoveNames, ...customMoveNames])].sort();

            const officialAbilityNames = state.abilityList.map(a => a.toLowerCase());
            const customAbilityNames = state.customAbilities.map(a => a.name.toLowerCase());
            const combinedAbilities = [...new Set([...officialAbilityNames, ...customAbilityNames])].sort();

            dispatch({ type: 'SET_COMBINED_LISTS', payload: { 
                pokemon: combinedPokemon, 
                items: combinedItems,
                moves: combinedMoves,
                abilities: combinedAbilities,
            }});
        };
        combineData();
    }, [state.pokemonList, state.itemList, state.moveList, state.abilityList, state.customPokemon, state.customMoves, state.customAbilities]);


    useEffect(() => {
        if (!state.userId) return;
        
        const unsubscribers = [];

        const fetchInitialData = async () => {
            try {
                dispatch({ type: 'SET_LOADING', payload: 'Fetching Game Data...' });
                const [pokeListData, itemListData, moveListData, abilityListData] = await Promise.all([
                    fetch(`${POKEAPI_BASE_URL}pokemon?limit=1500`).then(res => res.json()),
                    fetch(`${POKEAPI_BASE_URL}item?limit=2000`).then(res => res.json()),
                    fetch(`${POKEAPI_BASE_URL}move?limit=1000`).then(res => res.json()),
                    fetch(`${POKEAPI_BASE_URL}ability?limit=400`).then(res => res.json())
                ]);
                dispatch({ type: 'SET_POKEMON_LIST', payload: pokeListData.results.map(p => p.name) });
                dispatch({ type: 'SET_ITEM_LIST', payload: itemListData.results.map(i => i.name) });
                dispatch({ type: 'SET_MOVE_LIST', payload: moveListData.results.map(m => m.name) });
                dispatch({ type: 'SET_ABILITY_LIST', payload: abilityListData.results.map(a => a.name) });

                const trainersCollectionPath = `artifacts/${appId}/public/data/trainers`;
                const trainersCollectionRef = collection(db, trainersCollectionPath);
                
                const customPokemonRef = collection(db, `artifacts/${appId}/public/data/custom-pokemon`);
                unsubscribers.push(onSnapshot(customPokemonRef, (snapshot) => {
                    dispatch({ type: 'SET_CUSTOM_POKEMON', payload: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) });
                }));

                const customMovesRef = collection(db, `artifacts/${appId}/public/data/custom-moves`);
                unsubscribers.push(onSnapshot(customMovesRef, (snapshot) => {
                    dispatch({ type: 'SET_CUSTOM_MOVES', payload: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id || doc.data().name.toLowerCase().replace(/\s/g, '-') })) });
                }));
                
                const customAbilitiesRef = collection(db, `artifacts/${appId}/public/data/custom-abilities`);
                unsubscribers.push(onSnapshot(customAbilitiesRef, (snapshot) => {
                    dispatch({ type: 'SET_CUSTOM_ABILITIES', payload: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) });
                }));

                // The logic for adding preloaded trainers has been removed from this listener.
                unsubscribers.push(onSnapshot(trainersCollectionRef, async (snapshot) => {
                    dispatch({ type: 'SET_LOADING', payload: 'Syncing Trainers...' });
                    const trainerList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    dispatch({ type: 'SET_TRAINERS', payload: trainerList });
                    
                    const currentSelectedId = selectedTrainerIdRef.current;
                    const selectedExists = trainerList.some(t => t.id === currentSelectedId);
                    
                    if (!selectedExists) {
                        const newSelection = trainerList.find(t => t.category === 'partyMembers') || trainerList[0];
                        dispatch({ type: 'SELECT_TRAINER', payload: newSelection?.id || null });
                    }
                    
                    dispatch({ type: 'SET_LOADING', payload: null });
                }, (error) => { dispatch({ type: 'SET_ERROR', payload: `Firestore error: ${error.message}` }); }));

            } catch (error) { dispatch({ type: 'SET_ERROR', payload: `Could not initialize app: ${error.message}.` }); }
        };

        fetchInitialData();
        return () => { unsubscribers.forEach(unsub => unsub()); };
    }, [state.userId]);

    const renderView = () => {
        switch (state.view) {
            case 'TRAINER_MANAGER': return <TrainerManager />;
            case 'BATTLE_SETUP': return <BattleSetup state={state} dispatch={dispatch} />;
            default: return <TrainerManager />;
        }
    };
    
    const contextValue = { 
        state, 
        dispatch 
    };

    return (
        <ManagerContext.Provider value={contextValue}>
            <div className="bg-gray-900 text-white min-h-screen font-sans">
                <div className={`fixed inset-0 bg-black bg-opacity-70 flex flex-col justify-center items-center z-50 p-4 transition-opacity duration-300 ${state.loading || state.error ? 'flex' : 'hidden opacity-0'}`}>
                    {state.loading && (<><div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-500"></div><p className="text-xl mt-4">{state.loading}</p></>)}
                    {state.error && (<div className="bg-red-800 border border-red-600 text-white p-6 rounded-lg max-w-lg text-center shadow-2xl"><h2 className="text-2xl font-bold mb-4">An Error Occurred</h2><p className="text-left whitespace-pre-wrap">{state.error}</p><button onClick={() => dispatch({ type: 'DISMISS_ERROR' })} className="mt-6 bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded">Dismiss</button></div>)}
                </div>
                <div className={`transition-opacity duration-300 ${state.loading ? 'opacity-20' : 'opacity-100'}`}>
                    {renderView()}
                </div>
            </div>
        </ManagerContext.Provider>
    );
}

export default ManagerApp;