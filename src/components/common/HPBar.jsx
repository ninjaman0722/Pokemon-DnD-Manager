import React from 'react';

const HPBar = ({ currentHp, maxHp, showText, className }) => {
    const percentage = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;
    let barColor = 'bg-green-500';
    if (percentage < 50) barColor = 'bg-yellow-500';
    if (percentage < 20) barColor = 'bg-red-500';

    return (
        <div className="flex items-center gap-2">
            {/* The visual bar */}
            <div
                className={`w-full bg-gray-700 rounded-full h-2.5 ${className}`}
                // ARIA attributes for accessibility
                role="progressbar"
                aria-valuenow={currentHp}
                aria-valuemin="0"
                aria-valuemax={maxHp}
                aria-valuetext={`${currentHp} of ${maxHp} HP remaining`}
            >
                <div
                    className={`h-full rounded-full ${barColor} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            {/* Optional text display */}
            {showText && (
                <span className="text-xs font-mono text-gray-400 whitespace-nowrap">
                    {currentHp} / {maxHp}
                </span>
            )}
        </div>
    );
};

export default HPBar;