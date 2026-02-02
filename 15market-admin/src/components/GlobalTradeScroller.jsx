import React, { useEffect, useState, useRef, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, Radio } from 'lucide-react';

const truncate = (str) => str ? `${str.slice(0, 4)}...${str.slice(-4)}` : "";

const GlobalTradeScrollerComponent = React.memo(({ theme, currentNetwork, history = [] }) => {
    const [activeBroadcast, setActiveBroadcast] = useState(null);

    // Filter history based on currentNetwork
    const filteredHistory = useMemo(() => {
        if (!history || history.length === 0) return [];
        return history.filter(h => {
            if (!currentNetwork || currentNetwork === 'ALL') return true;
            const target = currentNetwork.toLowerCase();
            if (target === 'solana') return h.network === 'solana' || !h.network;
            return h.network === target;
        });
    }, [history, currentNetwork]);

    // Format for display if needed
    const displayHistory = useMemo(() => {
        return filteredHistory.map(item => ({
            ...item,
            user: item.user || (item.owner ? truncate(item.owner) : 'Anon'),
            amount: item.amount || 0,
            currency: item.currency || (item.network === 'arc' ? 'USDC' : 'SOL'),
            direction: item.direction || 'UP'
        }));
    }, [filteredHistory]);

    useEffect(() => {
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
            clearInterval(bInterval);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    const renderEvents = useMemo(() => {
        if (displayHistory.length === 0) return [];
        // Triple up for smooth infinite scroller feel
        return [...displayHistory, ...displayHistory, ...displayHistory];
    }, [displayHistory]);

    return (
        <div className={`w-full border-y h-10 flex items-center overflow-hidden relative transition-colors duration-300 ${theme === 'light'
            ? (currentNetwork === 'arc'
                ? '!bg-white border-[#3B82F6] shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                : '!bg-white border-[#3CB371] shadow-[0_0_20px_rgba(60,179,113,0.3)]')
            : `bg-[#050505] shadow-2xl ${currentNetwork === 'arc' ? 'border-blue-400/20' : 'border-[#3CB371]/20'}`
            }`}>
            <div className={`absolute left-0 top-0 bottom-0 px-3 lg:px-6 z-30 flex items-center border-r transition-colors duration-300 ${theme === 'light'
                ? '!bg-white shadow-[20px_0_40px_rgba(0,0,0,0.2)]'
                : 'bg-[#050505] shadow-[20px_0_40px_rgba(0,0,0,1)]'} ${currentNetwork === 'arc' ? 'border-blue-500/30' : 'border-[#3CB371]/30'}`}>
                <div className="flex items-center gap-3">
                    <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary-color)] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--primary-color)]"></span>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-[0.4em] ${theme === 'light' ? 'text-black/40' : 'text-white/40'}`}>Market Live</span>
                </div>
            </div>

            <div className="flex-1 relative h-full flex items-center">
                <AnimatePresence>
                    {activeBroadcast ? (
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
                                animate={{ x: [0, -1000] }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            >
                                {[...Array(6)].map((_, i) => (
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
                    ) : (
                        <motion.div
                            key="trades"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, x: [0, -2000] }}
                            className="flex items-center gap-12 lg:gap-24 whitespace-nowrap pl-24 lg:pl-52"
                            transition={{ x: { duration: 40, repeat: Infinity, ease: "linear" }, opacity: { duration: 0.5 } }}
                        >
                            {renderEvents.map((event, i) => (
                                <div key={`${event.id}-${i}`} className="flex items-center mx-4 lg:mx-8">
                                    <div className={`flex items-center gap-3 lg:gap-4 px-3 py-1 lg:px-4 lg:py-1.5 rounded-full border backdrop-blur-sm ${theme === 'light'
                                        ? 'bg-white/40 border-black/5 shadow-[0_0_15px_rgba(60,179,113,0.3)] hover:shadow-[0_0_20px_rgba(60,179,113,0.5)]'
                                        : 'bg-white/5 border-white/5 shadow-[0_0_15px_rgba(60,179,113,0.2)] hover:shadow-[0_0_20px_rgba(60,179,113,0.4)]'
                                        } transition-all duration-300`}>
                                        {/* ID & User Group */}
                                        <div className="flex flex-col min-w-[60px] lg:min-w-[80px]">
                                            <div className="flex items-center gap-1">
                                                <span className={`text-[7px] font-black px-1 rounded ${event.network === 'arc' ? 'bg-blue-500/20 text-blue-500' : 'bg-[#3CB371]/20 text-[#3CB371]'}`}>
                                                    {event.network?.toUpperCase() || 'SOL'}
                                                </span>
                                                <span className={`text-[8px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-black/30' : 'text-white/20'}`}>
                                                    #{truncate(event.id)}
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
                                            ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] shadow-[0_0_10px_rgba(60,179,113,0.15)]'
                                            : 'bg-[#FF8C00]/10 text-[#FF8C00] shadow-[0_0_10px_rgba(255,140,0,0.15)]'
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
                </AnimatePresence>
            </div>
            <div className={`absolute right-0 top-0 bottom-0 w-48 bg-gradient-to-l z-20 pointer-events-none ${theme === 'light' ? 'from-white to-transparent' : 'from-[#050505] to-transparent'}`} />
        </div>
    );
});

export const GlobalTradeScroller = memo(GlobalTradeScrollerComponent);
