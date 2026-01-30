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
            if (historyData.length > 0) {
                console.log(`[SCROLLER] Updated history with ${historyData.length} trades`);
            }
            localStorage.setItem("15market_global_history_v2", JSON.stringify(historyData));

            // 3. Update Profiles for the history items
            let updatedProfiles = { ...profiles };
            const ownersToFetch = Array.from(new Set(historyData.map(item => item.owner)))
                .filter(owner => owner && !updatedProfiles[owner]);

            if (ownersToFetch.length > 0) {
                // Process in small parallel chunks
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
                            // Fallback
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
        const saved = localStorage.getItem("15market_global_history_v2");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setHistory(parsed);
            } catch (e) { }
        }

        fetchGlobalData();
        const interval = setInterval(fetchGlobalData, 5000); // Relaxed for performance

        const checkBroadcast = () => {
            try {
                // 1. Priority Check: Maintenance Mode
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

                // 2. Normal Broadcasts
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

        const onStorage = (e) => {
            if (e.key === '15market_admin_broadcast') checkBroadcast();
        };
        window.addEventListener('storage', onStorage);

        return () => {
            clearInterval(interval);
            clearInterval(bInterval);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    const repeatedHistory = useMemo(() => {
        if (!history || history.length === 0) return [];

        const totalTrades = parseInt(localStorage.getItem("15market_total_trades") || history.length);

        // Enrich history with absolute indices
        const indexedHistory = history.map((item, idx) => ({
            ...item,
            absIndex: totalTrades - idx
        }));

        let list = [...indexedHistory];
        while (list.length < 40) { // Ensure enough items to fill any screen twice
            list = [...list, ...indexedHistory];
        }
        return [...list, ...list]; // Double for seamless loop
    }, [history]);

    return (
        <div className={`w-full border-y h-10 flex items-center overflow-hidden relative transition-all duration-500 ${theme === 'light'
            ? 'static-panel-light !border-black/5'
            : 'static-panel !border-white/5'
            }`}>
            {/* Left Side: Logo & IDX */}
            <div className={`absolute left-0 top-0 bottom-0 px-3 lg:px-6 z-30 flex items-center border-r transition-all duration-300 ${theme === 'light' ? 'bg-[#e2e8f0]/80 backdrop-blur-md' : 'bg-[#050505]'
                } ${currentNetwork === 'arc' ? 'border-blue-500/30' : 'border-[#3CB371]/30'}`}>
                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border-2 ${theme === 'light' ? 'bg-[#3CB371]/10 border-[#3CB371]/40' : 'bg-[#3CB371]/10 border-[#3CB371]/20'}`}>
                        <div className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3CB371] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3CB371]"></span>
                        </div>
                        <small className={`text-[8px] font-black uppercase tracking-[0.15em] ${theme === 'light' ? 'text-[#059669]' : 'text-[#3CB371]'}`}>
                            Market Live
                        </small>
                    </div>
                </div>
            </div>

            {/* CONNECTION FAULT OVERLAY */}
            {!isConnected && (
                <div className="absolute inset-0 bg-red-600/10 backdrop-blur-[2px] z-50 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] animate-pulse">
                        Keeper Node Offline - Reconnecting...
                    </span>
                </div>
            )}

            {/* Center: Scrolling Content */}
            <div className="flex-1 h-full flex items-center relative overflow-hidden">
                <AnimatePresence mode="wait">
                    {activeBroadcast && (
                        <motion.div
                            key={`broadcast-${activeBroadcast.id}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1 }}
                            className={`absolute inset-0 flex items-center z-40 ${theme === 'light' ? '!bg-white' : 'bg-[#050505]'}`}
                        >
                            <motion.div
                                className="flex items-center gap-24 whitespace-nowrap pl-32 lg:pl-52"
                                animate={{ x: ["0%", "-50%"] }}
                                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                            >
                                {[...Array(12)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-6">
                                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${activeBroadcast.type === 'EMERGENCY' ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-[var(--primary-color)] text-black shadow-[0_0_15px_var(--primary-glow)]'}`}>
                                            <Radio size={12} className="animate-pulse" />
                                            {activeBroadcast.type}
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Megaphone size={16} className="text-[var(--primary-color)] animate-bounce" />
                                            <span className={`text-base font-black uppercase tracking-tight bg-clip-text text-transparent ${theme === 'light' ? 'bg-gradient-to-r from-black to-black/60' : 'bg-gradient-to-r from-white to-white/60'}`}>{activeBroadcast.text}</span>
                                        </div>
                                    </div>
                                ))}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div
                    animate={{ opacity: activeBroadcast ? 0.05 : 1 }}
                    className="flex items-center h-full w-full"
                >
                    {repeatedHistory.length > 0 && (
                        <motion.div
                            animate={{ x: ["0%", "-50%"] }}
                            className="flex items-center gap-12 lg:gap-24 whitespace-nowrap pl-24 lg:pl-52"
                            transition={{ x: { duration: 300, repeat: Infinity, ease: "linear" } }}
                        >
                            {repeatedHistory.map((event, i) => (
                                <div key={`${event.id}-${i}`} className="flex items-center mx-4 lg:mx-8">
                                    <div className={`flex items-center gap-3 lg:gap-4 px-3 py-1 lg:px-4 lg:py-1.5 rounded-xl border-2 transition-all duration-300 hover:scale-[1.02] ${event.direction === "UP"
                                        ? (theme === 'light' ? 'border-[#3CB371] shadow-[0_0_30px_rgba(60,179,113,0.6)] bg-transparent backdrop-blur-md' : 'border-[#3CB371]/60 shadow-[0_0_25px_rgba(60,179,113,0.3)] bg-[#3CB371]/5')
                                        : (theme === 'light' ? 'border-[#FF8C00] shadow-[0_0_30px_rgba(255,140,0,0.6)] bg-transparent backdrop-blur-md' : 'border-[#FF8C00]/60 shadow-[0_0_25px_rgba(255,140,0,0.3)] bg-[#FF8C00]/5')
                                        } ${theme === 'light' ? '' : 'static-panel'}`}>
                                        {/* Profile Photo */}
                                        <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                                            {profiles[event.owner]?.xProfileImage ? (
                                                <img src={profiles[event.owner].xProfileImage} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className={`w-full h-full flex items-center justify-center text-[8px] font-black ${event.network === 'arc' ? 'bg-blue-500/10 text-blue-500' : 'bg-[#3CB371]/10 text-[#3CB371]'}`}>
                                                    {(profiles[event.owner]?.username || "A").charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>

                                        {/* ID & User Group */}
                                        <div className="flex flex-col min-w-[60px] lg:min-w-[80px]">
                                            <div className="flex items-center gap-1">
                                                <span className={`text-[7px] font-black px-1 rounded ${event.network === 'arc' ? 'bg-blue-500/20 text-blue-500' : 'bg-[#3CB371]/20 text-[#3CB371]'}`}>
                                                    {event.network?.toUpperCase() || 'SOL'}
                                                </span>
                                                <span className={`text-[8px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-black/30' : 'text-white/20'}`}>
                                                    TRD #{event.absIndex || (history.length - (i % history.length))}
                                                </span>
                                            </div>
                                            <span className={`text-[10px] lg:text-xs font-black truncate max-w-[80px] lg:max-w-[100px] ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                                                {event.user}
                                            </span>
                                        </div>

                                        {/* Separator */}
                                        <div className={`w-px h-6 mx-1 ${event.network === 'arc' ? 'bg-blue-500/30' : 'bg-[#3CB371]/30'}`} />

                                        {/* Amount */}
                                        <div className="flex flex-col items-end min-w-[50px]">
                                            <div className="flex items-baseline gap-1">
                                                <span className={`text-[10px] lg:text-xs font-black tabular-nums ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                                                    {event.amount}
                                                </span>
                                                <span className={`text-[8px] font-bold ${event.network === 'arc' ? 'text-blue-500' : 'text-[#3CB371]'}`}>
                                                    {event.currency || 'SOL'}
                                                </span>
                                            </div>
                                            <span className={`text-[8px] font-bold ${theme === 'light' ? 'text-black/40' : 'text-white/30'}`}>
                                                @{event.entryPrice}
                                            </span>
                                        </div>

                                        {/* Direction Badge */}
                                        <div className={`ml-2 px-2 py-1 rounded flex items-center gap-1.5 ${event.direction === "UP"
                                            ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)]'
                                            : 'bg-[#FF8C00]/10 text-[#FF8C00]'
                                            }`}>
                                            <span className="text-[10px] lg:text-xs font-black">{event.direction === "UP" ? '▲' : '▼'}</span>
                                            <span className="text-[9px] lg:text-[10px] font-black tracking-wider hidden lg:block">
                                                {event.direction}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </motion.div>
            </div>

            {/* Right Gradient */}
            <div className={`absolute right-0 top-0 bottom-0 w-48 bg-gradient-to-l z-20 pointer-events-none ${theme === 'light' ? 'from-white to-transparent' : 'from-[#050505] to-transparent'}`} />
        </div >
    );
};

export const GlobalTradeScroller = memo(GlobalTradeScrollerComponent);
