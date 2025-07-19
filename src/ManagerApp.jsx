// src/ManagerApp.jsx

import React, { useState, useEffect, useReducer, useRef } from 'react';
import { ManagerContext } from './context/ManagerContext';
import { onSnapshot, collection, addDoc, serverTimestamp, query, where, getDoc, doc } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import TrainerManager from './components/manager/TrainerManager';
import BattleSetup from './components/manager/BattleSetup';
import { POKEAPI_BASE_URL } from './config/gameData';
import { officialFormsData } from './config/officialFormsData';
import CampaignDashboard from './components/manager/CampaignDashboard';
import TrainerView from './components/trainer/TrainerView';

// New initial state with campaign management
const initialState = {
    view: 'TRAINER_MANAGER',
    trainers: [],
    loading: 'Initializing...',
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
    user: null, // To store the user object
    campaigns: [], // To store the user's campaigns
    selectedCampaignId: null, // To store the currently active campaign
};

function appReducer(state, action) {
    switch (action.type) {
        case 'SET_LOADING': return { ...state, loading: action.payload, error: null };
        case 'SET_ERROR': return { ...state, error: action.payload, loading: null };
        case 'DISMISS_ERROR': return { ...state, error: null };
        case 'SET_VIEW': return { ...state, view: action.payload, error: null };
        case 'SET_USER': return { ...state, user: action.payload };
        case 'SET_CAMPAIGNS': return { ...state, campaigns: action.payload };
        case 'SELECT_CAMPAIGN': return { ...state, selectedCampaignId: action.payload, trainers: [], selectedTrainerId: null }; // Reset trainers on campaign change
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
        // Add a sign out case
        case 'SIGN_OUT':
            auth.signOut();
            return initialState; // Reset state on sign out
        default: return state;
    }
}

// Main App Component - now receives 'user' as a prop from ProtectedRoute
function ManagerApp({ user }) {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const [newCampaignName, setNewCampaignName] = useState('');
    const dataListeners = useRef([]); // To hold our Firestore listeners

    // --- NEW ---
    // Set the user in our state once received from the router
    useEffect(() => {
        if (user) {
            dispatch({ type: 'SET_USER', payload: { uid: user.uid, displayName: user.displayName, email: user.email } });
        }
    }, [user]);

    // --- NEW ---
    // Effect to fetch the user's campaigns
    useEffect(() => {
        if (!state.user?.uid) return;
        dispatch({ type: 'SET_LOADING', payload: 'Syncing Campaigns...' });

        let ownedCampaigns = [];
        let joinedCampaigns = [];

        // --- NEW: Flags to track when initial data has been loaded ---
        let initialOwnedLoadComplete = false;
        let initialJoinedLoadComplete = false;

        const updateCombinedState = () => {
            const allCampaigns = [...ownedCampaigns];
            joinedCampaigns.forEach(j => {
                if (!allCampaigns.some(o => o.id === j.id)) {
                    allCampaigns.push(j);
                }
            });

            dispatch({ type: 'SET_CAMPAIGNS', payload: allCampaigns });

            // --- NEW: Only hide the loading screen after BOTH listeners have run at least once ---
            if (initialOwnedLoadComplete && initialJoinedLoadComplete) {
                dispatch({ type: 'SET_LOADING', payload: null });
            }
        };

        const ownedQuery = query(collection(db, 'campaigns'), where('ownerId', '==', state.user.uid));
        const unsubOwned = onSnapshot(ownedQuery, (snapshot) => {
            ownedCampaigns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), role: 'DM' }));
            initialOwnedLoadComplete = true; // Mark this listener as having loaded
            updateCombinedState();
        }, (error) => {
            dispatch({ type: 'SET_ERROR', payload: `Failed to fetch owned campaigns: ${error.message}` });
        });

        const joinedQuery = query(collection(db, 'campaigns'), where('members', 'array-contains', state.user.uid));
        const unsubJoined = onSnapshot(joinedQuery, async (snapshot) => {
            const joinedCampaignsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), role: 'TRAINER' }));
            const dmProfilePromises = joinedCampaignsData.map(c => getDoc(doc(db, "users", c.ownerId)));
            const dmProfileSnapshots = await Promise.all(dmProfilePromises);
            const dmProfiles = dmProfileSnapshots.reduce((acc, snap) => {
                acc[snap.id] = snap.data();
                return acc;
            }, {});

            joinedCampaigns = joinedCampaignsData.map(c => ({
                ...c,
                dmName: dmProfiles[c.ownerId]?.displayName || 'Unknown DM'
            }));
            initialJoinedLoadComplete = true; // Mark this listener as having loaded
            updateCombinedState();
        }, (error) => {
            dispatch({ type: 'SET_ERROR', payload: `Failed to fetch joined campaigns: ${error.message}` });
        });

        return () => {
            unsubOwned();
            unsubJoined();
        };
    }, [state.user?.uid]);

    // --- MODIFIED ---
    // This now fetches all data for a SPECIFIC campaign
    useEffect(() => {
        // This function unsubscribes from all active listeners.
        const cleanupListeners = () => {
            dataListeners.current.forEach(unsub => unsub());
            dataListeners.current = [];
        };

        // --- NEW GUARD CLAUSE ---
        // If we are not in the trainer manager view, or if no campaign is selected,
        // we should clean up any existing listeners and do nothing else.
        if (state.view !== 'TRAINER_MANAGER' || !state.selectedCampaignId) {
            cleanupListeners();
            return;
        };

        // If we are in the correct view, proceed with fetching data.
        cleanupListeners(); // Clean up previous listeners before setting up new ones.

        const campaignId = state.selectedCampaignId;
        dispatch({ type: 'SET_LOADING', payload: 'Loading campaign data...' });

        const setupSnapshotListener = (collectionName, actionType) => {
            const collectionPath = `campaigns/${campaignId}/${collectionName}`;
            const collectionRef = collection(db, collectionPath);
            const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
                const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                dispatch({ type: actionType, payload: data });
            }, (error) => {
                console.error(`Error listening to ${collectionName}:`, error)
                dispatch({ type: 'SET_ERROR', payload: `Failed to sync ${collectionName}: ${error.message}` });
            });
            dataListeners.current.push(unsubscribe);
        };

        // Setup listeners for all our data subcollections
        setupSnapshotListener('trainers', 'SET_TRAINERS');
        setupSnapshotListener('custom-pokemon', 'SET_CUSTOM_POKEMON');
        setupSnapshotListener('custom-moves', 'SET_CUSTOM_MOVES');
        setupSnapshotListener('custom-abilities', 'SET_CUSTOM_ABILITIES');

        // Hide the main loading indicator. Data will continue syncing.
        dispatch({ type: 'SET_LOADING', payload: null });

        // The return function is our main cleanup.
        return cleanupListeners;

    }, [state.selectedCampaignId, state.view]);

    // --- UNCHANGED ---
    // Effect to fetch PokeAPI data (only runs once)
    useEffect(() => {
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
            } catch (error) { dispatch({ type: 'SET_ERROR', payload: `Could not initialize app: ${error.message}.` }); }
        };
        fetchInitialData();
    }, []);

    // --- UNCHANGED ---
    // Effect to combine API data with custom data
    useEffect(() => {
        const combineData = () => {
            const battleOnlyFormNames = new Set();
            Object.values(officialFormsData).forEach(formsArray => {
                formsArray.forEach(form => {
                    if (form.changeMethod === 'BATTLE' || form.triggerAbility) {
                        battleOnlyFormNames.add(form.formName);
                    }
                });
            });
            const officialPokemonNames = state.pokemonList.filter(p => !battleOnlyFormNames.has(p));
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

            dispatch({
                type: 'SET_COMBINED_LISTS', payload: {
                    pokemon: combinedPokemon,
                    items: combinedItems,
                    moves: combinedMoves,
                    abilities: combinedAbilities,
                }
            });
        };
        combineData();
    }, [state.pokemonList, state.itemList, state.moveList, state.abilityList, state.customPokemon, state.customMoves, state.customAbilities]);

    // --- NEW ---
    // Function to handle creating a new campaign
    const handleCreateCampaign = async (e) => {
        e.preventDefault();
        if (!newCampaignName.trim() || !state.user?.uid) return;
        dispatch({ type: 'SET_LOADING', payload: 'Creating Campaign...' });
        try {
            const campaignsRef = collection(db, 'campaigns');
            const newCampaign = {
                name: newCampaignName,
                ownerId: state.user.uid,
                createdAt: serverTimestamp(),
                members: [],
                defaultPermissions: {
                    canViewRoster: true,
                    canViewBox: true,
                    canViewBag: true,
                    canEditNicknames: true,
                    canLevelUp: false,
                    canChangeMovesets: false,
                    canUseItems: true,
                    canOrganizeBox: true,
                    canRenameBoxes: true,
                    partyLevel: 5,
                }
            };
            const docRef = await addDoc(campaignsRef, newCampaign);
            dispatch({ type: 'SELECT_CAMPAIGN', payload: docRef.id }); // Automatically select the new campaign
            setNewCampaignName('');
        } catch (error) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to create campaign: ${error.message}` });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: null });
        }
    };

    const renderView = () => {
        switch (state.view) {
            case 'CAMPAIGN_DASHBOARD':
                return <CampaignDashboard campaigns={state.campaigns} dispatch={dispatch} user={state.user} />;
            case 'TRAINER_VIEW':
                return <TrainerView />;

            case 'TRAINER_MANAGER':
                // Add a check here to ensure a campaign is selected before rendering
                if (!state.selectedCampaignId) {
                    // If not, redirect back to the dashboard
                    dispatch({ type: 'SET_VIEW', payload: 'CAMPAIGN_DASHBOARD' });
                    return null;
                }
                return <TrainerManager />;
            case 'BATTLE_SETUP':
                return <BattleSetup state={state} dispatch={dispatch} />;
            default:
                // Default to the dashboard
                return <CampaignDashboard campaigns={state.campaigns} dispatch={dispatch} user={state.user} />;
        }
    };

    const selectedCampaign = state.campaigns.find(c => c.id === state.selectedCampaignId);

    const contextValue = {
        state,
        dispatch,
        selectedCampaign // <-- Add this line
    };
    return (
        <ManagerContext.Provider value={contextValue}>
            <div className="bg-gray-900 text-white min-h-screen font-sans">
                {/* Header for campaign selection and user actions */}
                <header className="bg-gray-800/50 backdrop-blur-sm sticky top-0 z-40 p-4 shadow-lg border-b border-gray-700">
                    <div className="max-w-7xl mx-auto flex justify-between items-center">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-bold text-indigo-400 truncate">Pokémon DnD Suite</h1>
                            <p className="text-xs text-gray-400 truncate">Signed in as {state.user?.displayName || state.user?.email}</p>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                            {/* --- ADD THIS BUTTON --- */}
                            {state.view !== 'CAMPAIGN_DASHBOARD' && (
                                <button
                                    onClick={() => dispatch({ type: 'SET_VIEW', payload: 'CAMPAIGN_DASHBOARD' })}
                                    className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md text-sm"
                                >
                                    &larr; Back to Dashboard
                                </button>
                            )}
                            <button onClick={() => dispatch({ type: 'SIGN_OUT' })} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md text-sm">
                                Logout
                            </button>
                        </div>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="p-4 md:p-8 max-w-7xl mx-auto">
                    <div className={`fixed inset-0 bg-black bg-opacity-70 flex flex-col justify-center items-center z-50 p-4 transition-opacity duration-300 ${state.loading || state.error ? 'flex' : 'hidden opacity-0'}`}>
                        {state.loading && (<><div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-500"></div><p className="text-xl mt-4">{state.loading}</p></>)}
                        {state.error && (<div className="bg-red-800 border border-red-600 text-white p-6 rounded-lg max-w-lg text-center shadow-2xl"><h2 className="text-2xl font-bold mb-4">An Error Occurred</h2><p className="text-left whitespace-pre-wrap">{state.error}</p><button onClick={() => dispatch({ type: 'DISMISS_ERROR' })} className="mt-6 bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded">Dismiss</button></div>)}
                    </div>
                    <div className={`transition-opacity duration-300 ${state.loading ? 'opacity-20' : 'opacity-100'}`}>
                        {/* Campaign Creation Form */}
                        <div className="mb-8 p-6 bg-gray-800/60 rounded-lg shadow-md">
                            <h2 className="text-2xl font-semibold mb-4 border-b border-gray-600 pb-2">My Campaigns</h2>
                            <form onSubmit={handleCreateCampaign} className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                <input type="text" value={newCampaignName} onChange={e => setNewCampaignName(e.target.value)} placeholder="New Campaign Name" className="flex-grow bg-gray-900 p-2 rounded-md border border-gray-600" />
                                <button type="submit" className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md font-semibold text-lg">Create Campaign</button>
                            </form>
                        </div>

                        {renderView()}
                    </div>
                </main>
            </div>
        </ManagerContext.Provider>
    );
}

export default ManagerApp;