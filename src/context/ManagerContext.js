import { createContext, useContext } from 'react';

export const ManagerContext = createContext(null);

export const useManagerContext = () => {
    const context = useContext(ManagerContext);
    if (!context) {
        throw new Error("useManagerContext must be used within a ManagerProvider");
    }
    return context;
};