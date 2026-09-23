import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function PriceMeterTicker({ value }) {
  const prevRef = useRef(value);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (value !== prevRef.current) {
      setDirection(value > prevRef.current ? 1 : -1);
      prevRef.current = value;
    }
  }, [value]);

  const prevVal = value - 1;
  const nextVal = value + 1;

  const initialY = direction * 12;
  const exitY = -direction * 12;

  return (
    <div className="inline-flex flex-col items-center justify-center h-[46px] min-w-[20px] overflow-hidden relative mx-0.5 select-none align-middle">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={value}
          initial={{ y: initialY, opacity: 0, scale: 0.85 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: exitY, opacity: 0, scale: 0.85 }}
          transition={{ type: "spring", stiffness: 350, damping: 22 }}
          className="absolute flex flex-col items-center justify-center leading-none"
        >
          {/* Top faded number */}
          <span className="text-[11px] opacity-40 font-bold select-none mb-0.5">
            {prevVal}
          </span>
          {/* Active middle number */}
          <span className="text-[18px] font-black leading-none">
            {value}
          </span>
          {/* Bottom faded number */}
          <span className="text-[11px] opacity-40 font-bold select-none mt-0.5">
            {nextVal}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// 1. FLIP CLOCK DIGIT (Realistic 3D mechanical flip animation with split card)
// Brand green face with high-contrast numbers: black in dark mode, white in light mode.
function FlipDigit({ digit, isLight }) {
  return (
    <div className={`relative w-[26px] h-[40px] bg-[#17A364] rounded-[7px] shadow-[0_2px_10px_rgba(23,163,100,0.55)] overflow-hidden flex flex-col items-center justify-center select-none ${isLight ? 'border border-[#0F7A4A]/20' : ''}`}>
      {/* Horizontal split crease seam */}
      <div className="absolute inset-x-0 top-1/2 h-[1px] bg-black/25 z-20" />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={digit}
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: 90, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.25, 1, 0.5, 1] }}
          style={{ transformOrigin: "center center", transformStyle: "preserve-3d" }}
          className={`absolute inset-0 flex items-center justify-center font-mono font-black text-[24px] tabular-nums tracking-tighter ${isLight ? 'text-white' : 'text-black'}`}
        >
          {digit}
        </motion.div>
      </AnimatePresence>

      {/* Glossy lighting overlay */}
      <div className={`absolute inset-0 ${isLight ? 'bg-gradient-to-b from-white/25 via-transparent to-black/10' : 'bg-gradient-to-b from-white/15 via-transparent to-black/25'} pointer-events-none z-10`} />
    </div>
  );
}

function FlipClock({ seconds, isLight }) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const tens = Math.floor(s / 10);
  const ones = s % 10;

  return (
    <div className="flex items-center gap-[3px] select-none shrink-0">
      <FlipDigit digit={tens} isLight={isLight} />
      <FlipDigit digit={ones} isLight={isLight} />
      <span className={`text-[13px] font-mono font-black ${isLight ? 'text-[#17A364]' : 'text-[#17A364]'} ml-1 uppercase tracking-tight`}>s</span>
    </div>
  );
}

// 2. LASER PROGRESS BEAM (Thin radiant laser line beam)
// `progress` is elapsed time 0->100 and ONLY drives the LEFT->RIGHT fill width.
// The un-filled track has slanted ash/grey diagonal stripes.
// The BEAM COLOR is the live outcome tracker: brand green when winning,
// NO-button orange when losing (matches the NO button/labels).
function ProgressBeam({ progress, isWinning }) {
  const clamped = Math.max(0, Math.min(100, progress));

  // Whole-beam color = live win/lose status
  const color = isWinning ? '#17A364' : '#FF914D';
  const head = isWinning ? '#3DDC97' : '#FFB085'; // brighter head shade for the laser
  const glow = color;

  return (
    <div className="flex-1 relative flex items-center justify-center min-w-[120px] h-[24px] px-1 select-none">
      {/* Conduit track — slanted ash/grey diagonal stripes on the UN-FILLED portion */}
      <div
        className="w-full h-[6px] rounded-full relative overflow-hidden"
        style={{
          background: 'repeating-linear-gradient(135deg, rgba(148,150,155,0.30) 0 4px, rgba(148,150,155,0.08) 4px 9px)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
        }}
      >
        {/* Radiant Laser Line Beam — width only from progress, color from win/lose */}
        <div
          className="h-full rounded-full relative flex items-center justify-end will-change-[width]"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, ${color} 0%, ${head} 100%)`,
            boxShadow: `0 0 6px ${color}, 0 0 12px ${glow}, 0 0 20px ${glow}`,
          }}
        >
          {/* Laser Head Flare / Spark on advancing (right) leading edge */}
          {clamped > 1 && (
            <div className="relative flex items-center justify-center">
              {/* Outer halo */}
              <div
                className="absolute w-[9px] h-[9px] rounded-full animate-ping opacity-60 pointer-events-none"
                style={{ backgroundColor: color }}
              />
              {/* Core radiant spark */}
              <div
                className="w-[4px] h-[7px] rounded-full z-10 shadow-[0_0_8px_#ffffff]"
                style={{
                  backgroundColor: '#ffffff',
                  boxShadow: `0 0 6px #ffffff, 0 0 12px ${color}, 0 0 18px ${glow}`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 3.5 RESOLVING OUTCOME (brief handoff shown when the countdown ends but the
// backend hasn't delivered its verdict yet).
// NEUTRAL BY DESIGN: the outcome is still unknown, so this must NOT react to the
// live price or win/lose direction — no green/orange, no price-tracking color.
// Just a steady pending spinner + "RESOLVING" in white (dark) / near-black (light).
function ResolvingOutcome({ isLight }) {
  const color = isLight ? '#111827' : '#ffffff';
  return (
    <div className="w-full flex items-center justify-center gap-2.5 select-none">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        className="w-3.5 h-3.5 rounded-full border-2 shrink-0"
        style={{ borderColor: color, borderTopColor: 'transparent', opacity: 0.75 }}
      />
      <motion.span
        animate={{ opacity: [0.4, 1, 0.4], letterSpacing: ['0.22em', '0.3em', '0.22em'] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        className={`text-[12px] font-black tracking-[0.22em] uppercase ${isLight ? 'text-[#111827]/70' : 'text-white/60'}`}
      >
        Resolving
      </motion.span>
    </div>
  );
}

// 4. TRADE OUTCOME — rounds-style compact result reveal (compact live status card).
// Replaces the "million dollar" cinematic with the ROUNDS compact live status card:
// tinted rounded card + italic tracking-widest WIN/LOSS lettering, kept at the
// current animation container size (not stretched to the chart widget size).
function TradeOutcome({ won, isLight }) {
  // Entrance on mount, then exit after 3 seconds so it "animates in and out".
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const exit = { opacity: 0, scale: 0.8, filter: 'blur(4px)' };
  const enter = { opacity: 1, scale: 1, filter: 'blur(0px)' };

  const isWin = !!won;
  const cardClass = isWin
    ? 'bg-[#17A364]/15 border-[#17A364]/30'
    : 'bg-[#FF7F50]/15 border-[#FF7F50]/40';
  const textClass = isWin ? 'text-[#17A364]' : 'text-[#FF7F50]';

  return (
    <motion.div
      initial={enter}
      animate={gone ? exit : enter}
      transition={{ duration: gone ? 0.6 : 0.5, ease: "easeInOut" }}
      className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-2xl"
    >
      {/* Rounds-style compact live status card */}
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className={`px-5 py-2.5 rounded-[24px] border flex items-center justify-center gap-2.5 select-none shadow-lg ${cardClass}`}
      >
        {/* Result chip */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isWin ? 'bg-[#17A364] text-white' : 'bg-[#FF7F50] text-white'}`}>
          <motion.svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          >
            {isWin ? <path d="M5 13l4 4L19 7" /> : <path d="M6 6l12 12M18 6L6 18" />}
          </motion.svg>
        </div>

        {/* WIN / LOSS lettering — italic, tracking-widest, rounds style */}
        <motion.span
          animate={{ opacity: [1, 0.7, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className={`text-[15px] font-black italic tracking-widest ${textClass}`}
          style={{ filter: `drop-shadow(0 0 10px ${isWin ? 'rgba(23,163,100,0.5)' : 'rgba(255,127,80,0.5)'})` }}
        >
          {isWin ? 'WIN' : 'LOSS'}
        </motion.span>
      </motion.div>
    </motion.div>
  );
}

export { FlipClock, ProgressBeam, ResolvingOutcome, TradeOutcome };

export default function TradingWidget({
  price,
  activeMarket,
  sessionBalance,
  handleExecuteTrade,
  theme,
  liveOdds,
  activeTrade,
  isExecuting,
  address,
}) {
  const [selectedDuration, setSelectedDuration] = useState(15);
  const [stakeInput, setStakeInput] = useState('');
  const stake = parseFloat(stakeInput) || 0;

  const [progress, setProgress] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const remainingSecRef = useRef(0);

  useEffect(() => {
    let animationFrameId;

    const updateTimer = () => {
      if (activeTrade && ['PENDING', 'RESOLVING'].includes(activeTrade.status)) {
        const now = Date.now();
        const expiry = activeTrade.expiryMs || (activeTrade.startTime + (activeTrade.duration * 1000));
        const remainingMs = Math.max(0, expiry - now);
        
        const totalMs = activeTrade.duration ? activeTrade.duration * 1000 : 
                        (activeTrade.expiryMs - activeTrade.startTime) || 15000;
        
        // Elapsed time 0 -> 100 so the beam fills LEFT -> RIGHT (smooth per-frame)
        const elapsed = Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100));
        setProgress(elapsed);

        const secs = Math.ceil(remainingMs / 1000);
        if (secs !== remainingSecRef.current) {
          setRemainingSec(secs);
          remainingSecRef.current = secs;
        }
        
        if (remainingMs > 0) {
          animationFrameId = requestAnimationFrame(updateTimer);
        }
      }
    };

    if (activeTrade && ['PENDING', 'RESOLVING'].includes(activeTrade.status)) {
      animationFrameId = requestAnimationFrame(updateTimer);
    } else {
      setProgress(0);
      setRemainingSec(0);
      remainingSecRef.current = 0;
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [activeTrade]);

  const currentPrice = parseFloat(price) || 0;
  const entryPrice = parseFloat(activeTrade?.entryPrice) || 0;
  
  // CRITICAL: Once the backend locks the result (trade_expired sets `won`),
  // use that locked value for the resolving animation. The live price keeps
  // streaming past the countdown and could flip the displayed outcome even
  // though the trade was already settled at the instant the timer hit 0.
  let isWinning = false;
  if (activeTrade) {
    if (typeof activeTrade.won === 'boolean') {
      isWinning = activeTrade.won;
    } else if (activeTrade.direction === 'UP' || activeTrade.direction === 'YES') {
      isWinning = currentPrice > entryPrice;
    } else {
      isWinning = currentPrice < entryPrice;
    }
  }

  const symbol = activeMarket?.symbol?.toLowerCase() || activeMarket?.id?.toLowerCase() || 'eth';
  const backendOdds = liveOdds?.[symbol]?.[selectedDuration];
  const odds = backendOdds || { LONG: 0.50, SHORT: 0.50 };
  
  const yesShare = odds.LONG;
  const noShare = odds.SHORT;
  
  const yesPayoutAmt = (stake / Math.max(0.01, yesShare)).toFixed(2);
  const noPayoutAmt = (stake / Math.max(0.01, noShare)).toFixed(2);

  const didWin = (['WON', 'PAID'].includes(activeTrade?.status) || activeTrade?.won) === true;

  // When the progress beam has fully elapsed (expired) we hand off to the outcome icon
  // instead of leaving the beam stuck at 100%.
  const isPendingLive = ['PENDING', 'RESOLVING'].includes(activeTrade?.status);
  const tradeExpired = progress >= 99.7;
  const settledOutcome = activeTrade && !isPendingLive;

  const handleTrade = useCallback(async (direction) => {
    if (stake <= 0) return;
    const amount = Math.min(stake, sessionBalance || 0);
    if (amount <= 0) return;

    await handleExecuteTrade({
      direction: direction === 'YES' ? 'UP' : 'DOWN',
      amount: amount,
      duration: selectedDuration,
    });
  }, [stake, sessionBalance, selectedDuration, handleExecuteTrade]);

  const hasActiveTrade = !!activeTrade || isExecuting;
  const displayBalance = sessionBalance || 0;
  const isLight = theme === 'light';

  return (
    <div className={`w-full h-full rounded-2xl p-5 flex flex-col justify-between ${isLight ? 'bg-white' : 'bg-[#0a0a0a]'}`} style={{ fontFamily: '"Comfortaa", cursive', boxShadow: isLight ? '0 1px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.08)' : 'none' }}>
      
      {/* Duration Section */}
      <div className="flex items-center justify-between mb-2">
        <div className={`text-[12px] font-bold ${isLight ? 'text-[#111827]' : 'text-white/90'}`}>DURATION</div>
        <div className={`text-[12px] font-black ${isLight ? 'text-[#17A364]' : 'text-[#17A364]'}`}>
          ${parseFloat(price || 0).toFixed(2)}
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        {[15, 10, 5].map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDuration(d)}
            className={`flex-1 py-2 rounded-full text-[14px] font-bold transition-all ${
              selectedDuration === d
                ? 'bg-[#17A364] text-white shadow-sm'
                : isLight ? 'bg-[#F8F9FA] text-[#111827] border border-[#E5E7EB] hover:bg-gray-50' : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
            }`}
          >
            {d}s
          </button>
        ))}
      </div>

      {/* Stake Section */}
      <div className="flex items-center justify-between mb-2">
        <div className={`text-[12px] font-bold flex items-center gap-1 ${isLight ? 'text-[#111827]' : 'text-white/90'}`}>
          STAKE 
          <div className={`w-3 h-3 rounded-full border flex items-center justify-center text-[8px] font-bold ${isLight ? 'border-gray-300 text-gray-500' : 'border-white/20 text-white/40'}`}>i</div>
        </div>
        <div className={`text-[11px] ${isLight ? 'text-[#6B7280]' : 'text-white/40'}`}>Balance: {displayBalance.toFixed(4)} USDC</div>
      </div>
      
      <div className="relative mb-4">
        <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-bold ${isLight ? 'text-[#111827]' : 'text-white/80'}`}>$</span>
        <input
          type="number"
          value={stakeInput}
          onChange={(e) => setStakeInput(e.target.value)}
          placeholder="STAKE"
          min="0"
          step="0.01"
          className={`w-full rounded-full py-2 px-8 text-center text-[14px] font-bold text-[#17A364] placeholder-[#17A364] outline-none focus:border-[#17A364] transition-all ${isLight ? 'bg-[#F8F9FA]' : 'bg-white/5 border border-white/10'}`}
        />
      </div>

      {/* Custom Slider */}
      <div className="relative px-2 mb-6">
        <div className={`h-1 rounded-full w-full relative ${isLight ? 'bg-[#E5E7EB]' : 'bg-white/10'}`}>
          <div 
            className={`absolute left-0 top-0 h-full rounded-full ${isLight ? 'bg-[#E5E7EB]' : 'bg-white/10'}`}
            style={{ width: `${Math.min((stake / (sessionBalance || 100)) * 100, 100)}%` }}
          />
          <div 
            className={`absolute w-4 h-4 border-[3px] border-[#17A364] rounded-full top-1/2 -translate-y-1/2 -ml-2 transition-all ${isLight ? 'bg-white' : 'bg-[#0a0a0a]'}`}
            style={{ left: `${Math.min((stake / (sessionBalance || 100)) * 100, 100)}%` }}
          />
        </div>
        <input
          type="range"
          min="0"
          max={sessionBalance || 100}
          step="0.01"
          value={stake}
          onChange={(e) => setStakeInput(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Estimated Return (Split above buttons) */}
      <div className={`flex gap-3 mb-2 text-[12px] font-bold ${isLight ? 'text-[#111827]' : 'text-white/80'}`}>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          <span className="text-[#17A364]">YES ${stake > 0 ? yesPayoutAmt : "0.00"}</span>
        </div>
        <span className={isLight ? 'text-gray-300' : 'text-white/20'}>|</span>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          <span className="text-[#FF914D]">NO ${stake > 0 ? noPayoutAmt : "0.00"}</span>
        </div>
      </div>

      {/* Action Area with Flip Clock, Progress Beam (Green -> Orange), and Realtime Result Tracker */}
      <div className="relative h-[52px] mb-4">
        <AnimatePresence mode="popLayout">
          {activeTrade || isExecuting ? (
            <motion.div
              key="active-trade"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`w-full h-full relative flex items-center justify-between text-[15px] tracking-wide ${isLight ? 'text-gray-900' : 'text-white'}`}
            >
              <div className="absolute inset-0 flex items-center justify-between z-10 w-full">
                {/* If a PENDING trade exists, show the live countdown IMMEDIATELY on click */}
                {isPendingLive && !tradeExpired ? (
                  <div className="flex w-full h-full items-center justify-center gap-2.5">
                    {/* 1. FLIP CLOCK */}
                    <FlipClock seconds={remainingSec} isLight={isLight} />

                    {/* 2. PROGRESS BEAM — width = countdown progress, color = live win/lose tracker */}
                    <ProgressBeam progress={progress} isWinning={isWinning} />
                  </div>
                ) : isExecuting && !tradeExpired ? (
                  // Only show "placing" while the backend is confirming AND the countdown is still running.
                  <div className="w-full text-center text-[#17A364] animate-pulse text-[16px] font-black tracking-widest flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2 border-[#17A364] border-t-transparent animate-spin" />
                    PLACING TRADE...
                  </div>
                ) : !settledOutcome ? (
                  // Countdown ended but the authoritative result hasn't landed yet -> brief resolving state
                  <ResolvingOutcome isLight={isLight} />
                ) : (
                  <TradeOutcome won={didWin} isLight={isLight} />
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="trade-buttons"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="flex justify-between gap-3 h-full relative"
            >
              <div className="absolute inset-0 -inset-x-4 -inset-y-2 bg-[#17A364]/10 rounded-full blur-xl pointer-events-none" />
              <button
                onClick={() => handleTrade('YES')}
                disabled={stake <= 0 || stake > (sessionBalance || 0)}
                className={`flex-1 h-full rounded-full flex items-center justify-center gap-2 transition-all text-[20px] font-black tracking-wide text-white bg-[#17A364] ${!address ? 'opacity-40' : 'opacity-100 hover:scale-[1.02] active:scale-[0.98]'}`}
              >
                YES <span className="text-[18px] inline-flex items-center"><PriceMeterTicker value={Math.round(yesShare * 100)} />¢</span>
              </button>
              <button
                onClick={() => handleTrade('NO')}
                disabled={stake <= 0 || stake > (sessionBalance || 0)}
                className={`flex-1 h-full rounded-full flex items-center justify-center gap-2 transition-all text-[20px] font-black tracking-wide text-white bg-[#EF5350] ${!address ? 'opacity-40' : 'opacity-100 hover:scale-[1.02] active:scale-[0.98]'}`}
              >
                NO <span className="text-[18px] inline-flex items-center"><PriceMeterTicker value={Math.round(noShare * 100)} />¢</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`text-center text-[11px] font-medium ${isLight ? 'text-[#6B7280]' : 'text-white/40'}`}>
        By clicking, you agree to the <span className="text-[#17A364] cursor-pointer hover:underline">Terms of Use</span>.
      </div>
    </div>
  );
}
