// src/utils/firebaseUtils.js
import { collection, doc, writeBatch, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const SUBCOLLECTIONS = ['trainers', 'custom-pokemon', 'custom-moves', 'custom-abilities'];

export const deleteCampaignAndSubcollections = async (campaignId) => {
    if (!campaignId) throw new Error("Campaign ID is required.");

    const campaignRef = doc(db, 'campaigns', campaignId);

    // Recursively delete all documents in all known subcollections
    for (const subcollection of SUBCOLLECTIONS) {
        const subcollectionRef = collection(db, 'campaigns', campaignId, subcollection);
        const snapshot = await getDocs(subcollectionRef);
        
        // Use a batch to delete all documents in the subcollection efficiently
        if (!snapshot.empty) {
            const batch = writeBatch(db);
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
    }

    // After all subcollections are empty, delete the main campaign document
    await deleteDoc(campaignRef);
};