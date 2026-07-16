import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Zap, Loader2, Globe } from 'lucide-react';
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

    const listRef = useRef(null);
    const scrollInterval = useRef(null);

    const handleScroll = (direction, speed) => {
        if (scrollInterval.current) clearInterval(scrollInterval.current);
        scrollInterval.current = setInterval(() => {
            if (listRef.current) {
                listRef.current.scrollTop += direction === 'down' ? speed : -speed;
            }
        }, 16);
    };

    const stopScroll = () => {
        if (scrollInterval.current) {
            clearInterval(scrollInterval.current);
            scrollInterval.current = null;
        }
    };

    const scrollByAmount = (direction) => {
        if (listRef.current) {
            listRef.current.scrollBy({ top: direction === 'down' ? 100 : -100, behavior: 'smooth' });
        }
    };

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



            {/* Top Controls: Asset Dropdown / Drawer */}
            <div className="absolute top-0 left-0 right-0 bottom-0 z-30 pointer-events-none">
                {/* Trigger Button */}
                {!isSelectorOpen && (
                    <div className="absolute top-2 left-2 lg:top-4 lg:left-4 z-30">
                        <div
                            onClick={() => setIsSelectorOpen(true)}
                            className="flex items-center gap-1.5 cursor-pointer px-2.5 py-1.5 transition-all pointer-events-auto group"
                        >
                            <span className={`text-[10px] md:text-xs font-black uppercase tracking-widest ${isDark ? 'text-white' : 'text-[#0a261a]'}`}>
                                {activeMarket?.symbol || 'Select Asset'}
                            </span>
                            <ChevronDown size={12} className="-rotate-90 opacity-60 transition-all group-hover:opacity-100" />
                        </div>
                    </div>
                )}

                {/* Left Side Asset List Drawer */}
                <AnimatePresence>
                    {isSelectorOpen && (
                        <>
                            {/* Click-outside overlay */}
                            <motion.div 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="absolute inset-0 z-40 pointer-events-auto bg-black/5 backdrop-blur-[2px]" 
                                onClick={() => setIsSelectorOpen(false)} 
                            />
                            
                            {/* Side Pane - No background, no outline */}
                            <motion.div
                                initial={{ opacity: 0, x: -50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                className={`absolute top-0 left-0 bottom-0 z-50 flex flex-col pointer-events-auto w-[140px] pt-[60px]`}
                            >
                                {/* Desktop Close Button */}
                                {!isSmallScreen && (
                                    <div 
                                        onClick={() => setIsSelectorOpen(false)} 
                                        className={`flex items-center justify-end p-2 cursor-pointer mb-2`}
                                    >
                                        <ChevronDown size={14} className="-rotate-90 opacity-60 hover:opacity-100 transition-all" />
                                    </div>
                                )}
                                
                                {/* Up Scroll Area */}
                                {tokens.length > 5 && (
                                    <div 
                                        className={`flex items-center justify-center py-2 cursor-pointer opacity-40 hover:opacity-100 transition-all z-10`}
                                        onMouseEnter={() => handleScroll('up', 1.5)}
                                        onMouseLeave={stopScroll}
                                        onClick={() => scrollByAmount('up')}
                                    >
                                        <ChevronUp size={16} />
                                    </div>
                                )}
                                
                                <div ref={listRef} className="flex-1 overflow-y-auto no-scrollbar flex flex-col px-4 scroll-smooth">
                                    {tokens.map((t, index) => {
                                        const isActive = activeMarket?.id === t.id;
                                        return (
                                            <React.Fragment key={t.id}>
                                                <div
                                                    onClick={() => {
                                                        if (!isActive) onAssetSwitch(t);
                                                        setIsSelectorOpen(false); // Close on select
                                                    }}
                                                    className={`flex items-center justify-between py-3 cursor-pointer transition-all group`}
                                                >
                                                    <span className={`text-[11px] md:text-[13px] font-black uppercase tracking-widest transition-all ${isActive ? (isDark ? 'text-white' : 'text-[#0a261a]') : (isDark ? 'text-white/40 group-hover:text-white/80' : 'text-[#0a261a]/40 group-hover:text-[#0a261a]/80')}`}
                                                        style={{
                                                            textShadow: isActive ? (isDark ? '0 0 12px rgba(255,255,255,0.6)' : '0 0 12px rgba(10,38,26,0.4)') : 'none',
                                                        }}
                                                    >
                                                        {t.symbol}
                                                    </span>
                                                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#249C6C] animate-pulse" style={{ boxShadow: '0 0 8px #249C6C' }} />}
                                                </div>
                                                {/* Horizontal Line Divider */}
                                                {index < tokens.length - 1 && (
                                                    <div className={`w-full h-[1px] transition-colors ${isDark ? 'bg-white/10' : 'bg-[#0a261a]/10'}`} />
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                                
                                {/* Down Scroll Area */}
                                {tokens.length > 5 && (
                                    <div 
                                        className={`flex items-center justify-center py-2 cursor-pointer opacity-40 hover:opacity-100 transition-all z-10`}
                                        onMouseEnter={() => handleScroll('down', 1.5)}
                                        onMouseLeave={stopScroll}
                                        onClick={() => scrollByAmount('down')}
                                    >
                                        <ChevronDown size={16} />
                                    </div>
                                )}
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

