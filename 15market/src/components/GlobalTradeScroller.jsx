import React, { useEffect, useState, useRef, memo, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';

function GlobalTradeScrollerComponent({ theme }) {
    const [history, setHistory] = useState(() => {
        try {
            const saved = localStorage.getItem("15market_global_history_v2");
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });
    const [profiles, setProfiles] = useState({});
    const [activeBroadcast, setActiveBroadcast] = useState(null);
    const lastFetchRef = useRef(0);

    const truncate = (str) => str ? `${str.slice(0, 4)}...${str.slice(-4)}` : "";

    const fetchGlobalData = useCallback(async () => {
        try {
            const arcRes = await fetch(`${KEEPER_URL_ARC}/history`);
            if (arcRes.ok) {
                const arcData = await arcRes.json();
                if (Array.isArray(arcData)) {
                    arcData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    const finalHistory = arcData.slice(0, 100);

                    // Only update if history actually changed
                    const newJson = JSON.stringify(finalHistory.map(h => h.id));
                    const oldJson = JSON.stringify(history.map(h => h.id));
                    if (newJson !== oldJson) {
                        setHistory(finalHistory);
                        localStorage.setItem("15market_global_history_v2", JSON.stringify(finalHistory));
                    }

                    // Update Profiles
                    let updatedProfiles = { ...profiles };
                    const ownersToFetch = Array.from(new Set(finalHistory.map(item => item.owner)))
                        .filter(owner => owner && !updatedProfiles[owner]);

                    if (ownersToFetch.length > 0) {
                        await Promise.all(ownersToFetch.map(async (owner) => {
                            try {
                                const keeperRes = await fetch(`${KEEPER_URL_ARC}/profile?address=${owner}`);
                                if (keeperRes.ok) {
                                    const keeperData = await keeperRes.json();
                                    if (keeperData && keeperData.username) {
                                        updatedProfiles[owner] = keeperData;
                                        return;
                                    }
                                }
                                updatedProfiles[owner] = { username: truncate(owner) };
                            } catch (e) {
                                updatedProfiles[owner] = { username: truncate(owner) };
                            }
                        }));
                        setProfiles(prev => ({ ...prev, ...updatedProfiles }));
                    }
                }
            }
            lastFetchRef.current = Date.now();
        } catch (err) {
            console.error("Global Scroller Sync Error:", err);
        }
    }, []); // No deps to prevent re-creating, uses refs

    useEffect(() => {
        fetchGlobalData();
        // REAL-TIME: Poll every 2 seconds for near-instant scroller updates
        const interval = setInterval(fetchGlobalData, 2000);

        const checkBroadcast = () => {
            try {
                const settingsSaved = localStorage.getItem('15market_citadel_settings');
                if (settingsSaved) {
                    const settings = JSON.parse(settingsSaved);
                    if (settings.maintenanceMode) {
                        setActiveBroadcast({
                            id: 'maintenance-mode',
                            type: 'MAINTENANCE',
                            text: 'UNDER MAINTENANCE - TRADING OPERATIONS SUSPENDED',
                            expiry: Date.now() + 99999999
                        });
                        return;
                    }
                }
            } catch (e) { setActiveBroadcast(null); }
        };

        checkBroadcast();
        const bInterval = setInterval(checkBroadcast, 2000);

        return () => {
            clearInterval(interval);
            clearInterval(bInterval);
        };
    }, []);

    // OPTIMIZED: Ghost Trades (Simulated Momentum) to keep the UI alive if real history is empty
    const ghostTrades = useMemo(() => {
        const symbols = ["ETH", "BTC", "SOL", "MON", "JUP", "XRP"];
        const names = ["Momentum_Bot", "Pulse_Trader", "ZeroX_Alpha", "Arc_Liquid", "Sonic_Execution", "Crypto_Whale"];
        return Array.from({ length: 10 }).map((_, i) => ({
            id: `ghost-${i}`,
            owner: "0x0000000000000000000000000000000000000000",
            username: names[i % names.length],
            amount: (Math.random() * 2 + 0.5).toFixed(2),
            symbol: symbols[i % symbols.length],
            direction: Math.random() > 0.5 ? "UP" : "DOWN",
            status: Math.random() > 0.5 ? "WON" : "LOST",
            timestamp: Date.now() - (i * 10000),
            isGhost: true
        }));
    }, []);

    const mergedHistory = useMemo(() => {
        // Only use backend history as source
        const filtered = history.filter(t => ["WON", "LOST"].includes(t.status));

        // If no real history, use ghost trades to keep the 'Live' feel
        if (filtered.length === 0) return ghostTrades;

        // Sort by timestamp descending
        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return filtered.slice(0, 100);
    }, [history, ghostTrades]);

    const repeatedHistory = useMemo(() => {
        if (!mergedHistory || mergedHistory.length === 0) return [];
        let list = [...mergedHistory];
        // Ensure at least 40 items for smooth infinite scroll
        while (list.length < 40) { list = [...list, ...mergedHistory]; }
        return [...list, ...list];
    }, [mergedHistory]);

    const isLight = theme === 'light';

    return (
        <div
            className={`w-full h-10 lg:h-12 flex items-center overflow-hidden relative transition-all duration-500 rounded-none z-[40] ${isLight
                ? 'border-y-2 border-[#3CB371]/20 shadow-[0_0_15px_rgba(60,179,113,0.1)] bg-[#EEF9F1]'
                : 'border-y border-white/5 bg-transparent'
                }`}
            style={{
                boxShadow: isLight ? '0 0 20px rgba(60, 179, 113, 0.1)' : `0 0 15px #3CB37115, inset 0 0 10px #3CB37110`
            }}
        >            <div
            className="flex-1 h-full flex items-center relative overflow-hidden"
            style={{
                maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
                WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)'
            }}
        >
                <AnimatePresence mode="wait">
                    {activeBroadcast && (
                        <motion.div
                            key={`broadcast-${activeBroadcast.id}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`absolute inset-0 flex items-center z-40 ${isLight ? 'bg-[#FFF8E7]/90 backdrop-blur-md' : 'bg-[#050505]/95 backdrop-blur-md'}`}
                        >
                            <motion.div
                                className="flex items-center gap-24 whitespace-nowrap pl-24 lg:pl-32"
                                animate={{ x: ["0%", "-50%"] }}
                                transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
                            >
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-4 lg:gap-6">
                                        <div className={`flex items-center gap-2 px-2 py-0.5 rounded-full text-[8px] lg:text-[9px] font-black uppercase tracking-widest bg-[#3CB371] text-white`}>
                                            <Radio size={10} className="animate-pulse" />
                                            {activeBroadcast.type}
                                        </div>
                                        <span className={`text-xs lg:text-sm font-black uppercase tracking-tight ${isLight ? 'text-black' : 'text-white'}`}>{activeBroadcast.text}</span>
                                    </div>
                                ))}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div
                    animate={{ x: ["0%", "-50%"] }}
                    className="flex items-center gap-4 lg:gap-8 whitespace-nowrap pl-20 lg:pl-40"
                    transition={{ x: { duration: 240, repeat: Infinity, ease: "linear" } }}
                >
                    {repeatedHistory.map((event, i) => (
                        <div key={`${event.id}-${i}`}
                            className={`flex items-center gap-2 lg:gap-3 px-3 py-1 lg:py-1.5 rounded-xl border transition-all group ${isLight ? 'border-black/[0.05] bg-black/[0.02] hover:bg-black/[0.05]' : 'border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.05]'}`}
                            style={{
                                boxShadow: event.direction === "UP" || event.direction === 1
                                    ? `0 0 10px rgba(60, 179, 113, 0.15)`
                                    : `0 0 10px rgba(255, 127, 80, 0.15)`
                            }}
                        >
                            <div className={`w-5 h-5 lg:w-6 lg:h-6 rounded-lg overflow-hidden flex items-center justify-center shrink-0 ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                {profiles[event.owner]?.xProfileImage ? (
                                    <img src={profiles[event.owner].xProfileImage} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className={`w-full h-full flex items-center justify-center text-[8px] lg:text-[10px] font-black text-[#3CB371]`}>
                                        {(profiles[event.owner]?.username || "A").charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col">
                                <span className={`text-[6px] lg:text-[7px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>
                                    ARC • #{event.id?.slice(-4) || '---'}
                                </span>
                                <span className={`text-[8px] lg:text-[10px] font-black ${isLight ? 'text-black' : 'text-white'}`}>
                                    {event.username || profiles[event.owner]?.username || truncate(event.owner)}
                                </span>
                            </div>

                            <div className={`w-px h-4 lg:h-6 mx-0.5 lg:mx-1 ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />

                            <div className="flex flex-col items-end">
                                <span className={`text-[8px] lg:text-[10px] font-black uppercase tracking-widest ${event.status === "WON" ? "text-[#3CB371]" : "text-[#FF7F50]"}`}>
                                    {event.status === "WON" ? "WON" : "LOST"}
                                </span>
                                <span className={`text-[9px] lg:text-[11px] font-black ${isLight ? 'text-black' : 'text-white'}`}>
                                    {event.amount} {event.symbol || 'USDC'} {event.direction === "UP" || event.direction === 1 || String(event.direction) === "1" ? "UP" : "DOWN"}
                                </span>
                            </div>
                        </div>
                    ))}
                </motion.div>
            </div>
        </div>
    );
};

export const GlobalTradeScroller = memo(GlobalTradeScrollerComponent);
