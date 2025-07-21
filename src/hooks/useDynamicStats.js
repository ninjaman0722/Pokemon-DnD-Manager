import { useMemo } from 'react';
import { useManagerContext } from '../context/ManagerContext';
import { calculateStat } from '../utils/api';

export const useDynamicStats = (pokemon, trainerCategory) => {
    const { selectedCampaign } = useManagerContext();
    const { partyLevel } = selectedCampaign || {};

    // useMemo will recalculate stats only when pokemon, category, or partyLevel changes
    return useMemo(() => {
        if (!pokemon?.baseStats) {
            return { hp: 0, attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 };
        }

        // Determine the effective level
        const effectiveLevel = trainerCategory === 'partyMembers' ? (partyLevel || pokemon.level) : pokemon.level;

        const stats = {
            hp: calculateStat(pokemon.baseStats.hp, effectiveLevel, true),
            attack: calculateStat(pokemon.baseStats.attack, effectiveLevel),
            defense: calculateStat(pokemon.baseStats.defense, effectiveLevel),
            'special-attack': calculateStat(pokemon.baseStats['special-attack'], effectiveLevel),
            'special-defense': calculateStat(pokemon.baseStats['special-defense'], effectiveLevel),
            speed: calculateStat(pokemon.baseStats.speed, effectiveLevel),
        };

        return stats;

    }, [pokemon, trainerCategory, partyLevel]);
};