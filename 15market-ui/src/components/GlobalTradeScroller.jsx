import React, { useEffect, useState, useRef, memo, useMemo } from 'react';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import idl from '../idl/sol_prediction.json';
import { Connection, PublicKey } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { getProfilePda } from '../api/pdas';
import { Megaphone, Clock, Radio } from 'lucide-react';
import { ethers } from 'ethers';
import ArcABI from '../abi/ArcPrediction.json';
import { ARC_CONTRACT_ADDRESS, ARC_RPC, KEEPER_URL } from '../constants';

const GlobalTradeScrollerComponent = ({ wallet, connection, theme, currentNetwork }) => {
    const [history, setHistory] = useState(() => {
        try {
            const saved = localStorage.getItem("15market_global_history_v2");
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });
    const [profiles, setProfiles] = useState({});
    const [activeBroadcast, setActiveBroadcast] = useState(null);

    // Persistent instances to avoid re-creation overhead
    const programRef = useRef(null);
    const arcProviderRef = useRef(null);
    const arcContractRef = useRef(null);

    const truncate = (str) => str ? `${str.slice(0, 4)}...${str.slice(-4)}` : "";

    const [isConnected, setIsConnected] = useState(true);

    const fetchGlobalData = async () => {
        try {
            // 1. Fetch Total Trade Count for IDX
            try {
                const statsRes = await fetch(`${KEEPER_URL}/protocol-stats`);
                if (statsRes.ok) {
                    const stats = await statsRes.json();
                    if (stats.totalTrades !== undefined) {
                        localStorage.setItem("15market_total_trades", stats.totalTrades.toString());
                    }
                    setIsConnected(true);
                } else {
                    setIsConnected(false);
                }
            } catch (e) {
                console.error("Stats Fetch Error:", e);
                setIsConnected(false);
            }

            // 2. Fetch Unified History
            const historyRes = await fetch(`${KEEPER_URL}/history`);
            if (!historyRes.ok) throw new Error("History fetch failed");

            const historyData = await historyRes.json();
            if (!Array.isArray(historyData)) {
                console.warn("[SCROLLER] History data is not an array:", historyData);
                return;
            }

            setHistory(historyData);
            localStorage.setItem("15market_global_history_v2", JSON.stringify(historyData));

            // 3. Update Profiles
            let updatedProfiles = { ...profiles };
            const ownersToFetch = Array.from(new Set(historyData.map(item => item.owner)))
                .filter(owner => owner && !updatedProfiles[owner]);

            if (ownersToFetch.length > 0) {
                const CHUNK_SIZE = 5;
                for (let i = 0; i < ownersToFetch.length; i += CHUNK_SIZE) {
                    const chunk = ownersToFetch.slice(i, i + CHUNK_SIZE);
                    await Promise.all(chunk.map(async (owner) => {
                        try {
                            const keeperRes = await fetch(`${KEEPER_URL}/profile?address=${owner}`);
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
                }
                setProfiles(prev => ({ ...prev, ...updatedProfiles }));
            }
        } catch (err) {
            console.error("Global Scroller Sync Error:", err);
        }
    };

    useEffect(() => {
        fetchGlobalData();
        const interval = setInterval(fetchGlobalData, 5000);

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
                const saved = localStorage.getItem('15market_admin_broadcast');
                if (saved) {
                    const broadcasts = JSON.parse(saved);
                    const active = broadcasts.find(b => b.expiry > Date.now());
                    setActiveBroadcast(active || null);
                } else setActiveBroadcast(null);
            } catch (e) { setActiveBroadcast(null); }
        };

        checkBroadcast();
        const bInterval = setInterval(checkBroadcast, 2000);

        return () => {
            clearInterval(interval);
            clearInterval(bInterval);
        };
    }, []);

    const repeatedHistory = useMemo(() => {
        if (!history || history.length === 0) return [];
        const totalTrades = parseInt(localStorage.getItem("15market_total_trades") || history.length);
        const indexedHistory = history.map((item, idx) => ({
            ...item,
            absIndex: totalTrades - idx
        }));
        let list = [...indexedHistory];
        while (list.length < 40) { list = [...list, ...indexedHistory]; }
        return [...list, ...list];
    }, [history]);

    const isLight = theme === 'light';

    return (
        <div className={`w-full border-y h-12 flex items-center overflow-hidden relative transition-all duration-500 rounded-xl glass-panel ${isLight
            ? 'bg-white border-black/5 shadow-md'
            : 'border-white/5'
            }`}>

            {/* Left Status Label */}
            <div className={`absolute left-0 top-0 bottom-0 px-4 z-30 flex items-center border-r transition-all duration-300 ${isLight ? 'bg-slate-50 border-black/10' : 'bg-[#050505] border-white/10'}`}>
                <div className="flex items-center gap-2">
                    <div className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3CB371] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3CB371]"></span>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/60' : 'text-white/40'}`}>
                        Network Live
                    </span>
                </div>
            </div>

            {/* Scrolling Content */}
            <div className="flex-1 h-full flex items-center relative overflow-hidden">
                <AnimatePresence mode="wait">
                    {activeBroadcast && (
                        <motion.div
                            key={`broadcast-${activeBroadcast.id}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`absolute inset-0 flex items-center z-40 ${isLight ? 'bg-white/90 backdrop-blur-md' : 'bg-[#050505]'}`}
                        >
                            <motion.div
                                className="flex items-center gap-24 whitespace-nowrap pl-32"
                                animate={{ x: ["0%", "-50%"] }}
                                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                            >
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-6">
                                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${activeBroadcast.type === 'EMERGENCY' ? 'bg-red-500 text-white' : 'bg-[#3CB371] text-black'}`}>
                                            <Radio size={12} className="animate-pulse" />
                                            {activeBroadcast.type}
                                        </div>
                                        <span className={`text-sm font-black uppercase tracking-tight ${isLight ? 'text-black' : 'text-white'}`}>{activeBroadcast.text}</span>
                                    </div>
                                ))}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div
                    animate={{ x: ["0%", "-50%"] }}
                    className="flex items-center gap-8 whitespace-nowrap pl-52"
                    transition={{ x: { duration: 300, repeat: Infinity, ease: "linear" } }}
                >
                    {repeatedHistory.map((event, i) => (
                        <div key={`${event.id}-${i}`} className="flex items-center gap-3 px-4 py-2 rounded-2xl border border-white/[0.03] bg-white/[0.02] hover:bg-white/[0.05] transition-all group">
                            <div className="w-6 h-6 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                                {profiles[event.owner]?.xProfileImage ? (
                                    <img src={profiles[event.owner].xProfileImage} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className={`w-full h-full flex items-center justify-center text-[10px] font-black ${event.network === 'arc' ? 'text-blue-500' : 'text-[#3CB371]'}`}>
                                        {(profiles[event.owner]?.username || "A").charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col">
                                <span className={`text-[7px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>
                                    {event.network?.toUpperCase() || 'SOL'} • #{event.absIndex || '---'}
                                </span>
                                <span className={`text-[10px] font-black ${isLight ? 'text-black' : 'text-white'}`}>
                                    {event.user}
                                </span>
                            </div>

                            <div className={`w-px h-6 bg-white/10 mx-1`} />

                            <div className="flex flex-col items-end">
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-xs font-black ${isLight ? 'text-black' : 'text-white'}`}>{event.amount}</span>
                                    <span className="text-[8px] font-bold opacity-40">{event.currency || 'SOL'}</span>
                                </div>
                                <span className={`text-[9px] font-black ${event.direction === "UP" ? "text-[#3CB371]" : "text-[#FF7F50]"}`}>
                                    {event.direction === "UP" ? "CALL ▲" : "PUT ▼"}
                                </span>
                            </div>
                        </div>
                    ))}
                </motion.div>
            </div>

            {/* Fade Out Edge */}
            <div className={`absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l pointer-events-none z-20 ${isLight ? 'from-white to-transparent' : 'from-[#030303] to-transparent'}`} />
        </div>
    );
};

export const GlobalTradeScroller = memo(GlobalTradeScrollerComponent);
