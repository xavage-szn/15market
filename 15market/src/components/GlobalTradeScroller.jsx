import React, { useEffect, useState, useRef, memo, useMemo, useCallback } from 'react';
import { Radio, ArrowUp, ArrowDown, Check, X } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';

function GlobalTradeScrollerComponent({ theme, isV1 = false }) {
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
        const interval = setInterval(fetchGlobalData, 8000);

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
        const bInterval = setInterval(fetchBroadcast, 15000);

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

    const v1Bg = isLight ? 'bg-white zigzag-ticker shadow-sm' : 'bg-[#0a0a0a] zigzag-ticker zigzag-outline';
    const v1TextClass = isLight ? 'text-[#0a261a]' : 'text-white';
    const switchEffectBg = isLight 
        ? 'bg-[#3CB371] shadow-lg border-[#3CB371]/20' 
        : 'bg-gradient-to-br from-[#1B5E3C] to-[#0D2B1D] shadow-[0_0_40px_rgba(27,94,60,0.5)] border-white/5';

    return (
        <div className={`w-full ${isV1 ? 'h-7 md:h-8 lg:h-12 ' + v1Bg : 'h-7 md:h-8 lg:h-12 zigzag-ticker ' + switchEffectBg} relative z-[45] overflow-hidden`}>
            {activeBroadcast ? (
                <div className="absolute inset-0 flex items-center" style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div
                        className={`flex items-center gap-10 whitespace-nowrap px-10 ${isV1 ? 'bg-amber-500/10' : ''}`}
                        style={{ animation: 'ticker-move 30s linear infinite', willChange: 'transform' }}
                    >
                        {[...Array(10)].map((_, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Radio size={isV1 ? 14 : 12} className={`${isV1 ? 'text-amber-500' : 'text-white'}`} />
                                <span className={`${isV1 ? 'text-[11px] font-black' : 'text-[10px]'} uppercase tracking-[0.2em] ${isV1 ? 'text-amber-500' : 'text-white'}`}>
                                    {activeBroadcast.text}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex items-center h-full" style={{ animation: 'fadeIn 0.2s ease' }}>
                    <div
                        key={scrollerKey}
                        className="flex items-center h-full whitespace-nowrap"
                        style={{ animation: 'ticker-move 100s linear infinite', willChange: 'transform' }}
                    >
                        {repeatedHistory.map((event, i) => {
                            const isUp = event.direction === "UP" || event.direction === 1 || String(event.direction) === "1";
                            const isWon = event.status === "WON";

                            return (
                                <div key={`${event.id}-${i}`} className={`flex items-center gap-6 ${isV1 ? 'px-10 border-r-2' : 'px-12 border-r'} border-white/10 h-full`}>
                                    <div className="flex items-center gap-3">
                                        <div className="p-1 rounded-full bg-white/10">
                                            {isUp ? <ArrowUp size={isV1 ? 10 : 12} className="text-white" /> : <ArrowDown size={isV1 ? 10 : 12} className="text-white" />}
                                        </div>
                                        <span className={`${isV1 ? 'text-[10px]' : 'text-[11px]'} font-black uppercase tracking-[0.2em] text-white`}>
                                            {event.symbol ? event.symbol.split('/')[0] : 'BTC'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col items-start leading-tight">
                                            <span className={`${isV1 ? 'text-[8px]' : 'text-[9px]'} font-black tracking-[0.2em] text-white/50`}>STAKE</span>
                                            <span className={`${isV1 ? 'text-[9px]' : 'text-[10px]'} font-black text-white font-mono`}>${parseFloat(event.amount || 0).toFixed(2)}</span>
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
                    </div>
                </div>
            )}
        </div>
    );
}

export const GlobalTradeScroller = memo(GlobalTradeScrollerComponent);
