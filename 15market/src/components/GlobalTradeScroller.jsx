import React, { useEffect, useState, useRef, memo, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, ArrowUp, ArrowDown, Check, X } from 'lucide-react';
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

    const isLight = theme === 'light';
    const WIN_COLOR = "#3CB371"; // Green
    const LOSS_COLOR = "#FF7F50"; // Coral/Red

    const truncate = (str) => str ? `${str.slice(0, 4)}...${str.slice(-4)}` : "";

    const fetchGlobalData = useCallback(async () => {
        try {
            const arcRes = await fetch(`${KEEPER_URL_ARC}/history`);
            if (arcRes.ok) {
                const arcData = await arcRes.json();
                if (Array.isArray(arcData)) {
                    arcData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    const finalHistory = arcData.slice(0, 80);

                    const newJson = JSON.stringify(finalHistory.map(h => h.id));
                    const oldJson = JSON.stringify(history.map(h => h.id));
                    if (newJson !== oldJson) {
                        setHistory(finalHistory);
                        localStorage.setItem("15market_global_history_v2", JSON.stringify(finalHistory));
                    }

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
    }, []);

    useEffect(() => {
        fetchGlobalData();
        const interval = setInterval(fetchGlobalData, 3000);

        const checkBroadcast = () => {
            try {
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
                setActiveBroadcast(null);
            } catch (e) { setActiveBroadcast(null); }
        };

        checkBroadcast();
        const bInterval = setInterval(checkBroadcast, 5000);

        return () => {
            clearInterval(interval);
            clearInterval(bInterval);
        };
    }, []);

    const ghostTrades = useMemo(() => {
        const symbols = ["ETH", "BTC"];
        const names = ["Alpha_Bot", "Pulse_V1", "Sonic_X", "Whale_88"];
        return Array.from({ length: 8 }).map((_, i) => ({
            id: `ghost-${i}`,
            owner: "0x0000000000000000000000000000000000000000",
            username: names[i % names.length],
            amount: (Math.random() * 5 + 1).toFixed(2),
            symbol: symbols[i % symbols.length],
            direction: Math.random() > 0.5 ? "UP" : "DOWN",
            status: Math.random() > 0.5 ? "WON" : "LOST",
            timestamp: Date.now() - (i * 30000),
            isGhost: true
        }));
    }, []);

    const mergedHistory = useMemo(() => {
        const filtered = history.filter(t => ["WON", "LOST"].includes(t.status));
        if (filtered.length === 0) return ghostTrades;
        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return filtered.slice(0, 40);
    }, [history, ghostTrades]);

    const repeatedHistory = useMemo(() => {
        if (!mergedHistory || mergedHistory.length === 0) return [];
        let list = [...mergedHistory];
        while (list.length < 30) { list = [...list, ...mergedHistory]; }
        return [...list, ...list];
    }, [mergedHistory]);

    // Key changes when new trades arrive, causing animation to reset so fresh trades are visible immediately
    const scrollerKey = useMemo(() => {
        if (!mergedHistory || mergedHistory.length === 0) return 'empty';
        return `${mergedHistory[0]?.id}-${mergedHistory.length}`;
    }, [mergedHistory]);

    return (
        <div className={`w-full h-8 lg:h-10 relative z-[45] overflow-hidden border-y ${isLight ? 'bg-white/95 border-black/5' : 'bg-[#0d0d0d]/80 border-white/5 backdrop-blur-md'}`}>
            <AnimatePresence mode="wait">
                {activeBroadcast ? (
                    <motion.div
                        key="broadcast"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center bg-[#FF7F50]/10"
                    >
                        <motion.div
                            animate={{ x: [0, -1000] }}
                            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                            className="flex items-center gap-10 whitespace-nowrap px-10"
                        >
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Radio size={12} className="text-[#FF7F50] animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-[#FF7F50]">
                                        {activeBroadcast.text}
                                    </span>
                                </div>
                            ))}
                        </motion.div>
                    </motion.div>
                ) : (
                    <motion.div
                        key={`ticker-${scrollerKey}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center h-full"
                    >
                        <motion.div
                            animate={{ x: [0, -1500] }}
                            transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
                            className="flex items-center h-full whitespace-nowrap"
                        >
                            {repeatedHistory.map((event, i) => {
                                const isUp = event.direction === "UP" || event.direction === 1 || String(event.direction) === "1";
                                const isWon = event.status === "WON";
                                const color = isWon ? WIN_COLOR : LOSS_COLOR;

                                return (
                                    <div key={`${event.id}-${i}`} className="flex items-center gap-4 px-6 border-r border-white/5 h-full">
                                        <div className="flex items-center gap-2">
                                            <div className="p-0.5 rounded-sm bg-white/5">
                                                {isUp ? <ArrowUp size={8} className="text-[#3CB371]" /> : <ArrowDown size={8} className="text-[#FF7F50]" />}
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-tighter ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                                                {event.symbol ? event.symbol.split('/')[0] : 'BTC'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className={`px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest flex items-center gap-1`}
                                                style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}>
                                                {isWon ? <Check size={7} /> : <X size={7} />}
                                                {event.status}
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

export const GlobalTradeScroller = memo(GlobalTradeScrollerComponent);
