// src/SimulatorApp.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db, appId } from './config/firebase';
import BattleScreen from './components/simulator/BattleScreen';
import BattleIdInput from './components/simulator/BattleIdInput';

function SimulatorApp() {
    const [appState, setAppState] = useState('INITIALIZING');
    const [battleState, setBattleState] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [battleId, setBattleId] = useState(null);
    const [allTrainers, setAllTrainers] = useState(null);
    const unsubscribes = useRef([]);
    const location = useLocation();

    // This useEffect hook handles all startup logic
    useEffect(() => {
        const startup = async () => {
            if (!auth || !db) {
                setErrorMessage('Firebase could not be initialized.');
                setAppState('ERROR');
                return;
            }
            try {
                setAppState('AUTHENTICATING');
                if (!auth.currentUser) {
                    await signInAnonymously(auth);
                }
                setAppState('LOADING_TRAINERS');
                const trainersCollectionRef = collection(db, `artifacts/${appId}/public/data/trainers`);
                const trainerSnapshot = await getDocs(trainersCollectionRef);
                const trainerList = trainerSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                setAllTrainers(trainerList);

                const params = new URLSearchParams(location.search);
                const idFromUrl = params.get('battleId');
                if (idFromUrl) {
                    setBattleId(idFromUrl);
                } else {
                    setAppState('NO_BATTLE_ID');
                }
            } catch (err) {
                setErrorMessage(`An unexpected error occurred: ${err.message}`);
                setAppState('ERROR');
            }
        };

        const unsubAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                startup(); // Run startup logic once we have a user
                unsubAuth(); // Unsubscribe from auth listener after we're done
            }
        });
        unsubscribes.current.push(unsubAuth);
        return () => {
            unsubscribes.current.forEach(unsub => unsub());
        };
    }, [location.search]);

    // This useEffect hook listens for changes to the battle document
    useEffect(() => {
        if (!battleId || !db) return;

        setAppState('LOADING_BATTLE');
        const battleDocRef = doc(db, `artifacts/${appId}/public/data/battles`, battleId);
        const unsubBattle = onSnapshot(battleDocRef, (doc) => {
            if (doc.exists()) {
                setBattleState(doc.data());
                setAppState('READY');
            } else {
                setErrorMessage(`Battle with ID "${battleId}" not found.`);
                setAppState('ERROR');
            }
        }, (err) => {
            setErrorMessage(`Error fetching battle data: ${err.message}`);
            setAppState('ERROR');
        });
        unsubscribes.current.push(unsubBattle);
    }, [battleId]);

    const handleBattleIdSubmit = (id) => {
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('battleId', id);
        window.history.pushState({}, '', newUrl);
        setBattleId(id);
    };

    const handleReset = () => { window.location.search = ''; };

    if (appState === 'NO_BATTLE_ID') {
        return <BattleIdInput onBattleIdSubmit={handleBattleIdSubmit} />;
    }

    if (appState === 'READY' && battleState) {
        return <BattleScreen battleState={battleState} battleId={battleId} allTrainers={allTrainers} />;
    }

    if (appState === 'ERROR') {
        return (
            <div className="bg-gray-900 text-white min-h-screen flex justify-center items-center p-4">
                <div className="bg-red-800 border border-red-600 text-white p-6 rounded-lg max-w-lg text-center shadow-2xl">
                    <h2 className="text-2xl font-bold mb-4">Error</h2>
                    <p className="text-left whitespace-pre-wrap">{errorMessage}</p>
                    <button onClick={handleReset} className="mt-4 bg-indigo-500 px-4 py-2 rounded">Try Again</button>
                </div>
            </div>
        );
    }

    const loadingMessages = {
        INITIALIZING: 'Initializing...',
        AUTHENTICATING: 'Authenticating...',
        LOADING_TRAINERS: 'Loading Trainers...',
        LOADING_BATTLE: 'Loading Battle...'
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen flex flex-col justify-center items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-500"></div>
            <p className="text-xl mt-4">{loadingMessages[appState] || 'Loading...'}</p>
        </div>
    );
}

export default SimulatorApp;