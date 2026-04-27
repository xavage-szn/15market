import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Zap, Loader2 } from 'lucide-react';
import LiveStreamingChart from './LiveStreamingChart';

export default function CustomChart({ symbol = 'SOLUSDT', theme = 'dark', currentPrice, activeMarket, setActiveMarket, activeTrades = [], uiVersion = 'v1', priceHistory = [] }) {
    const isDark = theme !== 'light';
    const controlBgAlt = isDark ? 'bg-[#0a0a0a]/95' : 'bg-[#b5d3c7]/95';
    const controlBorder = isDark ? 'border-white/10' : 'border-[#3CB371]/25';
    const controlText = isDark ? 'text-white' : 'text-[#0a261a]';
    const controlTextDim = isDark ? 'text-white/40' : 'text-[#0a261a]/60';

    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [isInternalLoading, setIsInternalLoading] = useState(false);

    // Asset switch transition handler
    const onAssetSwitch = (t) => {
        setIsInternalLoading(true);
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

    const tradeResults = useMemo(() => {
        const now = Date.now();
        return activeTrades.map(trade => {
            const entryPrice = parseFloat(trade.entryPrice);
            const referencePrice = (trade.lockedExitPrice || trade.settlementPrice)
                ? parseFloat(trade.lockedExitPrice || trade.settlementPrice)
                : parseFloat(currentPrice);

            const isCall = trade.direction === "UP" || trade.direction === "buy" || trade.direction === 1;
            const won = isCall ? referencePrice > entryPrice : referencePrice < entryPrice;
            const diff = Math.abs(referencePrice - entryPrice).toFixed(4);
            return { id: trade.id, won, diff, amount: trade.amount };
        });
    }, [activeTrades, currentPrice]);

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

            {/* Asset Switch Loading Modal */}
            <AnimatePresence>
                {(isInternalLoading || !currentPrice || currentPrice === "0" || currentPrice === "0.00") && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm transition-all"
                    >
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative">
                                <Loader2 size={40} className="text-[#3CB371] animate-spin" />
                                <div className="absolute inset-0 blur-xl bg-[#3CB371]/20 animate-pulse" />
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/90">Syncing Asset</span>
                                <span className="text-[8px] font-bold text-[#3CB371] uppercase tracking-widest mt-1">{symbol.replace('USDT', '')} LIVE STREAM</span>
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
                            <div className={`w-2 h-2 rounded-full animate-pulse ${result.won ? 'bg-[#3CB371]' : 'bg-[#FF4444]'}`} />
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
                    <div className="flex items-center gap-2">
                        <div
                            className={`flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1 rounded-lg transition-all border border-transparent hover:${controlBorder} pointer-events-auto group`}
                            onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                        >
                            <h2 className={`text-[14px] lg:text-lg font-black ${controlText} tracking-widest uppercase flex items-center gap-2`}>
                                {symbol.replace('USDT', '')}
                            </h2>
                            <ChevronDown size={14} className="text-[#3CB371] transition-transform duration-300 group-hover:scale-110" />
                        </div>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isSelectorOpen && (
                    <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`absolute top-16 left-4 z-[100] w-56 ${controlBgAlt} backdrop-blur-3xl border ${controlBorder} rounded-2xl p-2 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] flex flex-col gap-1 pointer-events-auto`}>
                        {tokens.map(t => (
                            <button key={t.id} onClick={() => onAssetSwitch(t)} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${activeMarket?.id === t.id ? 'bg-[#3CB371] text-white' : `hover:bg-white/5 ${controlTextDim} hover:${controlText}`}`}>
                                <div className="flex flex-col items-start"><span className="text-xs font-black uppercase tracking-widest">{t.symbol}</span><span className="text-[8px] opacity-60 font-medium">{t.name || 'Crypto'}</span></div>
                                {activeMarket?.id === t.id && <Zap size={10} className="fill-current text-white animate-pulse" />}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

