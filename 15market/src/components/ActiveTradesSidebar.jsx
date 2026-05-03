import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Timer, Trophy, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const GREEN_COLOR = "#3CB371"; // WON is Green
const RED_COLOR = "#FF7F50";   // LOST is Coral

// Smoothly interpolates the backend-authoritative timeLeft
function TradeCountdown({ timeLeft, isDark }) {
    const [displayTime, setDisplayTime] = useState(timeLeft || 0);

    // Sync to backend tick when it arrives
    useEffect(() => {
        if (timeLeft !== undefined) {
            setDisplayTime(timeLeft);
        }
    }, [timeLeft]);

    // Smooth client-side interpolation between 1s backend ticks
    useEffect(() => {
        const interval = setInterval(() => {
            setDisplayTime(prev => Math.max(0, prev - 0.1));
        }, 100);
        return () => clearInterval(interval);
    }, []);

    if (displayTime <= 0) return null;

    return (
        <div className={`flex items-center justify-center gap-1.5 mt-2 pt-2 border-t ${isDark ? 'border-white/5' : 'border-[#0f2618]/5'}`}>
            <Timer size={10} className="text-[#3CB371] animate-pulse" />
            <span className={`text-[10px] font-mono font-black tabular-nums tracking-tighter ${isDark ? 'text-white/80' : 'text-[#0f2618]/80'}`}>
                {displayTime.toFixed(1)}s
            </span>
        </div>
    );
}

export function ActiveTradesSidebar({ activeTrades, price, theme = 'dark', currentPrice, setSelectedPnLTrade, setIsPnLOpen }) {
    if (!activeTrades || activeTrades.length === 0) return null;
    const isDark = theme !== 'light';

    return (
        <div className={`w-full h-full flex flex-col overflow-hidden ${isDark ? 'bg-transparent' : 'coral-green-gradient-light'}`}
        >
            <div className={`px-4 py-2.5 flex items-center justify-between border-b ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-[#3CB371]/10 bg-white/20'}`}>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3CB371] shadow-[0_0_10px_#3CB371]" />
                    <span className={`text-[9px] uppercase font-black tracking-[0.3em] ${isDark ? 'text-white/40' : 'text-[#0f2618]/40'}`}>
                        Engines
                    </span>
                </div>
                {activeTrades.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#3CB371]/10 border border-[#3CB371]/20">
                        <span className="text-[8px] font-black text-[#3CB371]">{activeTrades.length} ACTIVE</span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 thin-scrollbar">
                <AnimatePresence>
                    {activeTrades.length === 0 ? (
                        <motion.div
                            key="empty"
                            layout
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="h-full flex flex-col items-center justify-center text-center opacity-20 gap-2"
                        >
                            <AlertCircle size={32} strokeWidth={1} />
                            <span className="text-[10px] font-black uppercase tracking-widest">No Active Streams</span>
                        </motion.div>
                    ) : (
                        activeTrades.map((trade) => {
                            const isLong = trade.direction === "buy" || trade.direction === "UP" || trade.direction === 1 || String(trade.direction) === "1";
                            const entryPrice = parseFloat(trade.entryPrice);
                            // Use backend livePrice if available, fallback to global price
                            const current = trade.livePrice ? parseFloat(trade.livePrice) : parseFloat(price);
                            
                            // GLITCH FIX: Once expired, we stop calculating based on live price.
                            // We prefer trade.won if backend already settled, otherwise we use the state at expiry.
                            const isExpired = trade.timeLeft !== undefined && trade.timeLeft <= 0;
                            
                            // Real-time calculation: Trust backend if provided, fallback to live price comparison
                            const isWinning = trade.won !== undefined 
                                ? trade.won 
                                : (trade.isWinning !== undefined 
                                    ? trade.isWinning 
                                    : (isLong ? current > entryPrice : current < entryPrice));

                            const statusColor = isWinning ? GREEN_COLOR : RED_COLOR;

                            return (
                                <motion.div
                                    layout
                                    key={trade.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    onClick={() => {
                                        if (trade.status === "WON" || trade.status === "LOST") {
                                            setSelectedPnLTrade(trade);
                                            setIsPnLOpen(true);
                                        }
                                    }}
                                    className={`relative p-3 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] group/item
                                        ${isDark ? 'bg-white/5 border-white/5 hover:border-white/10' : 'bg-[#f0f9f4] border-[#3CB371]/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]'}
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-lg ${isLong ? 'bg-[#3CB371]/10' : 'bg-[#FF7F50]/10'}`}>
                                                {isLong
                                                    ? <ArrowUp size={12} color="#3CB371" strokeWidth={3} />
                                                    : <ArrowDown size={12} color="#FF7F50" strokeWidth={3} />
                                                }
                                            </div>
                                            <div>
                                                <div className={`text-[10px] font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-[#05140b]'}`}>
                                                    {isLong ? "LONG" : "SHORT"}
                                                </div>
                                                <div className={`text-[7px] font-bold tracking-widest uppercase ${isDark ? 'opacity-30 text-white' : 'text-[#05140b]/30'}`}>
                                                    ARC
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right flex flex-col items-end">
                                            <div className={`text-[10px] font-black tracking-tight ${isDark ? 'text-white/50' : 'text-[#05140b]/50'}`}>
                                                {Number(trade.amount).toFixed(2)} USDC
                                            </div>
                                            <div className="text-[9px] font-black flex items-center gap-1" style={{ color: statusColor }}>
                                                {isWinning ? '▲' : '▼'}
                                                {isWinning
                                                    ? `+${(Math.floor(parseFloat(trade.amount) * (trade.duration <= 5 ? 2.90 : (trade.duration <= 10 ? 2.40 : 1.90)) * 100) / 100).toFixed(2)}`
                                                    : `-${Number(trade.amount).toFixed(2)}`
                                                }
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden mb-2">
                                        <motion.div
                                            className="h-full shadow-[0_0_10px_currentColor]"
                                            style={{
                                                backgroundColor: statusColor,
                                                color: statusColor,
                                                width: '100%'
                                            }}
                                            animate={{ opacity: [0.5, 1, 0.5] }}
                                            transition={{ repeat: Infinity, duration: 2 }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[7px] font-black uppercase tracking-widest opacity-20 ${isDark ? 'text-white' : 'text-[#05140b]'}`}>Entry</span>
                                            <span className={`text-[9px] font-mono font-black ${isDark ? 'text-white/40' : 'text-[#05140b]/40'}`}>${Number(trade.entryPrice).toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[7px] font-black uppercase tracking-widest opacity-20 ${isDark ? 'text-white' : 'text-[#05140b]'}`}>Now</span>
                                            <span className="text-[9px] font-mono font-black tabular-nums" style={{ color: statusColor }}>
                                                ${current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>

                                    <TradeCountdown timeLeft={trade.timeLeft} isDark={isDark} />

                                    {(trade.status === 'RESOLVING' || trade.status === 'WON' || trade.status === 'LOST' || trade.status === 'PAID') && (
                                        <div className={`absolute inset-0 z-10 backdrop-blur-md ${isDark ? 'bg-black/60 border-white/10' : 'bg-white/60 border-[#3CB371]/10'} flex flex-col items-center justify-center rounded-xl border`}>
                                            {(trade.status === 'WON' || trade.status === 'PAID') && (
                                                <div className="flex flex-col items-center text-[#3CB371] scale-90">
                                                    <Trophy size={20} />
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] mt-1">Won</span>
                                                    {trade.status === 'WON' && (
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <div className="w-2 h-2 rounded-full border border-[#3CB371] border-t-transparent animate-spin" />
                                                            <span className="text-[7px] font-bold uppercase opacity-60 animate-pulse">Payout Pending</span>
                                                        </div>
                                                    )}
                                                    {trade.status === 'PAID' && (
                                                        <span className="text-[7px] font-bold uppercase opacity-80 mt-0.5">Paid</span>
                                                    )}
                                                </div>
                                            )}
                                            {trade.status === 'LOST' && <div className="flex flex-col items-center text-[#FF7F50] opacity-80 scale-90"><AlertCircle size={20} /><span className="text-[9px] font-black uppercase tracking-[0.2em] mt-1">Lost</span></div>}
                                            {trade.status === 'RESOLVING' && (
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-4 h-4 rounded-full border-2 border-[#3CB371] border-t-transparent animate-spin" />
                                                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#3CB371] animate-pulse">Syncing</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
