import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Zap, Loader2, Globe } from 'lucide-react';
import LiveStreamingChart from './LiveStreamingChart';

export default function CustomChart({ symbol = 'SOLUSDT', theme = 'dark', currentPrice, activeMarket, setActiveMarket, activeTrades = [], uiVersion = 'v1', priceHistory = [] }) {
    const isDark = theme !== 'light';
    const controlBgAlt = isDark ? 'bg-[#0a0a0a]/95' : 'bg-[#b5d3c7]/95';
    const controlBorder = isDark ? 'border-white/10' : 'border-[#249C6C]/25';
    const controlText = isDark ? 'text-white' : 'text-[#0a261a]';
    const controlTextDim = isDark ? 'text-white/40' : 'text-[#0a261a]/60';

    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 1024;
    const [isInternalLoading, setIsInternalLoading] = useState(false);
    const [hasReceivedPrice, setHasReceivedPrice] = useState(false);

    // Track first price tick
    useEffect(() => {
        if (!hasReceivedPrice && currentPrice && currentPrice !== "0" && currentPrice !== "0.00") {
            setHasReceivedPrice(true);
        }
    }, [currentPrice, hasReceivedPrice]);

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

    // Active trades are now rendered as entry markers directly on the canvas


    return (
        <div
            className={`relative w-full h-full flex flex-col flex-1`}
            style={{
                backgroundColor: 'transparent',
                borderRadius: 'inherit',
                minHeight: isSmallScreen ? 'unset' : (uiVersion === 'v2' ? '120px' : '220px')
            }}
        >
            {/* Branded Background Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img src="/logo.png" alt="15market" style={{
                    width: isSmallScreen ? '180px' : '320px',
                    opacity: isDark ? 0.12 : 0.08,
                    filter: isDark ? 'grayscale(1) brightness(0.7)' : 'grayscale(1) brightness(0.1)',
                    mixBlendMode: isDark ? 'screen' : 'multiply'
                }} />
            </div>

            {/* Chart Area */}
            <div className="absolute inset-0 z-10 w-full h-full">
                <LiveStreamingChart
                    theme={theme}
                    symbol={symbol}
                    priceHistory={priceHistory}
                    activeTrades={activeTrades}
                    currentPrice={currentPrice}
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
                                <Loader2 size={48} className="text-[#249C6C] animate-spin opacity-60" />
                                <div className="absolute inset-0 blur-2xl bg-[#249C6C]/10 animate-pulse" />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>



            {/* Top Controls */}
            <div className="absolute top-0 left-0 right-0 z-30 p-1 lg:p-4 pointer-events-none">
                <div className="flex items-center justify-between gap-2 pointer-events-auto">
                    {/* Asset Trigger - Cleaned up */}
                    <div
                        onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                        className={`flex items-center gap-1.5 cursor-pointer px-1 py-1 transition-all pointer-events-auto group ml-2 lg:ml-0`}
                    >
                        <div className="flex flex-col">
                            <span className={`text-[10px] md:text-xs font-black uppercase tracking-tighter ${isDark ? 'text-white' : 'text-[#0a261a]'}`}>
                                {activeMarket?.symbol || 'ETH'}
                            </span>
                            {window.innerWidth >= 768 && (
                                <div className="flex items-center gap-1">
                                    <div className="w-1 h-1 rounded-full bg-[#249C6C] animate-pulse" />
                                    <span className="text-[7px] font-bold opacity-30 uppercase tracking-widest">Live</span>
                                </div>
                            )}
                        </div>
                        <ChevronDown size={12} className={`opacity-20 group-hover:opacity-100 transition-all ${isSelectorOpen ? 'rotate-180' : ''}`} />
                    </div>
                    <AnimatePresence>
                        {isSelectorOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className={`absolute top-16 left-4 z-[100] w-44 md:w-56 ${controlBgAlt} backdrop-blur-3xl border ${controlBorder} rounded-2xl p-1 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] flex flex-col gap-0.5 pointer-events-auto overflow-hidden`}
                            >
                                <div className="px-3 py-1.5 border-b border-white/5 mb-0.5">
                                    <span className="text-[7px] md:text-[8px] font-black uppercase tracking-[0.2em] opacity-30">Select Asset</span>
                                </div>
                                {tokens.map(t => (
                                    <button 
                                        key={t.id} 
                                        onClick={() => onAssetSwitch(t)} 
                                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl transition-all group ${activeMarket?.id === t.id ? 'bg-[#249C6C] text-white' : `hover:bg-white/5 ${controlTextDim} hover:${controlText}`}`}
                                    >
                                        <div className="flex flex-col items-start leading-tight">
                                            <span className="text-[9px] md:text-xs font-black uppercase tracking-widest">{t.symbol}</span>
                                            <span className="text-[6px] md:text-[8px] opacity-60 font-bold uppercase tracking-tight">{t.name || 'Crypto'}</span>
                                        </div>
                                        {activeMarket?.id === t.id && <Zap size={8} className="fill-current text-white animate-pulse" />}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

