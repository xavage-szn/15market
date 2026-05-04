import React, { memo, useState, useEffect, useMemo, useRef } from 'react';
import { Share2, X, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Stamp } from './Stamp';
import { KEEPER_URL_ARC } from '../constants';

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
    setIsExpanded,
    lockedResults
}) {
    const [tick, setTick] = useState(0);
    const isLight = theme === 'light';

    // Higher frequency clock (33ms ~ 30fps) for butter-smooth countdown and precise expiry freezing
    const startTimeRef = useRef(Date.now());
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed(Date.now() - startTimeRef.current);
        }, 100);
        return () => clearInterval(interval);
    }, []);

    // --- UI-ONLY MONITORING ---
    const priceRefInternal = useRef(price);
    useEffect(() => { priceRefInternal.current = price; }, [price]);

    const lastTimeRef = useRef({}); // tradeId -> lastTime

    const removeTrade = (id) => {
        setActiveTrades(prev => prev.filter(t => t.id !== id));
    };



    // Auto-collapse when only 0-1 trades remain
    useEffect(() => {
        if (activeTrades.length <= 1 && isExpanded) {
            setIsExpanded(false);
        }
    }, [activeTrades.length]);

    return (
        <div className="flex flex-col gap-1 relative min-h-0 h-full">
            <style>{LCD_COUNTER_STYLE}</style>
            <div className="flex items-center justify-between px-2 flex-none">
                <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full lcd-live-blink ${isLight ? 'lcd-live-dot-light' : 'lcd-live-dot-dark'}`} />
                    {activeTrades.length === 0 && (
                        <h4 className={`text-[9px] lg:text-xs font-black tracking-tighter uppercase ${isLight ? 'text-black/50' : 'text-white/40'}`}>
                            ACTIVE TRADES
                        </h4>
                    )}
                    {activeTrades.length > 1 && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-all duration-300 ${isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'}`}
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
                    <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${isLight ? 'bg-[#3CB371] text-white shadow-sm' : 'bg-[#3CB371] text-black shadow-[0_0_10px_rgba(61,255,143,0.3)]'}`}>
                        {activeTrades.length}
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
                                        key={visibleTrade.id}
                                        className={idx > 0 ? 'opacity-80 scale-95 origin-top transition-all hover:opacity-100 hover:scale-100' : ''}
                                    >

                                        {(() => {
                                            const trade = visibleTrade;
                                            const now = Date.now();
                                            const start = trade.startTime || (trade.id > 1e14 ? Math.floor(trade.id / 1000) : (trade.id > 1e12 ? trade.id : Math.floor(trade.id / 100) * 1000)) || now;
                                            const duration = trade.duration || 30;
                                            const expiryMs = trade.expiry || trade.expiryMs || (start + (duration * 1000));
                                            // STABLE TIMER: Ensure time left never exceeds duration and never increases
                                            const currentRawTime = (expiryMs - now) / 1000;
                                            const stableRawTime = Math.min(duration, Math.max(0, currentRawTime));

                                            // Lock the time so it only goes down
                                            if (lastTimeRef.current[trade.id] === undefined || stableRawTime < lastTimeRef.current[trade.id]) {
                                                lastTimeRef.current[trade.id] = stableRawTime;
                                            }
                                            const rawTimeLeft = lastTimeRef.current[trade.id];
                                            const displayTimeLeft = (trade.status !== "PENDING") ? "0.0" : (trade.timeLeft !== undefined ? trade.timeLeft.toFixed(1) : rawTimeLeft.toFixed(1));

                                            const timerExpired = (trade.timeLeft !== undefined ? trade.timeLeft <= 0 : rawTimeLeft <= 0);
                                            const isFinal = ["WON", "LOST", "TIMEOUT", "PAYOUT_DELAYED"].includes(trade.status);

                                            const entryPriceVal = parseFloat(trade.entryPrice);
                                            const amountVal = parseFloat(trade.amount);
                                            
                                            // PRICE AUTHORITY: Use the backend-provided livePrice, or the live feed.
                                            const currentPriceVal = trade.livePrice !== undefined ? parseFloat(trade.livePrice) : parseFloat(price);

                                            const multiplier = trade.duration <= 5 ? 2.90 : (trade.duration <= 10 ? 2.40 : 1.90);
                                            const potentialProfit = !isNaN(amountVal) ? (amountVal * multiplier).toFixed(2) : "0.00";

                                            const isUpTrade = trade.direction === "buy" || trade.direction === "UP" || trade.direction === 1 || String(trade.direction) === "1";

                                            // AUTHORITY CHAIN for live winning indicator:
                                            // 1. trade.isWinning: set by trade_tick (live) and trade_settled (final).
                                            // 2. Local price comparison: fallback if socket hasn't updated yet.
                                            const liveWinning = trade.isWinning !== undefined
                                                ? trade.isWinning
                                                : (!isNaN(currentPriceVal) && !isNaN(entryPriceVal)
                                                    ? (isUpTrade ? currentPriceVal > entryPriceVal : currentPriceVal < entryPriceVal)
                                                    : false);

                                            // Seamless UI Transition: Flip to result card instantly when timer expires
                                            const showInstantResult = timerExpired && !isFinal;
                                            
                                            // Real-time Display Status
                                            const instantStatus = showInstantResult 
                                                ? (liveWinning ? "WON" : "LOST") 
                                                : trade.status;

                                            const displayFinal = isFinal || showInstantResult;
                                            
                                            // Payout pending state: Trade is won but on-chain confirmation hasn't arrived
                                            const isPayoutPending = (instantStatus === "WON" || trade.status === "WON") && !trade.chainConfirmed && !trade.payout;

                                            return (
                                                <div
                                                    className={`rounded-[16px] p-2 md:p-3 flex flex-col relative transition-all duration-500 border-2 ${!isExpanded && activeTrades.length === 1 ? 'h-full flex-1' : 'h-auto'} ${isLight
                                                        ? 'bg-[#cce3d7] backdrop-blur-xl border-[#3CB371]/35 shadow-sm hover:shadow-md'
                                                        : 'bg-[#0f0f0f]/80 backdrop-blur-xl border-white/5 shadow-2xl hover:border-white/10'}`}
                                                    style={displayFinal ? {
                                                        borderColor: (instantStatus === "WON") ? 'rgba(60, 179, 113, 0.5)' : 'rgba(255, 127, 80, 0.5)',
                                                        boxShadow: (instantStatus === "WON")
                                                            ? `inset 0 0 30px rgba(60, 179, 113, 0.05), 0 5px 30px ${isLight ? 'rgba(60, 179, 113, 0.04)' : 'rgba(60, 179, 113, 0.1)'}`
                                                            : `inset 0 0 30px rgba(255, 127, 80, 0.05), 0 5px 30px ${isLight ? 'rgba(255, 127, 80, 0.04)' : 'rgba(255, 127, 80, 0.1)'}`
                                                    } : {}}
                                                >
                                                    {/* Card Header - Ultra Compact */}
                                                    <div className="flex items-center justify-between mb-0 px-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className={`w-1 h-1 rounded-full ${displayFinal
                                                                ? ((instantStatus === "WON") ? 'bg-[#3CB371]' : 'bg-[#FF7F50]')
                                                                : (liveWinning ? 'bg-[#3CB371] animate-pulse shadow-[0_0_8px_#3CB371]' : 'bg-[#FF7F50] animate-pulse shadow-[0_0_8px_#FF7F50]')}`} />
                                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${trade.confirmed === false ? 'text-yellow-500 animate-pulse' : (isLight ? 'text-[#0a261a]/50' : 'text-white/40')}`}>
                                                                {displayFinal ? instantStatus : (trade.confirmed === false ? "Verifying" : "Live")}
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
                                                        <div className="flex-1 flex flex-col items-center justify-center py-1 md:py-2">
                                                            <div className={`text-xl md:text-2xl lg:text-4xl lcd-digit transition-all duration-300 ${isLight ? 'text-[#0a261a] opacity-80' : 'text-[#3CB371] drop-shadow-[0_0_15px_rgba(60,179,113,0.5)]'}`}>
                                                                {displayTimeLeft}<span className="text-[10px] md:text-[12px] font-sans font-black italic opacity-40 ml-0.5">s</span>
                                                            </div>
                                                            <div className="mt-0 px-1 py-0.5 rounded-full border border-[#3CB371]/10 bg-[#3CB371]/5 scale-75 md:scale-90">
                                                                <span className={`text-[6px] font-black uppercase tracking-[0.2em] ${liveWinning ? "text-[#3CB371]" : "text-[#FF7F50]"}`}>
                                                                    {liveWinning ? "WINNING" : "LOSING"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex-1 flex flex-col items-center justify-center py-1">
                                                            <div className={`text-[10px] font-black uppercase tracking-widest ${
                                                                (instantStatus === "WON") ? 'text-[#3CB371]' : 'text-[#FF7F50]'
                                                            }`}>
                                                                { (instantStatus === "WON") ? "Trade Won" : "Trade Lost" }
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className={`text-base lg:text-lg font-matrix tracking-widest ${(instantStatus === "WON" || trade.status === "WON") ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>
                                                                    {(instantStatus === "WON" || trade.status === "WON") ? `+$${Number(trade.payout || potentialProfit).toFixed(2)}` : "0.00"}
                                                                </span>
                                                                {isPayoutPending && (
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#3CB371] animate-ping" />
                                                                        <span className="text-[6px] font-black uppercase tracking-widest text-[#3CB371]/60">Payout Pending</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Data Footer - Minimal Height */}
                                                    <div className={`mt-auto pt-2 border-t flex items-end justify-between px-0.5 ${isLight ? 'border-black/5' : 'border-white/5'}`}>
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className={`text-[6px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Entry</span>
                                                                <span className={`text-[8px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>
                                                                    {!isNaN(entryPriceVal) ? `$${entryPriceVal.toFixed(2)}` : "..."}
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
                                        className={`w-full mt-1 py-1.5 px-2 rounded-full border flex items-center justify-center gap-1.5 transition-all hover:scale-[0.99] active:scale-95 ${isLight ? 'bg-black/5 border-black/10 text-black/50' : 'bg-white/5 border-white/10 text-white/40'}`}
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
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-20 h-full">
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
