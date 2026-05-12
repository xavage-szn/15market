import React from 'react';

export function Stamp({ status, size = 'md', isWon: forcedIsWon }) {
    // Priority: forcedIsWon prop > status check (case-insensitive)
    const isWon = forcedIsWon !== undefined 
        ? forcedIsWon 
        : (status?.toUpperCase() === 'WON' || status?.toUpperCase() === 'SUCCESS');
        
    const imgSrc = isWon ? '/won_stamp.png' : '/lost_stamp.png';

    const sizes = {
        sm: {
            container: 'w-16 h-16',
            rotate: '-rotate-[15deg]',
        },
        md: {
            container: 'w-24 h-24',
            rotate: '-rotate-[15deg]',
        },
        lg: {
            container: 'w-48 h-48',
            rotate: '-rotate-[15deg]',
        }
    };

    const s = sizes[size] || sizes.md;

    return (
        <div 
            className={`relative flex items-center justify-center ${s.container} ${s.rotate} select-none pointer-events-none`}
        >
            <img 
                src={imgSrc} 
                alt={isWon ? "WON" : "LOST"} 
                className="w-full h-full object-contain opacity-95 drop-shadow-sm"
            />
        </div>
    );
};
