import React, { memo, useState, useEffect, useMemo, useRef } from 'react';
import { Share2, X, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { Stamp } from './Stamp';

function LiveExecutionComponent({
    activeTrades = [],
    setActiveTrades,
    price,
    setSelectedPnLTrade,
    setIsPnLOpen,
    theme,
    isTruncated = false,
    isExpanded = false,
    setIsExpanded
}) {
    const [tick, setTick] = useState(0);
    const isLight = theme === 'light';

    // Higher frequency clock (100ms) for butter-smooth countdown and precise expiry freezing
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 100);
        return () => clearInterval(interval);
    }, []);

    const removeTrade = (id) => {
        setActiveTrades(prev => prev.filter(t => t.id !== id));
    };

    // Auto-collapse when only 0-1 trades remain
    useEffect(() => {
        if (activeTrades.length <= 1 && isExpanded) {
            setIsExpanded(false);
        }
    }, [activeTrades.length]);

    // Keep track of 'frozen' results to prevent UI flicker during settlement phase
    const frozenPnL = useRef({}); // tradeId -> { status, exitPrice }

    return (
        <div className="flex flex-col gap-1 relative min-h-0 h-full">
            <div className="flex items-center justify-between px-2 flex-none">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3CB371] shadow-[0_0_10px_#3CB371]" />
                    <h4 className={`text-[9px] font-black uppercase tracking-[0.3em] ${isLight ? 'text-black/50' : 'text-white/40'}`}>
                        ACTIVE TRADES
                    </h4>
                    {activeTrades.length > 1 && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg transition-all duration-300 ${isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'}`}
                        >
                            <span className={`text-[7px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                                {isExpanded ? 'Collapse' : 'Expand'}
                            </span>
                            <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                                    <path d="m6 9 6 6 6-6" />
                                </svg>
                            </div>
                        </button>
                    )}
                </div>
                {activeTrades.length > 0 && (
                    <div className="bg-[#3CB371]/10 text-[#3CB371] px-2 py-0.5 rounded-full text-[8px] font-black border border-[#3CB371]/20">
                        {!isExpanded && activeTrades.length > 1
                            ? `+${activeTrades.length - 1} more`
                            : `${activeTrades.length} ACTIVE`}
                    </div>
                )}
            </div>

            <div className={`flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-1 min-h-0`}>
                {activeTrades.length > 0 ? (
                    (() => {
                        // Sort: most recent first
                        const sorted = [...activeTrades].sort((a, b) => (b.startTime || b.id) - (a.startTime || a.id));
                        const visibleTrades = isExpanded ? sorted : [sorted[0]];
                        const othersCount = activeTrades.length - (isExpanded ? activeTrades.length : 1);

                        return (
                            <>
                                {visibleTrades.map((visibleTrade, idx) => (
                                    <div key={visibleTrade.id} className={idx > 0 ? 'opacity-80 scale-95 origin-top transition-all hover:opacity-100 hover:scale-100' : ''}>
                                        {/* Render each trade */}
                                        {(() => {
                                            const trade = visibleTrade;
                                            const now = Date.now();
                                            const start = trade.startTime || (trade.id > 1000000000000 ? trade.id : Math.floor(trade.id / 100) * 1000) || now;
                                            const duration = trade.duration || 30;
                                            const expiryMs = trade.expiry || trade.expiryMs || (start + (duration * 1000));
                                            const rawTimeLeft = Math.max(0, (expiryMs - now) / 1000);

                                            // SMOOTH COUNTDOWN: Always show 1 decimal place below 15s for precision feel
                                            const displayTimeLeft = (rawTimeLeft > 0 && rawTimeLeft <= 15) ? rawTimeLeft.toFixed(1) : Math.ceil(rawTimeLeft);

                                            const timerExpired = rawTimeLeft <= 0;
                                            const isFinal = ["WON", "LOST", "TIMEOUT", "PAYOUT_DELAYED"].includes(trade.status);

                                            const entryPriceVal = parseFloat(trade.entryPrice);
                                            const amountVal = parseFloat(trade.amount);
                                            const currentPriceVal = parseFloat(price);

                                            const multiplier = trade.duration <= 5 ? 6.98 : (trade.duration <= 10 ? 4.98 : 1.98);
                                            const potentialProfit = !isNaN(amountVal) ? (amountVal * multiplier).toFixed(2) : "0.00";

                                            const truncTo3dp = (p) => Math.floor(p * 1000) / 1000;
                                            const isUpTrade = trade.direction === "buy" || trade.direction === "UP" || trade.direction === 1 || String(trade.direction) === "1";

                                            if (timerExpired && !isFinal && !frozenPnL.current[trade.id]) {
                                                const exit3dp = truncTo3dp(currentPriceVal);
                                                const entry3dp = truncTo3dp(entryPriceVal);
                                                const isWin = isUpTrade ? (exit3dp > entry3dp) : (exit3dp < entry3dp);
                                                frozenPnL.current[trade.id] = {
                                                    status: isWin ? "WON" : "LOST",
                                                    exitPrice: currentPriceVal.toFixed(3)
                                                };
                                            }

                                            const liveWinning = !isNaN(currentPriceVal) && !isNaN(entryPriceVal)
                                                ? (isUpTrade ? truncTo3dp(currentPriceVal) > truncTo3dp(entryPriceVal) : truncTo3dp(currentPriceVal) < truncTo3dp(entryPriceVal))
                                                : false;

                                            const showInstantResult = timerExpired && !isFinal;
                                            const frozen = frozenPnL.current[trade.id];
                                            const instantStatus = showInstantResult ? (frozen ? frozen.status : (liveWinning ? "WON" : "LOST")) : trade.status;
                                            const displayFinal = isFinal || showInstantResult;

                                            return (
                                                <div
                                                    className={`rounded-[12px] lg:rounded-[14px] p-1 flex flex-col relative transition-all duration-500 border ${!isExpanded && activeTrades.length === 1 ? 'h-full bg-gradient-to-b from-white/[0.03] to-transparent' : 'h-auto'} ${isLight
                                                        ? 'bg-white border-[#3CB371]/15 shadow-[0_2px_15px_rgba(60,179,113,0.06)]'
                                                        : 'bg-white/[0.02] border-white/5 shadow-2xl'}`}
                                                    style={displayFinal ? {
                                                        borderColor: (instantStatus === "WON" || trade.status === "WON") ? 'rgba(60, 179, 113, 0.4)' : 'rgba(255, 127, 80, 0.4)',
                                                        boxShadow: (instantStatus === "WON" || trade.status === "WON")
                                                            ? '0 0 30px rgba(60, 179, 113, 0.15)'
                                                            : '0 0 30px rgba(255, 127, 80, 0.1)'
                                                    } : {}}
                                                >
                                                    {/* Card Header - Ultra Compact */}
                                                    <div className="flex items-center justify-between mb-0 px-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className={`w-1 h-1 rounded-full ${displayFinal
                                                                ? ((instantStatus === "WON" || trade.status === "WON") ? 'bg-[#3CB371]' : 'bg-[#FF7F50]')
                                                                : 'bg-[#3CB371] animate-pulse shadow-[0_0_8px_#3CB371]'}`} />
                                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/40'}`}>
                                                                {displayFinal ? trade.status : "Live"}
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

                                                    {/* Central Hero Countdown - Tighter vertical scaling */}
                                                    {!displayFinal ? (
                                                        <div className="flex-1 flex flex-col items-center justify-center py-0">
                                                            <div className={`text-xl lg:text-2xl font-matrix tracking-[0.1em] transition-all duration-300 ${isLight ? 'text-black' : 'text-[#3CB371] drop-shadow-[0_0_15px_rgba(60,179,113,0.4)]'}`}>
                                                                {displayTimeLeft}<span className="text-[9px] font-sans font-black italic opacity-40 ml-0.5">s</span>
                                                            </div>
                                                            <div className="mt-0 px-1.5 py-0 rounded-full border border-[#3CB371]/10 bg-[#3CB371]/5 scale-90">
                                                                <span className={`text-[6px] font-black uppercase tracking-[0.2em] ${liveWinning ? "text-[#3CB371]" : "text-[#FF7F50]"}`}>
                                                                    {liveWinning ? "WINNING" : "LOSING"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex-1 flex flex-col items-center justify-center py-1">
                                                            <div className={`text-[10px] font-black uppercase tracking-widest ${(instantStatus === "WON" || trade.status === "WON") ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>
                                                                {(instantStatus === "WON" || trade.status === "WON") ? "Trade Won" : "Trade Lost"}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className={`text-base lg:text-lg font-matrix tracking-widest ${(instantStatus === "WON" || trade.status === "WON") ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>
                                                                    {(instantStatus === "WON" || trade.status === "WON") ? `+$${trade.payout || potentialProfit}` : "0.000"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Data Footer - Minimal Height */}
                                                    <div className={`mt-auto pt-1 border-t ${isLight ? 'border-black/5' : 'border-white/5'}`}>
                                                        <div className="flex items-center justify-between mb-0.5 px-0.5">
                                                            <div className="flex items-center gap-1">
                                                                <span className={`text-[6px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Entry:</span>
                                                                <span className={`text-[8px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>
                                                                    {!isNaN(entryPriceVal) ? `$${entryPriceVal}` : "..."}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <span className={`text-[6px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Stake:</span>
                                                                <span className={`text-[8px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{Number(trade.amount).toFixed(2)}</span>
                                                            </div>
                                                        </div>

                                                        {displayFinal && (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedPnLTrade(trade);
                                                                    setIsPnLOpen(true);
                                                                }}
                                                                className={`mt-0.5 w-full py-1 rounded-lg text-[8px] font-black uppercase tracking-[0.2em] transition-all shadow-lg ${isLight ? 'bg-black text-white' : 'bg-[#3CB371] text-white hover:brightness-110'}`}
                                                            >
                                                                Share Result
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ))}

                                {othersCount > 0 && !isExpanded && (
                                    <button
                                        onClick={() => setIsExpanded(true)}
                                        className={`w-full mt-1 py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 transition-all hover:scale-[0.99] active:scale-95 ${isLight ? 'bg-black/5 border-black/10 text-black/50' : 'bg-white/5 border-white/10 text-white/40'}`}
                                    >
                                        <div className="w-1 h-1 rounded-full bg-[#3CB371] animate-pulse" />
                                        <span className="text-[7px] font-black uppercase tracking-widest">
                                            +{othersCount} more
                                        </span>
                                    </button>
                                )}
                            </>
                        );
                    })()
                ) : (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-20">
                        <div className="text-[9px] uppercase font-black tracking-[0.4em] mb-2">
                            Awaiting Signal
                        </div>
                        <div className="w-16 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    </div>
                )}
            </div>
        </div>
    );
};

export const LiveExecution = memo(LiveExecutionComponent);
