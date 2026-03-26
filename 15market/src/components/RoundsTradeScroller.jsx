import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KEEPER_URL_ARC, KEEPER_URL_ROUNDS } from '../constants';
import { Radio, ArrowUp, ArrowDown, Check, X } from 'lucide-react';

function RoundsTradeScrollerComponent({ theme, isV1 = false }) {
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

        const fetchBroadcast = async () => {
            try {
                // 1. Check Maintenance Mode Local Cache
                const settingsSaved = localStorage.getItem('15market_citadel_settings');
                if (settingsSaved) {
                    const settings = JSON.parse(settingsSaved);
                    if (settings.maintenanceMode) {
                        setActiveBroadcast({
                            id: 'maintenance-mode',
                            type: 'MAINTENANCE',
                            text: 'SYSTEM UNDER MAINTENANCE — TRADING OPERATIONS SUSPENDED',
                            expiry: Date.now() + 99999999
                        });
                        return;
                    }
                }

                // 2. Fetch Live Global Broadcast
                const res = await fetch(`${KEEPER_URL_ARC}/broadcast`);
                if (res.ok) {
                    const b = await res.json();
                    if (b && b.text && b.expiry > Date.now()) {
                        setActiveBroadcast(b);
                    } else {
                        setActiveBroadcast(null);
                    }
                } else {
                    setActiveBroadcast(null);
                }
            } catch (e) { setActiveBroadcast(null); }
        };

        fetchBroadcast();
        const bInterval = setInterval(fetchBroadcast, 5000);

        return () => {
            clearInterval(interval);
            clearInterval(bInterval);
        };
    }, []);

    const repeatedHistory = useMemo(() => {
        if (!history || history.length === 0) return [];
        let list = [...history];
        while (list.length < 30) { list = [...list, ...history]; }
        return [...list, ...list];
    }, [history]);

    if (history.length === 0) return null;

    const v1Bg = isLight ? 'bg-gradient-to-r from-[#3CB371]/5 via-[#3CB371]/10 to-[#3CB371]/5 border-[#3CB371]/20' : 'bg-gradient-to-r from-[#0d0d0d] via-[#1a1a1a] to-[#0d0d0d] border-white/5';
    const v2Bg = isLight ? 'bg-gradient-to-b from-[#3CB371] to-[#2E8B57] zigzag-ticker' : 'bg-gradient-to-b from-[#0a0a0a] to-[#050505] zigzag-ticker zigzag-outline';

    return (
        <div className={`w-full ${isV1 ? 'h-10 lg:h-12 border-y-2 ' + v1Bg : 'h-10 lg:h-12 ' + v2Bg} relative z-[45] overflow-hidden transition-all duration-500`}>
            <AnimatePresence mode="wait">
                {activeBroadcast ? (
                    <motion.div
                        key="broadcast"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`absolute inset-0 flex items-center ${isV1 ? 'bg-amber-500/10' : (isLight ? 'bg-[#3CB371]' : 'bg-[#0a0a0a]')}`}
                    >
                        <motion.div
                            animate={{ x: [0, -1000] }}
                            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                            className="flex items-center gap-10 whitespace-nowrap px-10"
                        >
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Radio size={12} className={`${isV1 ? 'text-amber-500 animate-pulse' : 'text-white animate-pulse'}`} />
                                    <span className={`text-[10px] uppercase tracking-[0.2em] ${isV1 ? 'text-amber-500' : 'text-white'}`}>
                                        {activeBroadcast.text}
                                    </span>
                                </div>
                            ))}
                        </motion.div>
                    </motion.div>
                ) : (
                    <motion.div key="ticker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center h-full">
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
                                    <div key={`${event.id}-${i}`} className={`flex items-center gap-6 ${isV1 ? 'px-10 border-r-2' : 'px-12 border-r'} border-white/10 h-full transition-all`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1 rounded bg-white/10`}>
                                                {isUp ? <ArrowUp size={isV1 ? 10 : 12} className="text-white" /> : <ArrowDown size={isV1 ? 10 : 12} className="text-white" />}
                                            </div>
                                            <div className="flex flex-col leading-none">
                                                <span className="text-[7px] font-black text-white/40 uppercase tracking-tighter mb-0.5">ROUND</span>
                                                <span className={`${isV1 ? 'text-[10px]' : 'text-[11px]'} font-black uppercase tracking-[0.2em] text-white`}>
                                                    {event.symbol.replace('USDT', '')}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col items-start leading-tight">
                                                <span className={`${isV1 ? 'text-[8px]' : 'text-[9px]'} font-black tracking-[0.2em] text-white/50`}>STAKE</span>
                                                <span className={`${isV1 ? 'text-[9px]' : 'text-[10px]'} font-black text-white font-mono`}>${event.amount || '1.00'}</span>
                                            </div>
                                            <div className="h-6 w-px bg-white/10" />
                                            <div className="flex items-center gap-2">
                                                {isWon ? <Check size={isV1 ? 10 : 12} className="text-white" /> : <X size={isV1 ? 10 : 12} className="text-white/60" />}
                                                <span className={`${isV1 ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest text-white`}>
                                                    {event.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export const RoundsTradeScroller = memo(RoundsTradeScrollerComponent);
