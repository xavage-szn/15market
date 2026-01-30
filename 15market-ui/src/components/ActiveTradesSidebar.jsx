import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Timer, Trophy, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const GREEN_COLOR = "#3CB371";
const RED_COLOR = "#FF4444";

export function ActiveTradesSidebar({ activeTrades, price, theme = 'dark', network = 'solana', currentPrice, setSelectedPnLTrade, setIsPnLOpen }) {
    const isDark = theme !== 'light';

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-transparent">
            {/* Sleek Header */}
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3CB371] shadow-[0_0_10px_#3CB371]" />
                    <span className={`text-[9px] uppercase font-black tracking-[0.3em] ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
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
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="h-full flex flex-col items-center justify-center text-center opacity-20 gap-2"
                        >
                            <span className="text-[9px] font-black uppercase tracking-[0.4em]">Ready</span>
                            <div className="w-12 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                        </motion.div>
                    ) : (
                        activeTrades.map((trade) => {
                            const isLong = trade.direction === "buy" || trade.direction === "up" || trade.direction === "UP";
                            const entry = parseFloat(trade.entryPrice);
                            const current = parseFloat(currentPrice || price);

                            // Calculate PnL status
                            let isWinning = false;
                            if (current > 0) {
                                isWinning = isLong ? (current >= entry) : (current <= entry);
                            }

                            // Theme Colors
                            const activeGreen = network === 'solana' ? "#3CB371" : "#3B82F6";
                            const statusColor = isWinning ? activeGreen : RED_COLOR;

                            return (
                                <motion.div
                                    key={trade.id}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    onClick={() => {
                                        if (setSelectedPnLTrade && setIsPnLOpen) {
                                            setSelectedPnLTrade(trade);
                                            setIsPnLOpen(true);
                                        }
                                    }}
                                    className={`relative rounded-xl border p-3 transition-all group cursor-pointer hover:brightness-110 active:scale-[0.98] ${isWinning ? 'bg-white/[0.03] border-white/5' : 'bg-white/[0.01] border-white/5'
                                        }`}
                                >
                                    {/* Card Header */}
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-lg ${isLong ? 'bg-[#3CB371]/10' : 'bg-[#FF7F50]/10'}`}>
                                                {isLong
                                                    ? <ArrowUp size={12} color={GREEN_COLOR} strokeWidth={3} />
                                                    : <ArrowDown size={12} color="#FF7F50" strokeWidth={3} />
                                                }
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-black uppercase tracking-tight text-white">
                                                    {trade.direction === "buy" ? "CALL" : "PUT"}
                                                </div>
                                                <div className="text-[7px] font-bold opacity-30 tracking-widest uppercase">
                                                    {network.toUpperCase()}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black tracking-tight text-white">
                                                {trade.amount} {network === 'solana' ? 'SOL' : 'USDC'}
                                            </div>
                                            <div className="text-[8px] font-black uppercase tracking-widest" style={{ color: statusColor }}>
                                                {isWinning ? 'WIN' : 'LOSS'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Visual Status Indicator */}
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

                                    {/* Footer Stats */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[7px] font-black uppercase tracking-widest opacity-20 text-white">Entry</span>
                                            <span className="text-[9px] font-mono font-black text-white/40">${trade.entryPrice}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[7px] font-black uppercase tracking-widest opacity-20 text-white">Now</span>
                                            <span className="text-[9px] font-mono font-black tabular-nums" style={{ color: statusColor }}>
                                                ${current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Finality Overlay */}
                                    {(trade.status === 'RESOLVING' || trade.status === 'WON' || trade.status === 'LOST') && (
                                        <div className="absolute inset-0 z-10 backdrop-blur-md bg-black/60 flex flex-col items-center justify-center rounded-xl border border-white/10">
                                            {trade.status === 'WON' && <div className="flex flex-col items-center text-[#3CB371] scale-90"><Trophy size={20} /><span className="text-[9px] font-black uppercase tracking-[0.2em] mt-1">Won</span></div>}
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
