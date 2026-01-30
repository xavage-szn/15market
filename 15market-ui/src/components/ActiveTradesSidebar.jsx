import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Timer, Trophy, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ActiveTradesSidebar({ activeTrades, price, theme = 'dark', network = 'solana', currentPrice, setSelectedPnLTrade, setIsPnLOpen }) {
    const isDark = theme !== 'light';

    // Theme Colors
    const GREEN = network === 'solana' ? "#3CB371" : "#3B82F6";
    const RED = "#FF4444";

    return (
        <div className="w-full h-full flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <span className={`text-[10px] uppercase font-black tracking-widest ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                    Active Positions
                </span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[9px] font-bold text-white/80">{activeTrades.length} Live</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 thin-scrollbar">
                <AnimatePresence>
                    {activeTrades.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="h-full flex flex-col items-center justify-center text-center opacity-30 gap-3"
                        >
                            <div className="p-4 rounded-full bg-white/5">
                                <Timer size={24} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-widest">No Active Trades</span>
                        </motion.div>
                    ) : (
                        activeTrades.map((trade) => {
                            const isLong = trade.direction === "buy" || trade.direction === "UP";
                            const entry = parseFloat(trade.entryPrice);
                            const current = parseFloat(currentPrice || price);

                            // Calculate PnL status
                            let isWinning = false;
                            if (current > 0) {
                                isWinning = isLong ? (current >= entry) : (current <= entry);
                            }

                            // Status-based styling
                            const statusColor = isWinning ? GREEN : RED;
                            const glowClass = isWinning
                                ? (network === 'solana' ? 'shadow-[0_0_15px_rgba(60,179,113,0.15)]' : 'shadow-[0_0_15px_rgba(59,130,246,0.15)]')
                                : 'shadow-[0_0_15px_rgba(255,68,68,0.15)]';

                            return (
                                <motion.div
                                    key={trade.id}
                                    layout
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    onClick={() => {
                                        if (setSelectedPnLTrade && setIsPnLOpen) {
                                            setSelectedPnLTrade(trade);
                                            setIsPnLOpen(true);
                                        }
                                    }}
                                    className={`relative rounded-xl border p-3 transition-all ${glowClass} group cursor-pointer hover:scale-[1.02] active:scale-[0.98]`}
                                    style={{
                                        background: isWinning
                                            ? (network === 'solana' ? 'rgba(60, 179, 113, 0.05)' : 'rgba(59, 130, 246, 0.05)')
                                            : 'rgba(255, 68, 68, 0.05)',
                                        borderColor: isWinning
                                            ? (network === 'solana' ? 'rgba(60, 179, 113, 0.3)' : 'rgba(59, 130, 246, 0.3)')
                                            : 'rgba(255, 68, 68, 0.3)'
                                    }}
                                >
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-lg ${isLong ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                                                {isLong
                                                    ? <ArrowUp size={12} color={GREEN} strokeWidth={3} />
                                                    : <ArrowDown size={12} color={RED} strokeWidth={3} />
                                                }
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-black uppercase tracking-wider text-white">
                                                    {trade.network === 'solana' ? 'SOL/USD' : 'BTC/USD'}
                                                </div>
                                                <div className="text-[9px] font-bold opacity-50 flex items-center gap-1">
                                                    #{trade.id.toString().slice(-4)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black tracking-wider text-white">
                                                ${trade.amount}
                                            </div>
                                            <div className="text-[9px] font-bold" style={{ color: statusColor }}>
                                                {isWinning ? '+85%' : '-100%'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="relative w-full h-1 bg-black/20 rounded-full overflow-hidden mb-2">
                                        {/* Timer Logic would go here to animate width */}
                                        <div className="absolute inset-y-0 left-0 bg-white/20 w-1/2 animate-pulse" />
                                    </div>

                                    {/* Footer Details */}
                                    <div className="flex items-center justify-between text-[9px] font-mono font-bold opacity-70">
                                        <span className="text-white/40">Entry: {trade.entryPrice}</span>
                                        <span style={{ color: parseFloat(current) > entry ? GREEN : RED }}>
                                            Now: {current || '---'}
                                        </span>
                                    </div>

                                    {/* Result Overlay (if resolving) */}
                                    {(trade.status === 'RESOLVING' || trade.status === 'WON' || trade.status === 'LOST') && (
                                        <div className="absolute inset-0 z-10 backdrop-blur-md bg-black/40 flex items-center justify-center rounded-xl">
                                            {trade.status === 'WON' && <div className="flex flex-col items-center animate-bounce text-green-400"><Trophy size={20} /><span className="text-[10px] font-black uppercase mt-1">Won</span></div>}
                                            {trade.status === 'LOST' && <div className="flex flex-col items-center text-red-500"><AlertCircle size={20} /><span className="text-[10px] font-black uppercase mt-1">Lost</span></div>}
                                            {trade.status === 'RESOLVING' && <div className="text-[9px] font-bold uppercase tracking-widest text-white animate-pulse">Resolving...</div>}
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
