import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// --- Firebase Configuration ---
// IMPORTANT: Replace this with the firebaseConfig object from your own Firebase project!
const firebaseConfig = {
    apiKey: "AIzaSyAr2e1UT4EFrYkuE8sK_QY4Djr1eo3lsm0",
    authDomain: "pokemon-dnd-manager.firebaseapp.com",
    projectId: "pokemon-dnd-manager",
    storageBucket: "pokemon-dnd-manager.appspot.com",
    messagingSenderId: "885061294915",
    appId: "1:885061294915:web:9f4039571f554422216df6",
    measurementId: "G-57QV1DRN7G"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = firebaseConfig.projectId;