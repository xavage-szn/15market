import React, { memo, useState, useEffect } from 'react';
import { Share2, X } from 'lucide-react';
import { Stamp } from './Stamp';

const LiveExecutionComponent = ({
    activeTrades = [],
    setActiveTrades,
    price,
    setSelectedPnLTrade,
    setIsPnLOpen,
    theme
}) => {
    const [, setTick] = useState(0);
    const isLight = theme === 'light';

    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const removeTrade = (id) => {
        setActiveTrades(prev => prev.filter(t => t.id !== id));
    };

    return (
        <div className="flex flex-col gap-3 relative min-h-0 h-full">
            <div className="flex items-center justify-between px-2 flex-none">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3CB371] shadow-[0_0_10px_#3CB371]" />
                    <h4 className={`text-[9px] font-black uppercase tracking-[0.3em] ${isLight ? 'text-black/50' : 'text-white/40'}`}>
                        LIVE ENGINES
                    </h4>
                </div>
                {activeTrades.length > 0 && (
                    <div className="bg-[#3CB371]/10 text-[#3CB371] px-2 py-0.5 rounded-md text-[8px] font-black border border-[#3CB371]/20">
                        {activeTrades.length} ACTIVE
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3 min-h-0">
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
                                className={`rounded-xl lg:rounded-2xl p-2 lg:p-3 flex flex-col relative transition-all duration-300 border ${isFinal ? 'opacity-40' : ''} ${isLight
                                    ? 'bg-white border-black/5 shadow-md'
                                    : 'bg-white/[0.02] border-white/5 shadow-xl'}`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${isFinal ? (isLight ? 'bg-black/10' : 'bg-white/10') : 'bg-[#3CB371] animate-pulse shadow-[0_0_10px_#3CB371]'}`} />
                                        <span className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-black/50' : 'text-white/40'}`}>
                                            {isFinal ? trade.status : isResolving ? "Syncing..." : "Monitoring"}
                                        </span>
                                    </div>
                                    {isFinal && (
                                        <button
                                            onClick={() => removeTrade(trade.id)}
                                            className={`p-1 rounded-full transition-colors ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/40' : 'bg-white/5 hover:bg-white/10 text-white/40'}`}
                                        >
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-1 lg:gap-2 mb-2 lg:mb-3">
                                    <div className={`p-1.5 lg:p-2 rounded-xl border ${isLight ? 'bg-black/5 border-black/5' : 'bg-black/40 border-white/5'}`}>
                                        <div className="flex justify-between items-center mb-0.5">
                                            <p className={`text-[5px] lg:text-[6px] font-black uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/20'}`}>Entry</p>
                                        </div>
                                        <p className={`text-[10px] lg:text-xs font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>${trade.entryPrice}</p>
                                    </div>
                                    <div className={`p-1.5 lg:p-2 rounded-xl border ${isLight ? 'bg-black/5 border-black/5' : 'bg-black/40 border-white/5'}`}>
                                        <p className={`text-[5px] lg:text-[6px] font-black uppercase tracking-widest mb-0.5 ${isLight ? 'text-black/30' : 'text-white/20'}`}>Stake</p>
                                        <p className={`text-[10px] lg:text-xs font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{trade.amount}</p>
                                    </div>
                                </div>

                                <div className={`rounded-xl flex flex-col items-center justify-center p-3 transition-all duration-500 overflow-hidden relative ${trade.status === "WON" ? "bg-[#3CB371]/10 border border-[#3CB371]/20" :
                                    trade.status === "LOST" ? "bg-[#FF7F50]/10 border border-[#FF7F50]/20" :
                                        (isLight ? "bg-black/5 border-black/5" : "bg-white/[0.02] border border-white/5")
                                    }`}>
                                    {!isFinal ? (
                                        <>
                                            <div className={`text-lg lg:text-2xl font-black mb-1 tracking-tighter tabular-nums flex items-baseline ${isLight ? 'text-black' : 'text-white'}`}>
                                                {timeLeft}<span className={`text-[7px] lg:text-[10px] ml-0.5 font-bold italic ${isLight ? 'text-black/20' : 'text-white/10'}`}>s</span>
                                            </div>

                                            <div className={`mb-1.5 lg:mb-2 px-2 lg:px-3 py-0.5 lg:py-1 rounded-full border ${isLight ? 'bg-white border-black/10' : 'bg-white/5 border-white/10'}`}>
                                                <span className={`text-[6px] lg:text-[8px] font-black uppercase tracking-[0.2em] ${(trade.direction === "buy" ? parseFloat(price) >= parseFloat(trade.entryPrice) : parseFloat(price) <= parseFloat(trade.entryPrice))
                                                    ? "text-[#3CB371]" : "text-[#FF7F50]"
                                                    }`}>
                                                    {(trade.direction === "buy" ? parseFloat(price) >= parseFloat(trade.entryPrice) : parseFloat(price) <= parseFloat(trade.entryPrice))
                                                        ? "WIN" : "LOSS"
                                                    }
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1 opacity-60 mb-2 lg:mb-3">
                                                <span className={`text-[6px] lg:text-[7px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/30'}`}>Profit:</span>
                                                <span className={`text-[8px] lg:text-[10px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`} style={{ color: '#3CB371' }}>
                                                    +{(parseFloat(trade.amount) * (trade.duration <= 5 ? 6.98 : (trade.duration <= 10 ? 4.98 : 1.98))).toFixed(2)}
                                                </span>
                                            </div>

                                            {isResolving ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-4 h-4 rounded-full border-2 border-[#3CB371] border-t-transparent animate-spin" />
                                                    <span className="text-[7px] font-black text-[#3CB371] uppercase tracking-[0.2em] animate-pulse">Finalizing</span>
                                                </div>
                                            ) : (
                                                <div className={`w-full h-1 rounded-full overflow-hidden ${isLight ? 'bg-black/10' : 'bg-white/5'}`}>
                                                    <div
                                                        className="h-full bg-[#3CB371] transition-all duration-1000 ease-linear shadow-[0_0_15px_#3CB371]"
                                                        style={{ width: `${(timeLeft / trade.duration) * 100}%` }}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 w-full">
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
                                                className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#3CB371]/10 hover:bg-[#3CB371]/20 border border-[#3CB371]/20 rounded-xl text-[8px] font-black uppercase tracking-[0.2em] transition-all text-[#3CB371]"
                                            >
                                                <Share2 size={10} />
                                                Share
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-20">
                        <div className="text-[9px] uppercase font-black tracking-[0.4em] mb-2">
                            Awaiting Signal
                        </div>
                        <div className="w-16 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    </div>
                )}
            </div>

            <div className={`p-2.5 rounded-xl border flex items-center justify-between flex-none ${isLight ? 'bg-white border-black/5 shadow-md' : 'bg-white/[0.02] border-white/5'}`}>
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#3CB371]/10 flex items-center justify-center text-[10px]">⚡</div>
                    <div>
                        <p className={`text-[6px] font-black uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/20'}`}>ENGINE STATUS</p>
                        <p className="text-[7px] text-[#3CB371] font-black tracking-widest uppercase">V2 ACTIVE</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className={`text-[6px] font-black uppercase tracking-widest ${isLight ? 'text-black/20' : 'text-white/20'}`}>NETWORK</p>
                    <p className={`text-[7px] font-black tabular-nums ${isLight ? 'text-black/60' : 'text-white/60'}`}>SYNCHRONIZED</p>
                </div>
            </div>
        </div >
    );
};

export const LiveExecution = memo(LiveExecutionComponent);
