import React, { memo, useState, useEffect, useMemo, useRef } from 'react';
import { Share2, X, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Stamp } from './Stamp';

const LCD_COUNTER_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

  /* Shared LCD digit font */
  .lcd-digit {
    font-family: 'Share Tech Mono', 'Courier New', monospace !important;
    -webkit-font-smoothing: none;
    font-smooth: never;
    letter-spacing: 0.06em;
    text-rendering: geometricPrecision;
  }

  /* Dark theme — coral-green phosphor counter */
  .lcd-counter-dark {
    background: #060e06;
    border: 1px solid #1e3d1e;
    border-radius: 3px;
    box-shadow:
      0 0 0 1px #0a120a,
      0 0 10px rgba(61,255,143,0.18),
      inset 0 0 8px rgba(0,0,0,0.85);
    color: #3dff8f;
    text-shadow: 0 0 6px #00ff41, 0 0 14px #3CB371;
  }

  /* Light theme — muted green counter */
  .lcd-counter-light {
    background: #f0faf4;
    border: 1px solid #3CB371;
    border-radius: 3px;
    box-shadow:
      0 0 0 1px rgba(60,179,113,0.25),
      inset 0 0 4px rgba(60,179,113,0.06);
    color: #1a6b3c;
    text-shadow: none;
  }

  /* Live indicator dot — dark */
  .lcd-live-dot-dark {
    background: #3dff8f;
    box-shadow: 0 0 6px #00ff41, 0 0 14px #3CB371;
  }

  /* Live indicator dot — light */
  .lcd-live-dot-light {
    background: #3CB371;
    box-shadow: 0 0 5px rgba(60,179,113,0.55);
  }

  /* Blink for dot */
  .lcd-live-blink {
    animation: lcd-live-blink-kf 1s step-end infinite;
  }
  @keyframes lcd-live-blink-kf {
    0%,100% { opacity: 1; }
    50%      { opacity: 0.2; }
  }
`;

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
    const lastTimeRef = useRef({}); // tradeId -> lastTime

    return (
        <div className="flex flex-col gap-1 relative min-h-0 h-full">
            <style>{LCD_COUNTER_STYLE}</style>
            <div className="flex items-center justify-between px-2 flex-none">
                <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full lcd-live-blink ${isLight ? 'lcd-live-dot-light' : 'lcd-live-dot-dark'}`} />
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
                {/* ── LCD Digital Active Counter ── */}
                {activeTrades.length > 0 && (
                    <div className={`lcd-digit flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[9px] tracking-widest ${isLight ? 'lcd-counter-light' : 'lcd-counter-dark'}`}>
                        <span style={{
                            display: 'inline-block',
                            minWidth: '1ch',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums'
                        }}>
                            {!isExpanded && activeTrades.length > 1
                                ? `+${activeTrades.length - 1}`
                                : activeTrades.length}
                        </span>
                        <span className="opacity-60" style={{ fontSize: '7px' }}>
                            {!isExpanded && activeTrades.length > 1 ? 'MORE' : 'ACTIVE'}
                        </span>
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
                                    <motion.div
                                        layout
                                        key={visibleTrade.id}
                                        className={idx > 0 ? 'opacity-80 scale-95 origin-top transition-all hover:opacity-100 hover:scale-100' : ''}
                                    >
                                        {/* Render each trade */}
                                        {(() => {
                                            const trade = visibleTrade;
                                            const now = Date.now();
                                            const start = trade.startTime || (trade.id > 1000000000000 ? trade.id : Math.floor(trade.id / 100) * 1000) || now;
                                            const duration = trade.duration || 30;
                                            const expiryMs = trade.expiry || trade.expiryMs || (start + (duration * 1000));
                                            // STABLE TIMER: Ensure time left never increases (glitch protection)
                                            const currentRawTime = Math.max(0, (expiryMs - now) / 1000);

                                            // Lock the time so it only goes down
                                            if (lastTimeRef.current[trade.id] === undefined || currentRawTime < lastTimeRef.current[trade.id]) {
                                                lastTimeRef.current[trade.id] = currentRawTime;
                                            }
                                            const rawTimeLeft = lastTimeRef.current[trade.id];



                                            const timerExpired = rawTimeLeft <= 0;
                                            const isFinal = ["WON", "LOST", "TIMEOUT", "PAYOUT_DELAYED"].includes(trade.status);

                                            const entryPriceVal = parseFloat(trade.entryPrice);
                                            const amountVal = parseFloat(trade.amount);
                                            const currentPriceVal = parseFloat(price);

                                            const multiplier = trade.duration <= 5 ? 6.98 : (trade.duration <= 10 ? 4.98 : 1.98);
                                            const potentialProfit = !isNaN(amountVal) ? (amountVal * multiplier).toFixed(2) : "0.00";

                                            const truncTo2dp = (p) => Math.floor(p * 100) / 100;
                                            const isUpTrade = trade.direction === "buy" || trade.direction === "UP" || trade.direction === 1 || String(trade.direction) === "1";

                                            // CRITICAL: Settle Trigger Logic
                                            // Once timer hits 0, we freeze the current price and result, then nudge the backend
                                            const frozen = frozenPnL.current[trade.id];
                                            if (timerExpired && !isFinal && !frozen) {

                                                const exit2dp = truncTo2dp(currentPriceVal);
                                                const entry2dp = truncTo2dp(entryPriceVal);
                                                // Determine result based on truncated 2dp values (Protocol Standard)
                                                const isWin = isUpTrade ? (exit2dp > entry2dp) : (exit2dp < entry2dp);

                                                // Freeze it locally so the UI never flips back
                                                frozenPnL.current[trade.id] = {
                                                    status: isWin ? "WON" : "LOST",
                                                    exitPrice: currentPriceVal.toFixed(2)
                                                };

                                                // PROACTIVE SYNC: Nudge backend to settle with OUR source-of-truth price
                                                fetch(`/api-arc/settle`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        id: trade.id,
                                                        exitPrice: currentPriceVal.toFixed(2)
                                                    })
                                                }).catch(() => { });
                                            }

                                            const liveWinning = !isNaN(currentPriceVal) && !isNaN(entryPriceVal)
                                                ? (isUpTrade ? truncTo2dp(currentPriceVal) > truncTo2dp(entryPriceVal) : truncTo2dp(currentPriceVal) < truncTo2dp(entryPriceVal))
                                                : false;


                                            const displayTimeLeft = frozen ? "0.0" : rawTimeLeft.toFixed(1);
                                            const showInstantResult = (timerExpired || !!frozen) && !isFinal;
                                            const instantStatus = showInstantResult ? (frozen ? frozen.status : (liveWinning ? "WON" : "LOST")) : trade.status;

                                            const displayFinal = isFinal || showInstantResult;

                                            return (
                                                <div
                                                    className={`rounded-[16px] p-2 lg:p-3 flex flex-col relative transition-all duration-500 border-2 ${!isExpanded && activeTrades.length === 1 ? 'h-full flex-1' : 'h-auto'} ${isLight
                                                        ? 'bg-[#f0f9f4]/90 backdrop-blur-xl border-[#3CB371]/20 shadow-sm hover:shadow-md'
                                                        : 'bg-[#0f0f0f]/80 backdrop-blur-xl border-white/5 shadow-2xl hover:border-white/10'}`}
                                                    style={displayFinal ? {
                                                        borderColor: (instantStatus === "WON" || trade.status === "WON") ? 'rgba(60, 179, 113, 0.5)' : 'rgba(255, 127, 80, 0.5)',
                                                        boxShadow: (instantStatus === "WON" || trade.status === "WON")
                                                            ? 'inset 0 0 30px rgba(60, 179, 113, 0.05), 0 5px 30px rgba(60, 179, 113, 0.1)'
                                                            : 'inset 0 0 30px rgba(255, 127, 80, 0.05), 0 5px 30px rgba(255, 127, 80, 0.1)'
                                                    } : {}}
                                                >
                                                    {/* Card Header - Ultra Compact */}
                                                    <div className="flex items-center justify-between mb-0 px-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className={`w-1 h-1 rounded-full ${displayFinal
                                                                ? ((instantStatus === "WON" || trade.status === "WON") ? 'bg-[#3CB371]' : 'bg-[#FF7F50]')
                                                                : (liveWinning ? 'bg-[#3CB371] animate-pulse shadow-[0_0_8px_#3CB371]' : 'bg-[#FF7F50] animate-pulse shadow-[0_0_8px_#FF7F50]')}`} />
                                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${trade.confirmed === false ? 'text-yellow-500 animate-pulse' : (isLight ? 'text-[#0a261a]/50' : 'text-white/40')}`}>
                                                                {displayFinal ? (trade.status === "PENDING" || trade.status === "RESOLVING" ? instantStatus : trade.status) : (trade.confirmed === false ? "Verifying" : "Live")}
                                                            </span>
                                                        </div>
                                                        {isFinal && (
                                                            <button
                                                                onClick={() => removeTrade(trade.id)}
                                                                className={`p-1 rounded-full transition-colors ${isLight ? 'bg-[#3CB371]/10 hover:bg-[#3CB371]/20 text-[#0a261a]/40' : 'bg-white/5 hover:bg-white/10 text-white/40'}`}
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Central Hero Countdown - Tighter vertical scaling */}
                                                    {!displayFinal ? (
                                                        <div className="flex-1 flex flex-col items-center justify-center py-0">
                                                            <div className={`text-2xl lg:text-4xl lcd-digit transition-all duration-300 ${isLight ? 'text-[#0a261a] opacity-80' : 'text-[#3CB371] drop-shadow-[0_0_15px_rgba(60,179,113,0.5)]'}`}>
                                                                {displayTimeLeft}<span className="text-[12px] font-sans font-black italic opacity-40 ml-0.5">s</span>
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
                                                                    {(instantStatus === "WON" || trade.status === "WON") ? `+$${Number(trade.payout || potentialProfit).toFixed(2)}` : "0.00"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Data Footer - Minimal Height */}
                                                    <div className={`mt-auto pt-2 border-t flex items-end justify-between px-0.5 ${isLight ? 'border-black/5' : 'border-white/5'}`}>
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className={`text-[6px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Entry</span>
                                                                <span className={`text-[8px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>
                                                                    {!isNaN(entryPriceVal) ? `$${entryPriceVal}` : "..."}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className={`text-[6px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Stake</span>
                                                                <span className={`text-[8px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{Number(trade.amount).toFixed(2)}</span>
                                                            </div>
                                                        </div>

                                                        {displayFinal && (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedPnLTrade(trade);
                                                                    setIsPnLOpen(true);
                                                                }}
                                                                title="Share Result"
                                                                className={`p-1.5 rounded-full transition-all hover:scale-110 active:scale-95 border ${isLight ? 'bg-black/5 border-black/10 text-black hover:bg-black/10' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                                                            >
                                                                <Share2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </motion.div>
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
