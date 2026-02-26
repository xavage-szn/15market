import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

export function OrderBook({ price, theme = 'dark', symbol = 'USDC' }) {
    const [asks, setAsks] = useState([]);
    const [bids, setBids] = useState([]);

    // Colors
    const isDark = theme !== 'light';
    const RED = "#FF4444";
    const GREEN = "#3CB371";
    const GREEN_BG = "rgba(60, 179, 113, 0.15)";
    const RED_BG = "rgba(255, 68, 68, 0.15)";

    // Generate simulated depth
    useEffect(() => {
        if (!price || parseFloat(price) <= 0) return;
        const basePrice = parseFloat(price);

        const generateLevel = (base, spread, count, type) => {
            return Array.from({ length: count }).map((_, i) => {
                const p = type === 'ask'
                    ? base * (1 + (spread * (i + 1)))
                    : base * (1 - (spread * (i + 1)));
                const size = (Math.random() * 1000).toFixed(2);
                const total = (p * parseFloat(size)).toFixed(2);
                return {
                    price: p.toFixed(4),
                    size,
                    total,
                    depth: Math.random() * 100 // % width of bar
                };
            });
        };

        const newAsks = generateLevel(basePrice, 0.0005, 8, 'ask').reverse(); // Lowest ask at bottom
        const newBids = generateLevel(basePrice, 0.0005, 8, 'bid'); // Highest bid at top

        setAsks(newAsks);
        setBids(newBids);
    }, [price]);

    return (
        <div className={`w-full h-full flex flex-col font-mono text-[10px] lg:text-xs overflow-hidden rounded-xl transition-colors duration-300 ${isDark ? 'text-white/80' : 'text-[#1A3026]'}`}>
            <div className={`flex items-center justify-between px-3 py-2 border-b ${isDark ? 'border-white/5 opacity-60' : 'border-[#3CB371]/10 text-[#3D5A4C]/50'} text-[9px] uppercase tracking-wider font-bold`}>
                <span>Price ({symbol})</span>
                <span>Size</span>
            </div>

            {/* Asks (Sells) - Red */}
            <div className="flex-1 overflow-hidden flex flex-col justify-end gap-[1px]">
                {asks.map((ask, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-0.5 relative group cursor-pointer hover:bg-white/5 transition-colors">
                        <div
                            className="absolute right-0 top-0 bottom-0 pointer-events-none transition-all duration-300"
                            style={{
                                width: `${ask.depth}%`,
                                backgroundColor: RED_BG,
                                opacity: 0.6
                            }}
                        />
                        <span style={{ color: RED }} className="relative z-10 font-bold">{ask.price}</span>
                        <span className="relative z-10 opacity-70">{ask.size}</span>
                    </div>
                ))}
            </div>

            {/* Spread / Current Price Indicator */}
            <div className={`my-1 py-1 px-3 flex items-center justify-between border-y backdrop-blur-sm relative z-20 ${isDark ? 'bg-white/5 border-white/5' : 'bg-black/5 border-[#3CB371]/10'}`}>
                <div className={`text-sm lg:text-base font-black tracking-tight flex items-center gap-2`}
                    style={{ color: parseFloat(price) > parseFloat(bids[0]?.price || 0) ? GREEN : RED }}>
                    {parseFloat(price).toFixed(4)}
                    {parseFloat(price) > parseFloat(bids[0]?.price || 0)
                        ? <ArrowUp size={12} strokeWidth={3} />
                        : <ArrowDown size={12} strokeWidth={3} />
                    }
                </div>
                <div className="text-[9px] opacity-40 uppercase font-bold tracking-widest">
                    Spread 0.02%
                </div>
            </div>

            {/* Bids (Buys) - Green */}
            <div className="flex-1 overflow-hidden flex flex-col justify-start gap-[1px]">
                {bids.map((bid, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-0.5 relative group cursor-pointer hover:bg-white/5 transition-colors">
                        <div
                            className="absolute right-0 top-0 bottom-0 pointer-events-none transition-all duration-300"
                            style={{
                                width: `${bid.depth}%`,
                                backgroundColor: GREEN_BG,
                                opacity: 0.6
                            }}
                        />
                        <span style={{ color: GREEN }} className="relative z-10 font-bold">{bid.price}</span>
                        <span className="relative z-10 opacity-70">{bid.size}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
