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
    const [isFocused, setIsFocused] = useState(false);
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

    // ─── USER INTERACTION ───────────────────────────────────────────────────────
    const [selectedDirection, setSelectedDirection] = useState(null);
    const [hasEnteredThisRound, setHasEnteredThisRound] = useState(false);
    const reportedRounds = useRef(new Set());

    const odds = useMemo(() => {
        const amt = parseFloat(localAmount) || 0;
        
        // Add user's potential stake to the pool if they haven't entered yet
        // If they have entered, we assume the backend already includes it in `entryData.pools`
        const isPendingBet = !hasEnteredThisRound && amt > 0 && selectedDirection;
        
        const longPool = (entryData.pools.long || 0) + (isPendingBet && selectedDirection === 'UP' ? amt : 0);
        const shortPool = (entryData.pools.short || 0) + (isPendingBet && selectedDirection === 'DOWN' ? amt : 0);
        
        const total = Math.max(longPool + shortPool, 1); // Avoid div zero

        // Effective pools (minimum 1 to avoid div by zero, but default to equal odds if empty)
        const effLong = longPool || (total / 2);
        const effShort = shortPool || (total / 2);

        return {
            long: ((total / effLong) * 0.90).toFixed(2),
            short: ((total / effShort) * 0.90).toFixed(2),
        };
    }, [entryData.pools, localAmount, selectedDirection, hasEnteredThisRound]);

    const handleRoundResult = useCallback((result, exitPrice) => {
        if (!liveData || !liveData.id || reportedRounds.current.has(liveData.id)) return;
        reportedRounds.current.add(liveData.id);
        
        console.log(`📡 [Rounds] Reporting Result for #${liveData.id}: ${result} at $${exitPrice}`);
        
        // Report to backend (Frontend Source of Truth)
        fetch(`${KEEPER_URL_ROUNDS}/rounds/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                asset: currentAssetId,
                roundId: liveData.id,
                settlePrice: exitPrice,
                result: result // 'WON' or 'LOST'
            })
        }).catch(err => console.warn('[Rounds] Result report failed:', err.message));
    }, [liveData, currentAssetId]);

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
                handleRoundResult,
                isResultPhase,
                liveData?.result
            );
        }
    }, [isLockedPhase, isResultPhase, liveData, entryData, cyclePos, price, odds, onRoundPhaseChange]);

    // activeBal already defined above

    return (
        <div className={`w-full min-h-0 h-auto lg:h-full p-1.5 md:p-2 lg:p-3 rounded-[24px] lg:rounded-[32px] glass-panel flex flex-col gap-1.5 lg:gap-2 relative overflow-hidden transition-all duration-500 ${isLight ? 'static-panel-light !shadow-xl' : ''}`}>

            {/* COMPACT HEADER */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-full bg-[#3CB371]/10 border border-[#3CB371]/20">
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

                <div className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${isLockedPhase ? 'border-[#FF7F50]/30 text-[#FF7F50] bg-[#FF7F50]/5' : 'border-[#3CB371]/30 text-[#3CB371] bg-[#3CB371]/5'}`}>
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
                            className={`p-3 rounded-[24px] border mb-1 transition-colors px-3 flex items-center justify-center gap-2 ${liveData.result === 'WON' ? 'bg-[#3CB371]/15 border-[#3CB371]/30' : (liveData.result === 'LOST' ? 'bg-[#FF7F50]/15 border-[#FF7F50]/40' : (liveData.result === 'HOUSE' ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/10'))}`}>
                            <div className="flex items-center gap-2 uppercase font-black tracking-tighter shrink-0">
                                <span className="text-[7px] opacity-40">#{liveData.id}</span>
                                <div className={`px-1.5 py-0.5 rounded-full border text-[6px] font-black ${parseFloat(price) >= (liveData.lockPrice || 0) ? 'bg-[#3CB371]/10 border-[#3CB371]/30 text-[#3CB371]' : 'bg-[#FF7F50]/10 border-[#FF7F50]/30 text-[#FF7F50]'}`}>
                                    {parseFloat(price) >= (liveData.lockPrice || 0) ? 'BULL' : 'BEAR'}
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col items-center justify-center leading-tight text-center min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 overflow-hidden whitespace-nowrap">
                                    <span className="text-[8px] font-black text-white/50 uppercase tracking-widest truncate">Trgt: ${liveData.lockPrice?.toFixed(1)}</span>
                                    {isResultPhase && <span className="text-[8px] font-black text-white/50 uppercase tracking-widest truncate">Ex: ${liveData.settlePrice?.toFixed(1)}</span>}
                                </div>
                                <div className="flex items-center gap-2 justify-center">
                                    {isResultPhase ? (
                                        <span className={`text-[11px] font-black italic tracking-widest ${liveData.result === 'WON' ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>
                                            {liveData.result === 'WON' ? 'WIN' : 'LOSS'}
                                        </span>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <Timer size={10} className="text-[#3CB371] animate-pulse" />
                                            <span className="text-[11px] font-black font-mono tabular-nums text-white/90">{15 - cyclePos}s</span>
                                        </div>
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
                    <div className={`p-3 rounded-[24px] border transition-all ${isLight ? 'bg-white border-[#3CB371]/10 shadow-sm' : 'bg-white/5 border-white/5'}`}>
                        <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.2em]">Stake Amount</span>
                            <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/5 border border-white/5">
                                {sessionMode && <Zap size={8} className="text-[#3CB371] animate-pulse" />}
                                <span className={`text-[8px] font-black ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>{(activeBal || 0).toFixed(2)} USDC</span>
                            </div>
                        </div>

                    <div className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.02]' : ''}`}>
                        <span className={`absolute left-0 top-1/2 -translate-y-1/2 text-base md:text-lg font-black transition-opacity duration-300 ${isFocused ? 'opacity-40 text-[#3CB371]' : 'opacity-20 '}`}>$</span>
                        <input
                            type="number"
                            value={localAmount}
                            onChange={e => handleLocalAmountChange(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                            placeholder="0.00"
                            inputMode="decimal"
                            className={`w-full bg-transparent text-xl md:text-2xl font-black outline-none pl-5 md:pl-6 transition-all ${isLight ? 'text-[#0a261a]' : 'text-white'} ${isFocused ? 'tracking-tight' : ''}`}
                        />
                        
                        <AnimatePresence>
                            {isFocused && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, y: 5, filter: 'blur(5px)' }}
                                    className="flex items-center justify-between mt-3 pt-3 border-t border-white/5"
                                >
                                    <div className="flex flex-col items-end w-full leading-none">
                                        <span className="text-[6px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Est. Payout</span>
                                        <span className="text-[10px] font-black text-[#3CB371] italic">
                                            +${(parseFloat(localAmount || 0) * (selectedDirection === 'DOWN' ? parseFloat(odds.short) : parseFloat(odds.long))).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end w-full leading-none">
                                        <span className="text-[6px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Est. Payout</span>
                                        <span className="text-[10px] font-black text-[#3CB371] italic">
                                            +${(parseFloat(localAmount || 0) * (selectedDirection === 'DOWN' ? parseFloat(odds.short) : parseFloat(odds.long))).toFixed(2)}
                                        </span>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="mt-2.5">
                        <input type="range" min="0" max="100" value={localSlider} onChange={e => handleLocalSliderChange(e.target.value)}
                            className="w-full accent-[#3CB371] h-1 rounded-full cursor-pointer" />
                    </div>
                </div>

                {/* Direction Buttons - Sliding Tab Effect */}
                <div className="relative flex items-center p-1 rounded-full border border-white/5 bg-white/5 backdrop-blur-3xl overflow-hidden mb-1">
                    <motion.div
                        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-[0_0_15px_rgba(60,179,113,0.3)]`}
                        initial={false}
                        animate={{ 
                            x: selectedDirection === 'UP' ? 4 : 'calc(100% + 4px)',
                            background: selectedDirection === 'UP' ? 'linear-gradient(to bottom right, #48c97f, #1e5a38)' : 'linear-gradient(to bottom right, #FF7F50, #D2691E)'
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    />
                    <button onClick={() => setSelectedDirection('UP')}
                        disabled={hasEnteredThisRound}
                        className={`flex-1 relative z-10 py-3 flex flex-col items-center gap-0.5 transition-all duration-300 ${selectedDirection === 'UP' ? 'text-white scale-110' : 'text-white/20 hover:text-white/40'}`}>
                        <TrendingUp size={14} className={selectedDirection === 'UP' ? 'text-white' : 'text-[#3CB371]/60'} />
                        <span className="text-[10px] font-black">{odds.long}x</span>
                    </button>

                    <button onClick={() => setSelectedDirection('DOWN')}
                        disabled={hasEnteredThisRound}
                        className={`flex-1 relative z-10 py-3 flex flex-col items-center gap-0.5 transition-all duration-300 ${selectedDirection === 'DOWN' ? 'text-white scale-110' : 'text-white/20 hover:text-white/40'}`}>
                        <TrendingDown size={14} className={selectedDirection === 'DOWN' ? 'text-white' : 'text-[#FF7F50]/60'} />
                        <span className="text-[10px] font-black">{odds.short}x</span>
                    </button>
                </div>
                
                {/* Action Button / Prediction Confirmation */}
                <div className="mt-1">
                    {hasEnteredThisRound ? (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-3 rounded-[24px] border flex items-center justify-center gap-3 px-3 ${selectedDirection === 'UP' ? 'bg-[#3CB371]/10 border-[#3CB371]/30' : 'bg-[#FF7F50]/10 border-[#FF7F50]/40'}`}>
                            <div className="flex items-center gap-2 shrink-0">
                                <div className={`p-1 rounded-full ${selectedDirection === 'UP' ? 'bg-[#3CB371]/20 text-[#3CB371]' : 'bg-[#FF7F50]/20 text-[#FF7F50]'}`}>
                                    {selectedDirection === 'UP' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                </div>
                                <div className="flex flex-col leading-tight">
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${selectedDirection === 'UP' ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>
                                        {selectedDirection}
                                    </span>
                                    <span className={`text-[6px] font-bold uppercase opacity-30`}>Pred.</span>
                                </div>
                            </div>
                            
                            <div className="w-px h-6 bg-white/10" />

                            <div className="flex flex-col items-center leading-tight min-w-0 flex-1 overflow-hidden">
                                <span className={`text-[10px] font-black ${isLight ? 'text-[#0a261a]' : 'text-white'} truncate w-full text-center`}>{localAmount} USDC</span>
                                <span className={`text-[8px] font-bold ${selectedDirection === 'UP' ? 'text-[#3CB371]' : 'text-[#FF7F50]'} uppercase truncate w-full text-center`}>
                                    +{(parseFloat(localAmount || 0) * (selectedDirection === 'UP' ? parseFloat(odds.long) : parseFloat(odds.short))).toFixed(0)} PAY
                                </span>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleConfirm}
                            disabled={!selectedDirection || isExecuting || !localAmount || parseFloat(localAmount) <= 0}
                            className={`w-full py-4 rounded-full font-black text-[11px] uppercase tracking-[0.2em] transition-all relative overflow-hidden group hover:brightness-110 ${(!selectedDirection || !localAmount || parseFloat(localAmount) <= 0 || maintenanceMode || tradingHalted)
                                ? 'bg-white/5 text-white/10 cursor-not-allowed border border-white/5'
                                : 'text-white cursor-pointer active:scale-95'
                                }`}
                            style={{
                                background: (!selectedDirection || !localAmount || parseFloat(localAmount) <= 0 || maintenanceMode || tradingHalted) 
                                    ? '' 
                                    : (selectedDirection === 'DOWN' ? 'linear-gradient(135deg, #FF7F50, #D2691E)' : 'linear-gradient(135deg, #48C97F, #1E5A38)'),
                            }}
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {isExecuting && <RotateCw className="animate-spin" size={12} />}
                                {maintenanceMode || tradingHalted ? (tradingHalted ? 'HALTED' : 'PAUSED') : (isExecuting ? 'SIGNING TXN...' : `CONFIRM ${selectedDirection || ''}`)}
                            </span>
                        </motion.button>
                    )}
                </div>
            </div>
        </div>
        </div>
    );
}

export const RoundsTerminal = memo(RoundsTerminalComponent);
