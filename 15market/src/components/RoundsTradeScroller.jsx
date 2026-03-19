import React, { useEffect, useState, useRef, memo, useMemo, useCallback } from 'react';
const { KEEPER_URL_ROUNDS = 'http://localhost:3011' } = {}; // Using default local for now
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, ArrowUp, ArrowDown, Check, X } from 'lucide-react';

function RoundsTradeScrollerComponent({ theme }) {
    const [history, setHistory] = useState([]);
    const [activeBroadcast, setActiveBroadcast] = useState(null);

    const isLight = theme === 'light';
    const WIN_COLOR = "#3CB371"; 
    const LOSS_COLOR = "#FF7F50"; 

    const fetchRoundsData = useCallback(async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ROUNDS}/history`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setHistory(data.slice(0, 40));
                }
            }
        } catch (err) {
            console.error("Rounds Scroller Sync Error:", err);
        }
    }, []);

    useEffect(() => {
        fetchRoundsData();
        const interval = setInterval(fetchRoundsData, 5000);
        return () => clearInterval(interval);
    }, []);

    const repeatedHistory = useMemo(() => {
        if (!history || history.length === 0) return [];
        let list = [...history];
        while (list.length < 30) { list = [...list, ...history]; }
        return [...list, ...list];
    }, [history]);

    if (history.length === 0) return null;

    return (
        <div className={`w-full h-8 lg:h-10 border-y relative z-[45] overflow-hidden transition-all duration-500 ${isLight ? 'bg-white/95 border-black/5' : 'bg-[#0d0d0d]/80 border-white/5 backdrop-blur-md'}`}>
            <motion.div className="flex items-center h-full">
                <motion.div
                    animate={{ x: [0, -1500] }}
                    transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
                    className="flex items-center h-full whitespace-nowrap"
                >
                    {repeatedHistory.map((event, i) => {
                        const isWon = event.status === "WON";
                        const color = isWon ? WIN_COLOR : LOSS_COLOR;
                        const isUp = event.settlePrice > event.lockPrice;

                        return (
                            <div key={`${event.id}-${i}`} className="flex items-center gap-4 px-6 border-r border-white/10 h-full">
                                <span className="text-[8px] font-black bg-white/10 px-1 rounded text-white/40">ROUND</span>
                                <div className="flex items-center gap-2">
                                    <div className="p-0.5 rounded-sm bg-white/5">
                                        {isUp ? <ArrowUp size={8} className="text-[#3CB371]" /> : <ArrowDown size={8} className="text-[#FF7F50]" />}
                                    </div>
                                    <span className={`text-[9px] font-bold uppercase tracking-widest ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                                        {event.symbol.replace('USDT', '')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="px-1.5 py-0.5 text-[7px] rounded-sm font-black uppercase tracking-wider flex items-center gap-1 shadow-sm"
                                        style={{ backgroundColor: `${color}25`, color, border: `1px solid ${color}40` }}>
                                        {isWon ? <Check size={7} /> : <X size={7} />}
                                        {event.status}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </motion.div>
            </motion.div>
        </div>
    );
}

export const RoundsTradeScroller = memo(RoundsTradeScrollerComponent);
