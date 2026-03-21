import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Users, TrendingUp, TrendingDown, Lock, CheckCircle, XCircle, Timer, Activity, Zap } from 'lucide-react';
import { KEEPER_URL_ROUNDS } from '../constants';

/**
 * ROUNDS P2P TERMINAL - SYNCED VERSION
 * 
 * Layout optimized to fit one screen (V1 compatibility).
 * Connects to Backend for real-time pool data and phase synchronization.
 */
function RoundsTerminalComponent({
    price,
    balance,
    executeTrade,
    isExecuting,
    theme,
    sessionMode,
    sessionBalance,
    activeMarket,
    onRoundPhaseChange,
    maintenanceMode = false,
    tradingHalted = false,
}) {
    const isLight = theme === 'light';
    const currentAssetId = activeMarket?.id || 'eth';

    // Local amount state — Rounds manages its own stake independently
    const [localAmount, setLocalAmount] = useState('');
    const [localSlider, setLocalSlider] = useState(0);

    const activeBal = sessionMode ? sessionBalance : balance;

    const handleLocalAmountChange = (val) => {
        // Clamp to 2 decimal places
        if (val.includes('.')) {
            const [int, dec] = val.split('.');
            if (dec.length > 2) val = `${int}.${dec.slice(0, 2)}`;
        }
        setLocalAmount(val);
        const num = parseFloat(val);
        if (!isNaN(num) && activeBal > 0) setLocalSlider(Math.min((num / activeBal) * 100, 100));
        else setLocalSlider(0);
    };

    const handleLocalSliderChange = (val) => {
        setLocalSlider(Number(val));
        if (activeBal > 0) {
            const calculated = (activeBal * Number(val)) / 100;
            setLocalAmount(Math.floor(calculated * 100) / 100 + '');
        }
    };

    // ─── BACKEND SYNC ──────────────────────────────────────────────────────────
    const [roundState, setRoundState] = useState({
        live: null,
        next: { pools: { long: 0, short: 0, participants: 0 } }
    });

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ROUNDS}/rounds/status?asset=${currentAssetId}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && !data.error) {
                setRoundState(data);
            }
        } catch (e) {
            console.warn('[Rounds] Status fetch failed:', e.message);
        }
    }, [currentAssetId]);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000); // Sync every 3s
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // Derived timing from local clock synced to backend intervals
    // (Backend locks at T=0 and settles at T=15 of every 30s block)
    const getCyclePos = () => Math.floor(Date.now() / 1000) % 30;
    const [cyclePos, setCyclePos] = useState(getCyclePos);

    useEffect(() => {
        const tick = setInterval(() => setCyclePos(getCyclePos()), 1000);
        return () => clearInterval(tick);
    }, []);

    const isLockedPhase = cyclePos < 15;
    const isResultPhase = cyclePos >= 15 && cyclePos < 20;
    const secondsToNextLock = 30 - cyclePos;

    // ─── POOL & ODDS ────────────────────────────────────────────────────────────
    const entryData = roundState.next || { pools: { long: 10, short: 10, participants: 0 } };
    const liveData = roundState.live || null;

    const odds = useMemo(() => {
        const total = (entryData.pools.long || 1) + (entryData.pools.short || 1);
        return {
            long: ((total / (entryData.pools.long || 1)) * 0.90).toFixed(2),
            short: ((total / (entryData.pools.short || 1)) * 0.90).toFixed(2),
        };
    }, [entryData.pools]);

    // ─── USER INTERACTION ───────────────────────────────────────────────────────
    const [selectedDirection, setSelectedDirection] = useState(null);
    const [hasEnteredThisRound, setHasEnteredThisRound] = useState(false);

    // Reset entry flag when a new entry phase starts (at T=20)
    useEffect(() => {
        if (cyclePos === 20) {
            setHasEnteredThisRound(false);
            setSelectedDirection(null);
        }
    }, [cyclePos]);

    const handleConfirm = useCallback(() => {
        const amt = parseFloat(localAmount);
        if (maintenanceMode || tradingHalted || !selectedDirection || isExecuting || !localAmount || amt <= 0) return;
        if (activeBal > 0 && amt > activeBal) {
            return; // Silently cap — let UI show warning
        }

        // Call the parent's executeTrade which now handles blockchain logic
        executeTrade({
            direction: selectedDirection,
            type: 'rounds',
            poolId: entryData.id || Math.floor(Date.now() / 30000) + 1,
            asset: currentAssetId,
            amount: localAmount,
        }).then((success) => {
            if (success !== false) {
                setHasEnteredThisRound(true);
            }
        }).catch(() => {});
    }, [selectedDirection, isExecuting, localAmount, activeBal, executeTrade, currentAssetId, entryData.id]);

    // Bridge to parent chart
    useEffect(() => {
        if (onRoundPhaseChange) {
            const showLive = isLockedPhase || isResultPhase;
            onRoundPhaseChange(
                isLockedPhase || isResultPhase ? 'locked' : 'entry',
                liveData?.lockPrice || parseFloat(price),
                liveData?.pools || entryData.pools,
                hasEnteredThisRound ? selectedDirection : (liveData?.userDirection || null),
                isLockedPhase ? (15 - cyclePos) : (isResultPhase ? (20 - cyclePos) : (30 - cyclePos)),
                odds,
                () => { },
                isResultPhase,
                liveData?.result
            );
        }
    }, [isLockedPhase, isResultPhase, liveData, entryData, cyclePos, price, odds, onRoundPhaseChange]);

    // activeBal already defined above

    return (
        <div className={`w-full h-full p-1.5 md:p-2 lg:p-3 rounded-[24px] lg:rounded-[32px] glass-panel flex flex-col gap-1.5 lg:gap-2 relative overflow-hidden transition-all duration-500 ${isLight ? 'static-panel-light !shadow-xl' : ''}`}>

            {/* COMPACT HEADER */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[#3CB371]/10 border border-[#3CB371]/20">
                        <Layers size={12} className="text-[#3CB371]" />
                    </div>
                    <div>
                        <h2 className={`text-[10px] font-black uppercase tracking-widest leading-none ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>ROUNDS</h2>
                        <div className="flex items-center gap-1 mt-0.5 opacity-40">
                            <Users size={7} />
                            <span className="text-[7px] font-black uppercase tracking-tighter">{entryData.pools.participants} Players</span>
                        </div>
                    </div>
                </div>

                <div className={`px-2 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-widest ${isLockedPhase ? 'border-[#FF7F50]/30 text-[#FF7F50] bg-[#FF7F50]/5' : 'border-[#3CB371]/30 text-[#3CB371] bg-[#3CB371]/5'}`}>
                    {isLockedPhase ? 'LIVE' : (isResultPhase ? 'END' : 'OPEN')}
                </div>
            </div>

            <div className="flex flex-col gap-2 flex-1 overflow-y-auto no-scrollbar pt-1">

                {/* COMPACT LIVE STATUS CARD */}
                <AnimatePresence>
                    {(isLockedPhase || isResultPhase) && liveData && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={`p-2.5 rounded-2xl border mb-1 transition-colors ${liveData.result === 'WON' ? 'bg-[#3CB371]/15 border-[#3CB371]/30' : (liveData.result === 'LOST' ? 'bg-[#FF7F50]/15 border-[#FF7F50]/40' : (liveData.result === 'HOUSE' ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/10'))}`}>
                            <div className="flex items-center justify-between uppercase font-black tracking-tighter mb-1.5">
                                <span className="text-[7px] opacity-40">Active Round #{liveData.id}</span>
                                <div className="flex items-center gap-1.5">
                                    {!isResultPhase && (
                                        <div className={`px-1.5 py-0.5 rounded-full border text-[6px] font-black transition-all ${parseFloat(price) >= (liveData.lockPrice || 0) ? 'bg-[#3CB371]/10 border-[#3CB371]/30 text-[#3CB371]' : 'bg-[#FF7F50]/10 border-[#FF7F50]/30 text-[#FF7F50]'}`}>
                                            {parseFloat(price) >= (liveData.lockPrice || 0) ? 'BULLISH' : 'BEARISH'}
                                        </div>
                                    )}
                                    <div className={`w-1 h-1 rounded-full ${isResultPhase ? 'bg-gray-400' : (parseFloat(price) >= (liveData.lockPrice || 0) ? 'bg-[#3CB371] animate-ping' : 'bg-[#FF7F50] animate-ping')}`} />
                                    <span className={`text-[7px] ${liveData.result === 'WON' || (parseFloat(price) >= (liveData.lockPrice || 0) && !isResultPhase) ? 'text-[#3CB371]' : (liveData.result === 'LOST' || (!isResultPhase) ? 'text-[#FF7F50]' : (liveData.result === 'HOUSE' ? 'text-white/60' : 'text-white/40'))}`}>
                                        {isResultPhase ? (liveData.result === 'HOUSE' ? 'HOUSE WINS' : 'SETTLED') : 'LOCKED'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-col leading-none">
                                        <span className="text-[9px] font-black text-white/80 uppercase">Target: ${liveData.lockPrice?.toFixed(2)}</span>
                                        <span className="text-[7px] opacity-30 mt-1">Pool: ${(liveData.pools.long + liveData.pools.short).toFixed(0)} USDC</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {isResultPhase ? (
                                        <div className="flex flex-col items-end">
                                            <span className={`text-xs font-black italic ${liveData.result === 'WON' ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>{liveData.result}</span>
                                            <span className="text-[7px] opacity-30">Exit: ${liveData.settlePrice?.toFixed(2)}</span>
                                        </div>
                                    ) : (
                                        <span className="text-xs font-black font-mono tabular-nums text-white/80">{15 - cyclePos}s</span>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ENTRY AREA */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                        <span className={`text-[7px] font-black uppercase tracking-[0.2em] opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Next Prediction</span>
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/5">
                            <Timer size={7} className="text-[#3CB371]" />
                            <span className="text-[8px] font-black font-mono text-white/60">{secondsToNextLock}s</span>
                        </div>
                    </div>

                    {/* Compact Input */}
                    <div className={`p-3 rounded-2xl border transition-all ${isLight ? 'bg-white border-[#3CB371]/10 shadow-sm' : 'bg-white/5 border-white/5'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[8px] font-black opacity-30 uppercase">Stake</span>
                            <div className="flex items-center gap-1">
                                {sessionMode && <Zap size={8} className="text-[#3CB371] animate-pulse" />}
                                <span className={`text-[8px] font-black ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>{(activeBal || 0).toFixed(2)} USDC</span>
                            </div>
                        </div>

                        <div className="relative">
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-base md:text-lg font-black opacity-20">$</span>
                            <input
                                type="number"
                                value={localAmount}
                                onChange={e => handleLocalAmountChange(e.target.value)}
                                placeholder="0.00"
                                inputMode="decimal"
                                className={`w-full bg-transparent text-xl md:text-2xl font-black outline-none pl-5 md:pl-6 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}
                            />
                        </div>

                        <div className="mt-2.5">
                            <input type="range" min="0" max="100" value={localSlider} onChange={e => handleLocalSliderChange(e.target.value)}
                                className="w-full accent-[#3CB371] h-1 rounded-full cursor-pointer" />
                            <div className="flex justify-between mt-1 px-1">
                                {[0, 50, 100].map(v => (
                                    <button key={v} onClick={() => handleLocalSliderChange(v)} className="text-[7px] font-black opacity-20 hover:opacity-50">{v}%</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Direction Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setSelectedDirection('UP')}
                            disabled={hasEnteredThisRound}
                            className={`py-3 rounded-xl border transition-all flex flex-col items-center gap-0.5 relative overflow-hidden ${selectedDirection === 'UP' ? 'bg-[#3CB371] border-[#3CB371] shadow-lg' : 'bg-white/5 border-white/10 hover:border-[#3CB371]/40'} ${hasEnteredThisRound ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}>
                            <TrendingUp size={14} className={`relative z-10 ${selectedDirection === 'UP' ? 'text-white scale-110' : 'text-[#3CB371]'}`} />
                            <span className={`text-[8px] font-black relative z-10 ${selectedDirection === 'UP' ? 'text-white' : 'text-[#3CB371]'}`}>{odds.long}x</span>
                        </button>

                        <button onClick={() => setSelectedDirection('DOWN')}
                            disabled={hasEnteredThisRound}
                            className={`py-3 rounded-xl border transition-all flex flex-col items-center gap-0.5 relative overflow-hidden ${selectedDirection === 'DOWN' ? 'bg-[#FF7F50] border-[#FF7F50] shadow-lg' : 'bg-white/5 border-white/10 hover:border-[#FF7F50]/40'} ${hasEnteredThisRound ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}>
                            <TrendingDown size={14} className={`relative z-10 ${selectedDirection === 'DOWN' ? 'text-white scale-110' : 'text-[#FF7F50]'}`} />
                            <span className={`text-[8px] font-black relative z-10 ${selectedDirection === 'DOWN' ? 'text-white' : 'text-[#FF7F50]'}`}>{odds.short}x</span>
                        </button>
                    </div>

                    {/* Action Button / Prediction Confirmation */}
                    <div className="mt-1">
                        {hasEnteredThisRound ? (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`p-3 rounded-2xl border flex items-center justify-between ${selectedDirection === 'UP' ? 'bg-[#3CB371]/10 border-[#3CB371]/30' : 'bg-[#FF7F50]/10 border-[#FF7F50]/30'}`}>
                                <div className="flex items-center gap-2.5">
                                    <div className={`p-1.5 rounded-lg ${selectedDirection === 'UP' ? 'bg-[#3CB371]/20 text-[#3CB371]' : 'bg-[#FF7F50]/20 text-[#FF7F50]'}`}>
                                        {selectedDirection === 'UP' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    </div>
                                    <div className="flex flex-col leading-tight">
                                        <span className={`text-[9px] font-black uppercase tracking-widest ${selectedDirection === 'UP' ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>
                                            Predicition: {selectedDirection === 'UP' ? 'LONG' : 'SHORT'}
                                        </span>
                                        <span className={`text-[7px] font-bold uppercase ${isLight ? 'text-[#0a261a]/30' : 'text-white/30'}`}>Awaiting Next Round</span>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end leading-tight">
                                    <span className={`text-[10px] font-black ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>{localAmount} USDC</span>
                                    <span className={`text-[7px] font-bold ${isLight ? 'text-[#0a261a]/30' : 'text-white/30'}`}>PAYOUT: +{(parseFloat(localAmount || 0) * (selectedDirection === 'UP' ? parseFloat(odds.long) : parseFloat(odds.short))).toFixed(2)}</span>
                                </div>
                            </motion.div>
                        ) : (
                            <button
                                onClick={handleConfirm}
                                disabled={!selectedDirection || isExecuting || !localAmount || parseFloat(localAmount) <= 0}
                                className={`w-full py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-[0.98] ${(!selectedDirection || !localAmount || parseFloat(localAmount) <= 0 || maintenanceMode || tradingHalted)
                                    ? 'bg-white/5 text-white/10 cursor-not-allowed border border-white/5'
                                    : selectedDirection === 'DOWN' ? 'bg-gradient-to-r from-[#FF7F50] to-[#FF4500] text-white shadow-[#FF7F50]/20' : 'bg-gradient-to-r from-[#3CB371] to-[#2E8B57] text-white shadow-[#3CB371]/20'
                                    }`}>
                                {maintenanceMode || tradingHalted ? (tradingHalted ? 'HALTED' : 'PAUSED') : (isExecuting ? 'SIGNING TXN...' : `CONFIRM ${selectedDirection || ''}`)}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export const RoundsTerminal = memo(RoundsTerminalComponent);
