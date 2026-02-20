import React from 'react';

export function Stamp({ status, size = 'md', isWon: forcedIsWon }) {
    // Priority: forcedIsWon prop > status === 'WON'
    const isWon = forcedIsWon !== undefined ? forcedIsWon : status === 'WON';
    const color = isWon ? '#059669' : '#dc2626';
    const subText = isWon ? 'TAKE PROFIT' : 'LIQUIDATED';

    const sizes = {
        sm: {
            border: 'border-[3px]',
            padding: 'p-1 px-3',
            rounded: 'rounded-lg',
            text: 'text-sm font-black',
            subText: 'hidden',
            rotate: '-rotate-12'
        },
        md: {
            border: 'border-[4px]',
            padding: 'p-2 px-5',
            rounded: 'rounded-xl',
            text: 'text-2xl font-black',
            subText: 'text-[10px] font-bold',
            rotate: '-rotate-[15deg]'
        },
        lg: {
            border: 'border-[6px]',
            padding: 'p-3 px-8',
            rounded: 'rounded-xl',
            text: 'text-5xl font-black',
            subText: 'text-xl font-black mb-1',
            rotate: '-rotate-[15deg]'
        }
    };

    const s = sizes[size] || sizes.md;

    return (
        <div className={`transform ${s.rotate} ${s.border} border-double ${s.padding} ${s.rounded} inline-block relative overflow-hidden transition-all hover:scale-105 active:scale-95`}
            style={{
                borderColor: color,
                color: color,
                backgroundColor: `${color}05`,
                boxShadow: `0 0 0 2px #f8f8f8 inset, 0 8px 24px -8px ${color}44`
            }}
        >
            <div className="flex flex-col items-center leading-none uppercase tracking-tighter">
                {size === 'lg' && <span className={s.subText}>STAMPED</span>}
                <span className={s.text}>{subText}</span>
                {size === 'md' && <span className={s.subText}>{status}</span>}
            </div>

            <div className="absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-multiply"
                style={{
                    backgroundImage: 'url("https://www.transparenttextures.com/patterns/stardust.png")',
                }}
            />
        </div>
    );
};
