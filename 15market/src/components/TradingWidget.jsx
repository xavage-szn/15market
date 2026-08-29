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
function FlipDigit({ digit }) {
  return (
    <div className="relative w-[18px] h-[28px] bg-[#0c0e12] border border-white/15 rounded-[5px] shadow-[0_2px_6px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col items-center justify-center select-none">
      {/* Horizontal split crease seam */}
      <div className="absolute inset-x-0 top-1/2 h-[1px] bg-black/80 z-20 shadow-[0_1px_1px_rgba(255,255,255,0.12)]" />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={digit}
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: 90, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.25, 1, 0.5, 1] }}
          style={{ transformOrigin: "center center", transformStyle: "preserve-3d" }}
          className="absolute inset-0 flex items-center justify-center font-mono font-black text-[16px] text-white tabular-nums tracking-tighter"
        >
          {digit}
        </motion.div>
      </AnimatePresence>

      {/* Glossy lighting overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] via-transparent to-black/30 pointer-events-none z-10" />
    </div>
  );
}

function FlipClock({ seconds }) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const tens = Math.floor(s / 10);
  const ones = s % 10;

  return (
    <div className="flex items-center gap-[2.5px] select-none shrink-0">
      <FlipDigit digit={tens} />
      <FlipDigit digit={ones} />
      <span className="text-[9px] font-mono font-black text-white/60 ml-0.5 uppercase tracking-tight">s</span>
    </div>
  );
}

// 2. LASER PROGRESS BEAM (Thin radiant laser line beam transitioning from Electric Green to Danger Orange)
function ProgressBeam({ progress }) {
  // progress goes from 100% (highest remaining time) down to 0% (danger remaining time)
  const clamped = Math.max(0, Math.min(100, progress));
  
  // Dynamic laser hue: 142deg (Electric Neon Green) at 100% -> 65deg (Yellow-Green) at 50% -> 22deg (Laser Orange) at 0%
  const hue = Math.round(22 + (clamped / 100) * (142 - 22));
  const beamColor = `hsl(${hue}, 100%, 50%)`;
  const beamGlow = `hsla(${hue}, 100%, 50%, 0.75)`;
  const beamCore = `hsl(${hue}, 100%, 85%)`;

  return (
    <div className="flex-1 relative flex items-center justify-center min-w-[70px] h-[20px] px-1 select-none">
      {/* Razor-thin conduit track line */}
      <div className="w-full h-[1.5px] bg-black/40 dark:bg-white/10 rounded-full relative overflow-visible">
        {/* Faint ambient line track glow */}
        <div className="absolute inset-0 bg-white/5 blur-[1px]" />

        {/* Radiant Laser Line Beam */}
        <div
          className="h-[2.5px] -top-[0.5px] rounded-full relative transition-all duration-100 ease-linear flex items-center justify-end"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, hsl(142, 100%, 45%) 0%, ${beamColor} 100%)`,
            boxShadow: `0 0 4px ${beamCore}, 0 0 10px ${beamGlow}, 0 0 18px ${beamGlow}`,
          }}
        >
          {/* Laser Head Flare / Spark on leading edge */}
          {clamped > 1 && (
            <div className="relative flex items-center justify-center">
              {/* Outer halo */}
              <div
                className="absolute w-[9px] h-[9px] rounded-full animate-ping opacity-60 pointer-events-none"
                style={{ backgroundColor: beamColor }}
              />
              {/* Core radiant spark */}
              <div
                className="w-[4px] h-[7px] rounded-full z-10 shadow-[0_0_8px_#ffffff]"
                style={{
                  backgroundColor: '#ffffff',
                  boxShadow: `0 0 6px #ffffff, 0 0 12px ${beamColor}, 0 0 18px ${beamGlow}`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 3. REALTIME RESULT TRACKER (Live Winning/Losing indicator + real-time payout tracker)
function RealtimeResultTracker({ isWinning, pnl, currentPrice, entryPrice }) {
  return (
    <div className="shrink-0 flex items-center select-none">
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all duration-300 ${
          isWinning
            ? 'bg-[#17A364]/20 border-[#17A364]/50 text-[#17A364] shadow-[0_0_12px_rgba(23,163,100,0.3)]'
            : 'bg-[#FF914D]/20 border-[#FF914D]/50 text-[#FF914D] shadow-[0_0_12px_rgba(255,145,77,0.3)]'
        }`}
      >
        {/* Pulsing live radar beacon */}
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isWinning ? 'bg-[#17A364]' : 'bg-[#FF914D]'
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isWinning ? 'bg-[#17A364]' : 'bg-[#FF914D]'
            }`}
          />
        </span>

        {/* Live Status Label */}
        <span className="text-[10px] font-black tracking-wider uppercase">
          {isWinning ? 'WINNING' : 'LOSING'}
        </span>

        {/* Live Projected PnL */}
        <span className="text-[11px] font-black font-mono tracking-tight">
          {isWinning ? `+$${pnl}` : `-$${pnl}`}
        </span>
      </div>
    </div>
  );
}

export default function TradingWidget({
  price,
  activeMarket,
  sessionBalance,
  handleExecuteTrade,
  theme,
  liveOdds,
  activeTrade,
  isExecuting,
}) {
  const [selectedDuration, setSelectedDuration] = useState(15);
  const [stakeInput, setStakeInput] = useState('');
  const stake = parseFloat(stakeInput) || 0;

  const [progress, setProgress] = useState(100);
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
        
        const currentProgress = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
        setProgress(currentProgress);

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
  
  let isWinning = false;
  if (activeTrade) {
    if (activeTrade.direction === 'UP' || activeTrade.direction === 'YES') {
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

  const tradeStake = parseFloat(activeTrade?.amount) || stake || 0;
  const livePayoutEst = isWinning
    ? (activeTrade?.payout ? Number(activeTrade.payout).toFixed(2) : (activeTrade?.direction === 'YES' || activeTrade?.direction === 'UP' ? yesPayoutAmt : noPayoutAmt))
    : Number(tradeStake).toFixed(2);

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
              className={`w-full h-full relative overflow-hidden flex items-center justify-between rounded-full font-black text-[15px] tracking-wide ${
                isLight ? 'bg-gray-100 text-gray-900 border border-gray-200 shadow-sm' : 'bg-[#111418] text-white border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]'
              }`}
            >
              <div className="absolute inset-0 flex items-center justify-between px-3 z-10 w-full">
                {isExecuting ? (
                  <div className="w-full text-center text-[#17A364] animate-pulse text-[16px] font-black tracking-widest flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2 border-[#17A364] border-t-transparent animate-spin" />
                    PLACING TRADE...
                  </div>
                ) : ['PENDING', 'RESOLVING'].includes(activeTrade?.status) ? (
                  <div className="flex w-full h-full items-center justify-between gap-2.5">
                    {/* 1. FLIP CLOCK WITH DIRECTION BADGE */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                        activeTrade.direction === 'YES' || activeTrade.direction === 'UP'
                          ? 'bg-[#17A364]/15 text-[#17A364] border-[#17A364]/40 shadow-[0_0_8px_rgba(23,163,100,0.2)]'
                          : 'bg-[#FF914D]/15 text-[#FF914D] border-[#FF914D]/40 shadow-[0_0_8px_rgba(255,145,77,0.2)]'
                      }`}>
                        {activeTrade.direction === 'YES' || activeTrade.direction === 'UP' ? 'UP' : 'DN'}
                      </span>
                      <FlipClock seconds={remainingSec} />
                    </div>

                    {/* 2. PROGRESS BEAM (Green -> Orange) */}
                    <ProgressBeam progress={progress} />
                    
                    {/* 3. REALTIME RESULT TRACKER */}
                    <RealtimeResultTracker
                      isWinning={isWinning}
                      pnl={livePayoutEst}
                      currentPrice={currentPrice}
                      entryPrice={entryPrice}
                    />
                  </div>
                ) : (
                  <div className="flex w-full h-full items-center justify-between px-4">
                    <span className="text-[14px] font-black uppercase tracking-wider opacity-60">OUTCOME</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[16px] font-black font-mono tracking-tight ${['WON', 'PAID'].includes(activeTrade?.status) || activeTrade?.won ? 'text-[#17A364]' : 'text-[#EF4444]'}`}>
                        {['WON', 'PAID'].includes(activeTrade?.status) || activeTrade?.won
                          ? `WON +$${activeTrade.payout ? Number(activeTrade.payout).toFixed(2) : livePayoutEst}` 
                          : `LOST -$${Number(tradeStake).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
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
              className="flex justify-between gap-3 h-full"
            >
              <button
                onClick={() => handleTrade('YES')}
                disabled={stake <= 0 || stake > (sessionBalance || 0)}
                className="flex-1 h-full bg-[#17A364] hover:bg-[#0C6F3F] disabled:opacity-50 text-white rounded-full flex items-center justify-center transition-colors text-[20px] font-black tracking-wide"
              >
                YES <span className="text-[18px] ml-2 inline-flex items-center"><PriceMeterTicker value={Math.round(yesShare * 100)} />¢</span>
              </button>
              <button
                onClick={() => handleTrade('NO')}
                disabled={stake <= 0 || stake > (sessionBalance || 0)}
                className="flex-1 h-full bg-[#FF914D] hover:bg-[#E67E3A] disabled:opacity-50 text-white rounded-full flex items-center justify-center transition-colors text-[20px] font-black tracking-wide"
              >
                NO <span className="text-[18px] ml-2 inline-flex items-center"><PriceMeterTicker value={Math.round(noShare * 100)} />¢</span>
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
