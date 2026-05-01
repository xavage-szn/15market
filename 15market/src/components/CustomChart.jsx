import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Zap, Loader2, Globe } from 'lucide-react';
import LiveStreamingChart from './LiveStreamingChart';

export default function CustomChart({ symbol = 'SOLUSDT', theme = 'dark', currentPrice, activeMarket, setActiveMarket, activeTrades = [], uiVersion = 'v1', priceHistory = [] }) {
    const isDark = theme !== 'light';
    const controlBgAlt = isDark ? 'bg-[#0a0a0a]/95' : 'bg-[#b5d3c7]/95';
    const controlBorder = isDark ? 'border-white/10' : 'border-[#3CB371]/25';
    const controlText = isDark ? 'text-white' : 'text-[#0a261a]';
    const controlTextDim = isDark ? 'text-white/40' : 'text-[#0a261a]/60';

    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [isInternalLoading, setIsInternalLoading] = useState(false);
    const [hasReceivedPrice, setHasReceivedPrice] = useState(false);

    // Track first price tick
    if (!hasReceivedPrice && currentPrice && currentPrice !== "0" && currentPrice !== "0.00") {
        setHasReceivedPrice(true);
    }

    // Asset switch transition handler
    const onAssetSwitch = (t) => {
        setIsInternalLoading(true);
        setHasReceivedPrice(false); // Reset for new asset
        setActiveMarket(t);
        setIsSelectorOpen(false);
        // Minimum loading time for smooth transition
        setTimeout(() => setIsInternalLoading(false), 800);
    };
    const tokens = useMemo(() => {
        const saved = JSON.parse(localStorage.getItem('15market_listed_tokens') || '[]');
        return saved.length > 0 ? saved : [
            { id: 'eth', symbol: 'ETH', name: 'Ethereum' },
            { id: 'btc', symbol: 'BTC', name: 'Bitcoin' },
            { id: 'sol', symbol: 'SOL', name: 'Solana' },
        ];
    }, [activeMarket?.id]);

    // --- Result Locking & Persistence ---
    const [visibleResults, setVisibleResults] = useState([]);
    const cleanupTimers = useRef({});

    useEffect(() => {
        const now = Date.now();
        const newVisible = [];

        activeTrades.forEach(trade => {
            const tid = String(trade.id);
            const entryPrice = parseFloat(trade.entryPrice);
            const isCall = trade.direction === "UP" || trade.direction === "buy" || trade.direction === 1;
            
            // Check if trade is expired (locally or via backend)
            const start = trade.startTime || (tid.length > 12 ? parseInt(tid) : now);
            const duration = trade.duration || 15;
            const expiry = trade.expiryMs || (start + (duration * 1000));
            const isExpired = now >= expiry || ["WON", "LOST", "TIMEOUT"].includes(trade.status);

            // Calculate Result
            let referencePrice;
            if (isExpired) {
                // If expired, prioritize backend exitPrice, then cached locked price, then currentPrice (once)
                referencePrice = parseFloat(trade.settlementPrice || trade.exitPrice || trade.lockedExitPrice || currentPrice);
                
                // If it's a fresh expiry, lock it so it doesn't flicker
                if (!trade.lockedExitPrice && !trade.settlementPrice) {
                    trade.lockedExitPrice = currentPrice;
                }
            } else {
                referencePrice = parseFloat(currentPrice);
            }

            const won = isCall ? referencePrice > entryPrice : referencePrice < entryPrice;
            const diff = Math.abs(referencePrice - entryPrice).toFixed(4);

            if (!isExpired) {
                newVisible.push({ id: tid, won, diff, amount: trade.amount, expired: false });
                // Clear any cleanup timer if trade is somehow re-activated
                if (cleanupTimers.current[tid]) {
                    clearTimeout(cleanupTimers.current[tid]);
                    delete cleanupTimers.current[tid];
                }
            } else {
                // It's expired. If it's already in visibleResults and not yet scheduled for removal, schedule it.
                if (!cleanupTimers.current[tid]) {
                    cleanupTimers.current[tid] = setTimeout(() => {
                        setVisibleResults(prev => prev.filter(r => r.id !== tid));
                        delete cleanupTimers.current[tid];
                    }, 5000); // Stay for 5 seconds
                    
                    // Add it as an expired result
                    newVisible.push({ id: tid, won, diff, amount: trade.amount, expired: true });
                } else {
                    // Already scheduled for removal, keep it in the list for now
                    const existing = visibleResults.find(r => r.id === tid);
                    if (existing) newVisible.push(existing);
                }
            }
        });

        // Merge and dedupe
        setVisibleResults(prev => {
            const merged = [...newVisible];
            prev.forEach(p => {
                if (p.expired && !merged.find(m => m.id === p.id)) {
                    // Keep expired ones until the timer removes them
                    if (cleanupTimers.current[p.id]) merged.push(p);
                }
            });
            return merged.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        });
    }, [activeTrades, currentPrice]);

    const tradeResults = visibleResults;


    return (
        <div
            className={`relative w-full h-full flex flex-col flex-1`}
            style={{
                backgroundColor: 'transparent',
                borderRadius: 'inherit',
                minHeight: uiVersion === 'v2' ? '120px' : '220px'
            }}
        >
            {/* Branded Background Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img src="/logo.png" alt="15market" style={{
                    width: '85%',
                    opacity: isDark ? 0.12 : 0.08,
                    filter: isDark ? 'grayscale(1) brightness(0.7)' : 'grayscale(1) brightness(0.1)',
                    mixBlendMode: isDark ? 'screen' : 'multiply'
                }} />
            </div>

            {/* Chart Area */}
            <div className="absolute inset-0 z-10 flex-1 h-full">
                <LiveStreamingChart
                    theme={theme}
                    symbol={symbol}
                    priceHistory={priceHistory}
                />
            </div>

            {/* Asset Switch Loading Modal - Minimal Premium Transition */}
            <AnimatePresence>
                {(isInternalLoading || !hasReceivedPrice) && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/40 backdrop-blur-md transition-all"
                    >
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative">
                                <Loader2 size={48} className="text-[#3CB371] animate-spin opacity-60" />
                                <div className="absolute inset-0 blur-2xl bg-[#3CB371]/10 animate-pulse" />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Live Results Floating Overlay */}
            <div className="absolute top-24 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {tradeResults.map((result) => (
                        <motion.div
                            key={result.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className={`px-3 py-1.5 rounded-xl border backdrop-blur-md flex items-center gap-2 shadow-xl ${result.won
                                    ? 'bg-[#3CB371]/20 border-[#3CB371]/30'
                                    : 'bg-[#FF4444]/20 border-[#FF4444]/30'
                                }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${!result.expired ? 'animate-pulse' : ''} ${result.won ? 'bg-[#3CB371]' : 'bg-[#FF4444]'}`} />
                            <span className={`text-[10px] font-black uppercase ${isDark ? 'text-white' : 'text-[#0a261a]'} tracking-widest`}>
                                {result.won ? `+$${(result.amount * 1.95).toFixed(2)}` : `-$${result.amount}`}
                            </span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Top Controls */}
            <div className="absolute top-0 left-0 right-0 z-30 p-2 lg:p-4 pointer-events-none">
                <div className="flex items-center justify-between gap-2 pointer-events-auto">
                            {/* Asset Trigger - Cleaned up (No background square) */}
                            <div
                                onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                                className={`flex items-center gap-1.5 cursor-pointer px-1 py-1 transition-all pointer-events-auto group`}
                            >
                                <div className={`p-1.5 rounded-xl ${controlBgAlt} border ${controlBorder} group-hover:scale-110 transition-transform`}>
                                    <Globe size={14} className="text-[#3CB371]" />
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-[10px] md:text-xs font-black uppercase tracking-tighter ${isDark ? 'text-white' : 'text-[#0a261a]'}`}>
                                        {activeMarket?.symbol || 'ETH'}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <div className="w-1 h-1 rounded-full bg-[#3CB371] animate-pulse" />
                                        <span className="text-[7px] font-bold opacity-30 uppercase tracking-widest">Live</span>
                                    </div>
                                </div>
                                <ChevronDown size={12} className={`opacity-20 group-hover:opacity-100 transition-all ${isSelectorOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </div>
                    </div>

                    <AnimatePresence>
                        {isSelectorOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className={`absolute top-16 left-4 z-[100] w-48 md:w-56 ${controlBgAlt} backdrop-blur-3xl border ${controlBorder} rounded-2xl p-2 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] flex flex-col gap-1 pointer-events-auto overflow-hidden`}
                            >
                                <div className="px-3 py-2 border-b border-white/5 mb-1">
                                    <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-30">Select Asset</span>
                                </div>
                                {tokens.map(t => (
                                    <button 
                                        key={t.id} 
                                        onClick={() => onAssetSwitch(t)} 
                                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group ${activeMarket?.id === t.id ? 'bg-[#3CB371] text-white' : `hover:bg-white/5 ${controlTextDim} hover:${controlText}`}`}
                                    >
                                        <div className="flex flex-col items-start">
                                            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">{t.symbol}</span>
                                            <span className="text-[7px] md:text-[8px] opacity-60 font-bold uppercase tracking-tight">{t.name || 'Crypto'}</span>
                                        </div>
                                        {activeMarket?.id === t.id && <Zap size={10} className="fill-current text-white animate-pulse" />}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
        </div>
    );
}

