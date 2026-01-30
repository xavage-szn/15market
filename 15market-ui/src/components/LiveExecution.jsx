import React, { memo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Share2, X } from 'lucide-react';
import { Stamp } from './Stamp';

const LiveExecutionComponent = ({
    activeTrades = [],
    setActiveTrades,
    price,
    setSelectedPnLTrade,
    setIsPnLOpen,
    currentNetwork,
    theme
}) => {
    const [, setTick] = useState(0);
    const isLight = theme === 'light';

    // Local ticker to update all countdowns every second
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const removeTrade = (id) => {
        setActiveTrades(prev => prev.filter(t => t.id !== id));
    };

    return (
        <div className="col-span-1 lg:col-span-12 xl:col-span-5 flex flex-col gap-1.5 lg:gap-4 relative min-h-[250px] lg:min-h-[400px]">
            <div className="flex items-center justify-between px-1 lg:px-2">
                <h4 className={`text-[10px] lg:text-[11px] font-black uppercase tracking-[0.2em] ${isLight ? '!text-black/50' : 'text-white/40'}`}>
                    <span className="hidden lg:inline">Live Engines</span>
                    <span className="lg:hidden text-[10px] tracking-[0.3em]">Bets</span>
                </h4>
                <div className="bg-[#3CB371]/20 text-[#3CB371] px-1.5 lg:px-2 py-0.5 rounded text-[8px] lg:text-[10px] font-bold">
                    {activeTrades.length} <span className="hidden lg:inline">ACTIVE</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 lg:pr-2 custom-scrollbar space-y-2 lg:space-y-4 max-h-[400px] lg:max-h-[550px]">
                {activeTrades.length > 0 ? (
                    activeTrades.map((trade) => {
                        const now = Date.now();
                        const start = trade.startTime || (trade.nonce > 1000000000000 ? trade.nonce : Math.floor(trade.nonce / 100) * 1000);
                        const elapsed = Math.floor((now - start) / 1000);
                        const timeLeft = Math.max(0, trade.duration - elapsed);
                        const isResolving = trade.status === "RESOLVING" || (timeLeft === 0 && trade.status === "PENDING");
                        const isFinal = ["WON", "LOST", "TIMEOUT", "PAYOUT_DELAYED"].includes(trade.status);

                        return (
                            <div
                                key={trade.id}
                                className={`rounded-2xl p-5 flex flex-col relative transition-all duration-300 ${isFinal ? 'opacity-40' : ''} ${isLight
                                    ? 'bg-white border border-black/5'
                                    : 'bg-[#0a0a0a] border border-white/5'}`}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${isFinal ? (isLight ? 'bg-black/10' : 'bg-white/10') : 'bg-[#3CB371] animate-pulse'}`} />
                                        <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                                            {isFinal ? trade.status : isResolving ? "Resolving..." : "Monitoring"}
                                        </span>
                                    </div>
                                    {isFinal && (
                                        <button
                                            onClick={() => removeTrade(trade.id)}
                                            className={`p-1 rounded-full transition-colors ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/40' : 'bg-white/5 hover:bg-white/10 text-white/40'}`}
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-1.5 lg:gap-3 mb-2 lg:mb-4">
                                    <div className={`p-1 lg:p-2 rounded-lg lg:rounded-xl border ${isLight ? 'bg-black/5 border-black/5' : 'bg-black/40 border-white/5'}`}>
                                        <div className="flex justify-between items-center mb-0.5 lg:mb-1">
                                            <p className={`text-[6px] lg:text-[7px] font-bold uppercase ${isLight ? 'text-black/30' : 'text-white/20'}`}>Entry</p>
                                            <p className={`text-[6px] lg:text-[7px] font-black ${trade.direction === "buy" ? "text-[#3CB371]" : "text-[#FF7F50]"}`}>{trade.direction === "buy" ? "CALL" : "PUT"}</p>
                                        </div>
                                        <p className={`text-[10px] lg:text-xs font-black tabular-nums ${isLight ? 'text-black/80' : 'text-white'}`}>${trade.entryPrice}</p>
                                    </div>
                                    <div className={`p-1 lg:p-2 rounded-lg lg:rounded-xl border ${isLight ? 'bg-black/5 border-black/5' : 'bg-black/40 border-white/5'}`}>
                                        <p className={`text-[6px] lg:text-[7px] font-bold uppercase mb-0.5 lg:mb-1 ${isLight ? 'text-black/30' : 'text-white/20'}`}>Stake</p>
                                        <p className={`text-[10px] lg:text-xs font-black tabular-nums ${isLight ? 'text-black/80' : 'text-white'}`}>{trade.amount}</p>
                                    </div>
                                </div>

                                <div className={`rounded-xl flex flex-col items-center justify-center p-4 transition-all duration-500 ${trade.status === "WON" ? "bg-[#3CB371]/10 border border-[#3CB371]/20 shadow-[inset_0_0_20px_rgba(60,179,113,0.1)]" :
                                    trade.status === "LOST" ? "bg-[#FF7F50]/10 border border-[#FF7F50]/20" :
                                        (isLight ? "bg-black/5 border-black/5" : "bg-black/20 border border-white/5")
                                    }`}>
                                    {!isFinal ? (
                                        <>
                                            <div className={`text-2xl lg:text-4xl font-black mb-0.5 lg:mb-1 tracking-tighter tabular-nums flex items-baseline ${isLight ? '!text-black' : 'text-white'}`}>
                                                {timeLeft}<span className={`text-[10px] lg:text-sm ml-0.5 font-bold italic ${isLight ? '!text-black/20' : 'text-white/10'}`}>s</span>
                                            </div>

                                            <div className={`mb-2 px-3 py-1 rounded-full border ${isLight ? 'bg-white border-black/10' : 'bg-white/5 border-white/10'}`}>
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${(trade.direction === "buy" ? parseFloat(price) > parseFloat(trade.entryPrice) : parseFloat(price) < parseFloat(trade.entryPrice))
                                                    ? "text-[#3CB371]" : "text-[#FF7F50]"
                                                    }`}>
                                                    {(trade.direction === "buy" ? parseFloat(price) > parseFloat(trade.entryPrice) : parseFloat(price) < parseFloat(trade.entryPrice))
                                                        ? "WINNING" : "LOSING"
                                                    }
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 opacity-60">
                                                <span className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/30'}`}>Payout:</span>
                                                <span className={`text-[10px] font-black tabular-nums ${isLight ? 'text-black/80' : 'text-white'}`}>
                                                    {(parseFloat(trade.amount) * (trade.duration <= 5 ? 6.98 : (trade.duration <= 10 ? 4.98 : 1.98))).toFixed(4)}
                                                </span>
                                            </div>

                                            {isResolving ? (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="w-3 h-3 rounded-full border-2 border-t-[#3CB371] border-white/10 animate-spin" />
                                                    <span className="text-[8px] font-black text-[#3CB371] uppercase animate-pulse">On-Chain Finality</span>
                                                </div>
                                            ) : (
                                                <div className={`w-full h-1 rounded-full mt-2 overflow-hidden ${isLight ? 'bg-black/10' : 'bg-white/5'}`}>
                                                    <div className="h-full bg-[#3CB371] shadow-[0_0_10px_#3CB371]" style={{ width: `${(timeLeft / trade.duration) * 100}%` }} />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center gap-3 w-full">
                                            <Stamp
                                                status={trade.status}
                                                isWon={trade.status === "WON"}
                                                size="sm"
                                            />
                                            <button
                                                onClick={() => {
                                                    setSelectedPnLTrade(trade);
                                                    setIsPnLOpen(true);
                                                }}
                                                className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#3CB371]/10 hover:bg-[#3CB371]/20 border border-[#3CB371]/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                                            >
                                                <Share2 size={10} className="text-[#3CB371]" />
                                                Share Signal
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className={`flex-1 rounded-[24px] border flex flex-col items-center justify-center p-12 text-center ${isLight ? 'bg-white border-black/5 shadow-inner' : 'border-white/5 bg-black/20 opacity-40'}`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                            <img src="/logo.png" alt="15market" className={`h-6 w-auto ${isLight ? 'invert opacity-20' : 'grayscale'}`} />
                        </div>
                        <p className={`text-[10px] uppercase tracking-[0.2em] font-black ${isLight ? 'text-black/30' : 'text-white/40'}`}>Waiting for Orders</p>
                    </div>
                )}
            </div>

            <div className={`p-2 lg:p-3 rounded-[20px] border flex items-center justify-between ${isLight ? '!bg-white border-black/5 !shadow-lg' : 'bg-[#111] border-white/5'}`}>
                <div className="flex items-center gap-1 lg:gap-2">
                    <div className="w-5 h-5 lg:w-6 lg:h-6 rounded-lg bg-[#3CB371]/10 flex items-center justify-center text-[10px]">⚖️</div>
                    <div className="hidden lg:block">
                        <p className={`text-[7px] font-black uppercase tracking-tighter ${isLight ? 'text-black/30' : 'text-white/40'}`}>System Flow</p>
                        <p className="text-[7px] text-[#3CB371] font-mono tracking-widest">MULTI-BET ENABLED</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className={`text-[6px] lg:text-[7px] font-black uppercase tracking-tighter ${isLight ? 'text-black/20' : 'text-white/20'}`}>Oracle</p>
                    <p className={`text-[7px] lg:text-[8px] font-black tabular-nums ${isLight ? 'text-black/60' : 'text-white/60'}`}>PYTH+RAY</p>
                </div>
            </div>
        </div>
    );
};

export const LiveExecution = memo(LiveExecutionComponent);
