import React from 'react';

const TeamSidebar = ({ team, side }) => (
    <div className={`absolute ${side === 'left' ? 'left-2' : 'right-2'} top-1/2 -translate-y-1/2 bg-gray-900/50 p-2 rounded-lg space-y-2`}>
        {team.pokemon.map(p => (
            <div key={p.id} className={`p-1 rounded-md flex items-center transition-all ${p.fainted ? 'opacity-40' : ''}`}>
<img 
    src={p.isShiny ? (p.shinySprite || p.sprite) : p.sprite} 
    alt={p.name} 
    className="w-10 h-10" 
/>
            </div>
        ))}
    </div>
);

export default TeamSidebar;