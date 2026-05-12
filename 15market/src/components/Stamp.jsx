import React from 'react';

export function Stamp({ status, size = 'md', isWon: forcedIsWon }) {
    // Priority: forcedIsWon prop > status check (case-insensitive)
    const isWon = forcedIsWon !== undefined 
        ? forcedIsWon 
        : (status?.toUpperCase() === 'WON' || status?.toUpperCase() === 'SUCCESS');
    const color = isWon ? '#3CB371' : '#dc2626'; // Green for WON, Red for LOST
    const text = isWon ? 'WON' : 'LOST';

    const sizes = {
        sm: {
            container: 'w-16 h-16',
            rotate: '-rotate-[15deg]',
            textSize: '1.2rem'
        },
        md: {
            container: 'w-24 h-24',
            rotate: '-rotate-[15deg]',
            textSize: '1.8rem'
        },
        lg: {
            container: 'w-48 h-48',
            rotate: '-rotate-[15deg]',
            textSize: '4rem'
        }
    };

    const s = sizes[size] || sizes.md;

    return (
        <div 
            className={`relative flex items-center justify-center ${s.container} ${s.rotate} select-none pointer-events-none`}
            style={{ color: color }}
        >
            <div 
                className="absolute inset-0 w-full h-full opacity-90"
                style={{
                    maskImage: 'url("https://www.transparenttextures.com/patterns/stardust.png")',
                    WebkitMaskImage: 'url("https://www.transparenttextures.com/patterns/stardust.png")',
                    maskSize: '150px 150px',
                    WebkitMaskSize: '150px 150px',
                }}
            >
                <svg className="w-full h-full" viewBox="0 0 100 100">
                    {/* Outer thin ring */}
                    <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1" />
                    
                    {/* Thick dashed/distressed ring */}
                    <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="4" />
                    
                    {/* Inner thin ring */}
                    <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="0.5" />
                    
                    {/* Top Star */}
                    <polygon points="50,11 51.5,15.5 56.5,15.5 52.5,18.5 54,23 50,20 46,23 47.5,18.5 43.5,15.5 48.5,15.5" fill="currentColor" />
                    
                    {/* Bottom Star */}
                    <polygon points="50,77 51.5,81.5 56.5,81.5 52.5,84.5 54,89 50,86 46,89 47.5,84.5 43.5,81.5 48.5,81.5" fill="currentColor" />
                </svg>
            </div>
            
            <div 
                className="absolute inset-0 w-full h-full opacity-60 mix-blend-multiply"
                style={{
                    backgroundImage: 'url("https://www.transparenttextures.com/patterns/dust.png")',
                }}
            />

            <span 
                className="font-black uppercase tracking-tight z-10" 
                style={{ 
                    fontSize: s.textSize, 
                    lineHeight: 1,
                    textShadow: `0 0 1px ${color}`,
                    // Removed maskImage here to ensure text is always visible even if texture fails
                }}
            >
                {text}
            </span>
        </div>
    );
};
