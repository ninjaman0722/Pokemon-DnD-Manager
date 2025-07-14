import React from 'react';

const HPBar = ({ currentHp, maxHp, className }) => {
    const percentage = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;
    let barColor = 'bg-green-500';
    if (percentage < 50) barColor = 'bg-yellow-500';
    if (percentage < 20) barColor = 'bg-red-500';

    return (
        <div className={`w-full bg-gray-700 rounded-full h-2.5 ${className}`}>
            <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${percentage}%` }} />
        </div>
    );
};

export default HPBar;