import React, { memo, useState, useEffect, useMemo, useRef } from 'react';
import { Share2, X, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { Stamp } from './Stamp';

function LiveExecutionComponent({
    activeTrades = [],
    setActiveTrades,
    price,
    setSelectedPnLTrade,
    setIsPnLOpen,
    theme
}) {
    const [tick, setTick] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const isLight = theme === 'light';

    // Higher frequency clock (100ms) for butter-smooth countdown and precise expiry freezing
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 100);
        return () => clearInterval(interval);
    }, []);

    const removeTrade = (id) => {
        setActiveTrades(prev => prev.filter(t => t.id !== id));
    };

    // Keep track of 'frozen' results to prevent UI flicker during settlement phase
    const frozenPnL = useRef({}); // tradeId -> { status, exitPrice }

    return (
        <div className="flex flex-col gap-3 relative min-h-0 h-full">
            <div className="flex items-center justify-between px-2 flex-none">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3CB371] shadow-[0_0_10px_#3CB371]" />
                    <h4 className={`text-[9px] font-black uppercase tracking-[0.3em] ${isLight ? 'text-black/50' : 'text-white/40'}`}>
                        ACTIVE TRADES
                    </h4>
                </div>
                {activeTrades.length > 0 && (
                    <div className="bg-[#3CB371]/10 text-[#3CB371] px-2 py-0.5 rounded-full text-[8px] font-black border border-[#3CB371]/20">
                        {activeTrades.length} ACTIVE
                    </div>
                )}
            </div>

            <div className={`flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3 min-h-0 ${isExpanded ? 'max-h-[500px]' : ''}`}>
                {activeTrades.length > 0 ? (
                    (() => {
                        const visibleTrades = isExpanded ? activeTrades : [activeTrades[0]];
                        const othersCount = activeTrades.length - 1;

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

                                            const multiplier = duration <= 5 ? 6.98 : (duration <= 10 ? 4.98 : 1.98);
                                            const potentialProfit = !isNaN(amountVal) ? (amountVal * multiplier).toFixed(2) : "0.00";

                                            // INSTANT RESULT: 3dp truncation rule for win/loss
                                            const truncTo3dp = (p) => Math.floor(p * 1000) / 1000;
                                            const isUpTrade = trade.direction === "buy" || trade.direction === "UP" || trade.direction === 1 || String(trade.direction) === "1";

                                            // FREEZE LOGIC: Capture result at exactly 0.0s to prevent flicker
                                            if (timerExpired && !isFinal && !frozenPnL.current[trade.id]) {
                                                const exit3dp = truncTo3dp(currentPriceVal);
                                                const entry3dp = truncTo3dp(entryPriceVal);
                                                const isWin = isUpTrade ? (exit3dp > entry3dp) : (exit3dp < entry3dp);
                                                frozenPnL.current[trade.id] = {
                                                    status: isWin ? "WON" : "LOST",
                                                    exitPrice: currentPriceVal.toFixed(3)
                                                };
                                                console.log(`❄️ [UI] Froze result for ${trade.id}: ${frozenPnL.current[trade.id].status} @ ${frozenPnL.current[trade.id].exitPrice}`);
                                            }

                                            const liveWinning = !isNaN(currentPriceVal) && !isNaN(entryPriceVal)
                                                ? (isUpTrade ? truncTo3dp(currentPriceVal) > truncTo3dp(entryPriceVal) : truncTo3dp(currentPriceVal) < truncTo3dp(entryPriceVal))
                                                : false;

                                            // Use frozen result if available, otherwise fallback to live calculation
                                            const showInstantResult = timerExpired && !isFinal;
                                            const frozen = frozenPnL.current[trade.id];
                                            const instantStatus = showInstantResult ? (frozen ? frozen.status : (liveWinning ? "WON" : "LOST")) : trade.status;
                                            const displayFinal = isFinal || showInstantResult;

                                            return (
                                                <div
                                                    className={`rounded-xl lg:rounded-2xl p-2 lg:p-3 flex flex-col relative transition-all duration-300 border ${isLight
                                                        ? 'bg-white border-[#3CB371]/15 shadow-[0_4px_20px_rgba(60,179,113,0.08)]'
                                                        : 'bg-white/[0.02] border-white/5 shadow-xl'}`}
                                                    style={displayFinal ? {
                                                        borderColor: (instantStatus === "WON" || trade.status === "WON") ? 'rgba(60, 179, 113, 0.4)' : 'rgba(255, 127, 80, 0.4)',
                                                        boxShadow: (instantStatus === "WON" || trade.status === "WON")
                                                            ? '0 0 20px rgba(60, 179, 113, 0.15)'
                                                            : '0 0 20px rgba(255, 127, 80, 0.1)'
                                                    } : {}}
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${displayFinal
                                                                ? ((instantStatus === "WON" || trade.status === "WON") ? 'bg-[#3CB371]' : 'bg-[#FF7F50]')
                                                                : 'bg-[#3CB371] animate-pulse shadow-[0_0_10px_#3CB371]'}`} />
                                                            <span className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-black/50' : 'text-white/40'}`}>
                                                                {displayFinal
                                                                    ? (showInstantResult ? "SETTLED" : trade.status)
                                                                    : "Monitoring"
                                                                }
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
                                                            <p className={`text-[10px] lg:text-xs font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>
                                                                {!isNaN(entryPriceVal) ? `$${entryPriceVal}` : "..."}
                                                            </p>
                                                        </div>
                                                        <div className={`p-1.5 lg:p-2 rounded-xl border ${isLight ? 'bg-black/5 border-black/5' : 'bg-black/40 border-white/5'}`}>
                                                            <p className={`text-[5px] lg:text-[6px] font-black uppercase tracking-widest mb-0.5 ${isLight ? 'text-black/30' : 'text-white/20'}`}>Stake</p>
                                                            <p className={`text-[10px] lg:text-xs font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{trade.amount}</p>
                                                        </div>
                                                    </div>

                                                    <div className={`rounded-xl flex flex-col items-center justify-center p-3 transition-all duration-300 overflow-hidden relative ${(instantStatus === "WON" || trade.status === "WON") && displayFinal
                                                        ? "bg-[#3CB371]/10 border border-[#3CB371]/20"
                                                        : (instantStatus === "LOST" || trade.status === "LOST") && displayFinal
                                                            ? "bg-[#FF7F50]/10 border border-[#FF7F50]/20"
                                                            : (isLight ? "bg-black/5 border-black/5" : "bg-white/[0.02] border border-white/5")
                                                        }`}>
                                                        {!displayFinal ? (
                                                            <>
                                                                <div className={`text-4xl lg:text-5xl font-matrix mb-1 tracking-[0.2em] flex items-baseline ${isLight ? 'text-black' : 'text-[#3CB371]'}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                                                                    {displayTimeLeft}<span className={`text-[10px] lg:text-[12px] ml-2 font-sans font-black italic opacity-50 ${isLight ? 'text-black/40' : 'text-white/40'}`}>s</span>
                                                                </div>

                                                                <div className={`mb-1.5 lg:mb-2 px-2 lg:px-3 py-0.5 lg:py-1 rounded-full border ${isLight ? 'bg-white border-black/10' : 'bg-white/5 border-white/10'}`}>
                                                                    <span className={`text-[6px] lg:text-[8px] font-black uppercase tracking-[0.2em] ${liveWinning ? "text-[#3CB371]" : "text-[#FF7F50]"}`}>
                                                                        {liveWinning ? "WIN" : "LOSS"}
                                                                    </span>
                                                                </div>

                                                                <div className="flex items-center gap-1 opacity-60 mb-2 lg:mb-3">
                                                                    <span className={`text-[6px] lg:text-[7px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/30'}`}>Profit:</span>
                                                                    <span className={`text-[8px] lg:text-[10px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`} style={{ color: '#3CB371' }}>
                                                                        +{potentialProfit}
                                                                    </span>
                                                                </div>

                                                                <div className={`w-full h-1 rounded-full overflow-hidden ${isLight ? 'bg-black/10' : 'bg-white/5'}`}>
                                                                    <div
                                                                        className="h-full bg-[#3CB371] transition-all duration-200 ease-linear shadow-[0_0_15px_#3CB371]"
                                                                        style={{ width: `${(rawTimeLeft / duration) * 100}%` }}
                                                                    />
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-2 w-full">
                                                                <Stamp
                                                                    status={isFinal ? trade.status : instantStatus}
                                                                    isWon={(isFinal ? trade.status : instantStatus) === "WON"}
                                                                    size="sm"
                                                                />
                                                                {(isFinal ? trade.status : instantStatus) === "WON" && (
                                                                    <div className="flex items-center gap-1.5 animate-pulse">
                                                                        <Zap size={10} className="text-[#3CB371]" />
                                                                        <span className="text-[9px] font-black text-[#3CB371] tracking-wider">
                                                                            +{trade.payout || potentialProfit} USDC
                                                                        </span>
                                                                    </div>
                                                                )}
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
                                        })()}
                                    </div>
                                ))}

                                {othersCount > 0 && (
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className={`w-full mt-2 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all hover:scale-[0.99] active:scale-95 ${isExpanded
                                            ? 'bg-[#3CB371]/10 border-[#3CB371]/30 text-[#3CB371]'
                                            : isLight ? 'bg-black/5 border-black/10 text-black/60 shadow-inner' : 'bg-white/5 border-white/10 text-white/50'}`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full ${isExpanded ? 'bg-[#3CB371]' : 'bg-[#3CB371] animate-pulse'}`} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">
                                            {isExpanded
                                                ? 'COLLAPSE ACTIVE TRADES'
                                                : `Show +${othersCount} more active trade${othersCount > 1 ? 's' : ''}`
                                            }
                                        </span>
                                        <div className={`ml-auto transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                            <Zap size={10} />
                                        </div>
                                    </button>
                                )}
                            </>
                        );
                    })()
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
                        <p className="text-[7px] text-[#3CB371] font-black tracking-widest uppercase">V3 INSTANT</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className={`text-[6px] font-black uppercase tracking-widest ${isLight ? 'text-black/20' : 'text-white/20'}`}>SETTLEMENT</p>
                    <p className={`text-[7px] font-black tabular-nums ${isLight ? 'text-black/60' : 'text-white/60'}`}>REAL-TIME</p>
                </div>
            </div>
        </div>
    );
};

export const LiveExecution = memo(LiveExecutionComponent);
