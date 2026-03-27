import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Lock, Timer, Zap, Trophy, AlertCircle } from 'lucide-react';

/**
 * RoundsChart â€” Premium Live Chart with Split-Screen Animations.
 * Handles Entry Countdown, Live Tracking, and Result Reveal.
 */
export default function RoundsChart({
    theme,
    currentPrice,
    entryPrice,
    timeLeft,        
    totalDuration,   
    pools,           
    userDirection,   
    onResult,        
    odds,
    isSettled,
    result,
    phase = 'locked', // 'entry' | 'locked'
    priceHistory = []
}) {
    const canvasRef = useRef(null);
    const priceHistoryRef = useRef(priceHistory || []);
    const rafRef = useRef(null);
    const isLight = theme === 'light';
    const ePriceNum = parseFloat(entryPrice);
    const cPriceNum = parseFloat(currentPrice);
 
    // Capture exit price locally for immediate result animation
    const [localExitPrice, setLocalExitPrice] = useState(null);
    useEffect(() => {
        if (phase === 'locked' && timeLeft <= 0 && localExitPrice === null) {
            setLocalExitPrice(cPriceNum);
        } else if (phase === 'entry' && localExitPrice !== null) {
            setLocalExitPrice(null);
        }
    }, [phase, timeLeft, cPriceNum, localExitPrice]);
 
    const isAbove = result 
        ? (result === 'WON') 
        : (!isNaN(ePriceNum) && !isNaN(localExitPrice || cPriceNum) ? (localExitPrice || cPriceNum) > ePriceNum : false);

    // Build colour palette
    const GREEN = '#3CB371';
    const RED = '#FF7F50';
    const NEUTRAL = '#808080';
    // Remove grid as requested
    const GRID = 'transparent';

    const hasGeneratedSynthetic = useRef(false);

    // Track price history for drawing the line
    const targetPriceRef = useRef(null);
    const interpolatedPriceRef = useRef(null);
    const smoothedLoRef = useRef(null);
    const smoothedHiRef = useRef(null);

    useEffect(() => {
        const price = parseFloat(currentPrice);
        if (!price || isNaN(price)) return;
        targetPriceRef.current = price;
        if (interpolatedPriceRef.current === null) {
            interpolatedPriceRef.current = price;
        }
    }, [currentPrice]);

    // Generate synthetic history for "always-there" effect
    useEffect(() => {
        if (!currentPrice || hasGeneratedSynthetic.current) return;
        const now = Date.now();
        const startPrice = parseFloat(currentPrice);
        
        // Generate synthetic history ONLY ONCE
        const history = [];
        for (let i = 240; i >= 0; i--) {
            const t = now - (i * 500);
            const p = startPrice + (Math.random() - 0.5) * (startPrice * 0.0003);
            history.push({ t, p: parseFloat(p.toFixed(2)) });
        }
        priceHistoryRef.current = history;
        hasGeneratedSynthetic.current = true;
    }, [currentPrice]);

    // Record history
    useEffect(() => {
        const historyInterval = setInterval(() => {
            if (interpolatedPriceRef.current !== null) {
                const now = Date.now();
                const lastPt = priceHistoryRef.current[priceHistoryRef.current.length - 1];
                
                // Strict Monotonicity to prevent wrapping glitches
                if (!lastPt || now > lastPt.t) {
                    priceHistoryRef.current.push({ t: now, p: interpolatedPriceRef.current });
                }
                
                // Keep 120s window + 500 point cap for performance
                const cutoff = now - 120000;
                if (priceHistoryRef.current.length > 500) {
                    priceHistoryRef.current = priceHistoryRef.current.filter(pt => pt.t >= cutoff);
                }
            }
        }, 50);
        return () => clearInterval(historyInterval);
    }, []);

    // Sync history from prop on mount
    useEffect(() => {
        if (priceHistory && priceHistory.length > 0 && priceHistoryRef.current.length <= 1) {
            // Ensure monotonic if merging
            const incoming = [...priceHistory].sort((a,b) => a.t - b.t);
            priceHistoryRef.current = incoming;
        }
    }, [priceHistory]);

    // Particles system
    const particlesRef = useRef([]);
    useEffect(() => {
        particlesRef.current = Array.from({ length: 30 }, () => ({
            x: Math.random() * 100,
            y: Math.random() * 100,
            s: 0.05 + Math.random() * 0.2,
            o: 0.1 + Math.random() * 0.2,
            size: 0.5 + Math.random() * 1.5,
            direction: Math.random() > 0.5 ? 1 : -1
        }));
    }, []);

    // Canvas Draw Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });

        const draw = () => {
            const W = canvas.offsetWidth;
            const H = canvas.offsetHeight;
            if (!W || !H) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }
            if (canvas.width !== W || canvas.height !== H) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = W * dpr;
                canvas.height = H * dpr;
                ctx.scale(dpr, dpr);
            }

            // Lerp current price
            if (targetPriceRef.current !== null && interpolatedPriceRef.current !== null) {
                const diff = targetPriceRef.current - interpolatedPriceRef.current;
                interpolatedPriceRef.current += diff * 0.15;
            }

            const ePrice = parseFloat(entryPrice);
            const history = priceHistoryRef.current;
            const latestPriceVal = interpolatedPriceRef.current || ePrice;

            // 1. Clear & Background
            ctx.fillStyle = isLight ? '#ffffff' : '#050505';
            ctx.fillRect(0, 0, W, H);
            // Determine lo/hi for the window
            let lo, hi, hRange;
            if (!isNaN(ePrice) && phase === 'locked') {
                // Determine symmetrical distance to ensure ePrice is at EXACT center
                const maxDist = Math.max(Math.abs(latestPriceVal - ePrice), ePrice * 0.0006);
                const rawLo = ePrice - maxDist * 1.5;
                const rawHi = ePrice + maxDist * 1.5;
                
                if (smoothedLoRef.current === null) smoothedLoRef.current = rawLo;
                if (smoothedHiRef.current === null) smoothedHiRef.current = rawHi;
                
                smoothedLoRef.current += (rawLo - smoothedLoRef.current) * 0.1;
                smoothedHiRef.current += (rawHi - smoothedHiRef.current) * 0.1;
                
                lo = smoothedLoRef.current;
                hi = smoothedHiRef.current;
            } else {
                // Floating view for entry phase (Auto-scaling based on history)
                const prices = history.map(p => p.p);
                if (prices.length > 0) {
                    const minP = Math.min(...prices, latestPriceVal);
                    const maxP = Math.max(...prices, latestPriceVal);
                    const pad = (maxP - minP) * 0.2 || latestPriceVal * 0.0005;
                    const rawLo = minP - pad;
                    const rawHi = maxP + pad;

                    if (smoothedLoRef.current === null) smoothedLoRef.current = rawLo;
                    if (smoothedHiRef.current === null) smoothedHiRef.current = rawHi;
                    
                    smoothedLoRef.current += (rawLo - smoothedLoRef.current) * 0.05;
                    smoothedHiRef.current += (rawHi - smoothedHiRef.current) * 0.05;
                } else {
                    smoothedLoRef.current = latestPriceVal * 0.999;
                    smoothedHiRef.current = latestPriceVal * 1.001;
                }
                lo = smoothedLoRef.current;
                hi = smoothedHiRef.current;
            }

            hRange = hi - lo;
            const toY = (p) => H - ((p - lo) / hRange) * H;
            const entryY = !isNaN(ePrice) ? toY(ePrice) : H / 2;
            const nowPx = Date.now();
            const windowMs = 15000; 
            const liveX = W * 0.95; 
            const oldest = nowPx - windowMs;
            const liveY = toY(latestPriceVal);

            // Shaded Zones (Only if we have entry price and are locked)
            if (!isNaN(ePrice) && phase === 'locked') {
                const isPriceAbove = latestPriceVal >= ePrice;
                const statusColor = isPriceAbove ? GREEN : RED;
                ctx.fillStyle = isPriceAbove ? `${GREEN}08` : `${RED}08`;
                if (isPriceAbove) ctx.fillRect(0, 0, W, entryY);
                else ctx.fillRect(0, entryY, W, H - entryY);

                // Entry line & Marker
                ctx.setLineDash([8, 8]);
                ctx.strokeStyle = `${GREEN}b0`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(0, entryY); ctx.lineTo(W, entryY); ctx.stroke();
                ctx.setLineDash([]);

                // Entry Label Box
                ctx.fillStyle = GREEN;
                ctx.beginPath(); ctx.roundRect(10, entryY - 10, 50, 20, 4); ctx.fill();
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 10px Inter, sans-serif';
                ctx.fillText('ENTRY', 18, entryY + 4);
            }

            // Exit Marker (if settled)
            if (isSettled) {
                const exitY = toY(cPriceNum);
                ctx.fillStyle = isAbove ? GREEN : RED;
                ctx.beginPath(); ctx.roundRect(W - 70, exitY - 10, 60, 20, 4); ctx.fill();
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 10px Inter, sans-serif';
                ctx.fillText('EXIT', W - 52, exitY + 4);

                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = isAbove ? `${GREEN}80` : `${RED}80`;
                ctx.beginPath(); ctx.moveTo(0, exitY); ctx.lineTo(W, exitY); ctx.stroke();
                ctx.setLineDash([]);
            }

            // Path Drawing
            if (history.length >= 1) {
                const getX = (t) => liveX - ((nowPx - t) / windowMs) * W;
                const statusColor = (phase === 'locked' && !isNaN(ePrice)) 
                    ? (latestPriceVal >= ePrice ? GREEN : RED)
                    : '#3CB371'; // Default green for entry streaming

                const grad = ctx.createLinearGradient(0, 0, 0, H);
                grad.addColorStop(0, `${statusColor}25`);
                grad.addColorStop(1, 'transparent');

                // Fill Path
                ctx.beginPath();
                let firstX = -1;
                history.forEach(pt => {
                    const x = getX(pt.t);
                    const y = toY(pt.p);
                    if (x < -100 || x > W + 100) return;
                    if (firstX === -1) { ctx.moveTo(x, y); firstX = x; }
                    else ctx.lineTo(x, y);
                });
                ctx.lineTo(liveX, liveY);
                if (firstX !== -1) {
                    ctx.save();
                    ctx.lineTo(liveX, H); ctx.lineTo(firstX, H); ctx.closePath();
                    ctx.fillStyle = grad; ctx.fill();
                    ctx.restore();
                }

                // Stroke Path
                ctx.beginPath();
                let started = false;
                history.forEach(pt => {
                    const x = getX(pt.t);
                    const y = toY(pt.p);
                    if (x < -100 || x > W + 100) return;
                    if (!started) { ctx.moveTo(x, y); started = true; }
                    else ctx.lineTo(x, y);
                });
                ctx.lineTo(liveX, liveY);
                ctx.lineWidth = 4;
                ctx.strokeStyle = statusColor;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();

                // Price Dot
                ctx.fillStyle = statusColor;
                ctx.shadowBlur = 15; ctx.shadowColor = statusColor;
                ctx.beginPath(); ctx.arc(liveX, liveY, 6, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Particles (Always on)
            particlesRef.current.forEach(p => {
                p.y -= p.s * p.direction;
                if (p.y < -5) p.y = 105;
                if (p.y > 105) p.y = -5;
                const px = (p.x / 100) * W;
                const py = (p.y / 100) * H;
                ctx.fillStyle = isLight ? `rgba(60,179,113,${p.o})` : `rgba(255,255,255,${p.o})`;
                ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
            });

            rafRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [entryPrice, theme, isLight, phase]);

    // Result Logic
    const resultTriggered = useRef(false);
    useEffect(() => {
        if (timeLeft > 0) resultTriggered.current = false;
        if (timeLeft <= 0 && !resultTriggered.current && !isSettled && phase === 'locked') {
            resultTriggered.current = true;
            onResult?.(isAbove ? 'WON' : 'LOST', cPriceNum);
        }
    }, [timeLeft, isAbove, cPriceNum, onResult, isSettled, phase]);

    const showEntrySplit = phase === 'entry' && timeLeft <= 5;
    const showLockedCountdown = phase === 'locked' && timeLeft >= 13;
    const showWinnerAnimation = isSettled || (phase === 'locked' && timeLeft <= 0);

    const totalPool = (pools?.long || 0) + (pools?.short || 0);
    const longPct = totalPool > 0 ? ((pools.long / totalPool) * 100).toFixed(0) : 50;
    const shortPct = totalPool > 0 ? ((pools.short / totalPool) * 100).toFixed(0) : 50;

    return (
        <div className="relative w-full h-full flex flex-col overflow-hidden bg-black select-none">
            <canvas ref={canvasRef} className="flex-1 w-full h-full" />

            {/* LIVE PRICE OVERLAY (Entry & Locked Phases) */}
            {!showLockedCountdown && !showWinnerAnimation && (
                <div className="absolute top-4 left-4 flex flex-col gap-1 z-20">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${phase === 'entry' ? 'bg-[#3CB371]' : (isAbove ? 'bg-[#3CB371]' : 'bg-[#FF7F50]')}`} />
                        <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase">
                            {phase === 'entry' ? 'Pre-Round Preview' : 'Active Market'}
                        </span>
                        {phase === 'locked' && (
                            <div className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest transition-all duration-500 scale-90 ${isAbove ? 'bg-[#3CB371]/10 border-[#3CB371]/30 text-[#3CB371]' : 'bg-[#FF7F50]/10 border-[#FF7F50]/30 text-[#FF7F50]'}`}>
                                {isAbove ? 'BULLISH' : 'BEARISH'}
                            </div>
                        )}
                    </div>
                    <span className={`text-xl font-black font-mono tabular-nums leading-none ${phase === 'entry' ? 'text-[#3CB371]' : (isAbove ? 'text-[#3CB371]' : 'text-[#FF7F50]')}`}>
                        ${parseFloat(currentPrice).toFixed(2)}
                    </span>
                    {phase === 'locked' && !isNaN(ePriceNum) && (
                        <span className="text-[9px] font-bold text-white/30 tracking-widest uppercase">Target: ${parseFloat(entryPrice).toFixed(2)}</span>
                    )}
                </div>
            )}

            {/* POOLS OVERLAY (TOP) */}
            <div className={`absolute top-4 left-0 right-0 flex justify-center gap-4 px-4 transition-all duration-500 z-30 ${showEntrySplit ? 'opacity-0 translate-y-[-20px]' : 'opacity-100'}`}>
                <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-xl border ${isAbove ? 'border-[#3CB371] shadow-[0_0_20px_rgba(60,179,113,0.2)]' : 'border-white/5 opacity-50'}`}>
                    <TrendingUp size={12} className="text-[#3CB371]" />
                    <span className="text-xs font-black text-white">{longPct}%</span>
                    <span className="text-[9px] font-bold text-white/30">${(pools?.long || 0).toFixed(0)}</span>
                </div>
                
                <div className="relative w-12 h-12 shrink-0">
                    <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                        <circle cx="28" cy="28" r="22" fill="none" stroke={timeLeft > 5 ? '#3CB371' : '#FF7F50'} strokeWidth="4" strokeDasharray={138} strokeDashoffset={138 * (1 - (timeLeft / totalDuration))} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[12px] font-black font-mono text-white">{timeLeft}s</span>
                    </div>
                </div>

                <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-xl border ${!isAbove ? 'border-[#FF7F50] shadow-[0_0_20px_rgba(255,127,80,0.2)]' : 'border-white/5 opacity-50'}`}>
                    <span className="text-[9px] font-bold text-white/30">${(pools?.short || 0).toFixed(0)}</span>
                    <span className="text-xs font-black text-white">{shortPct}%</span>
                    <TrendingDown size={12} className="text-[#FF7F50]" />
                </div>
            </div>

            {/* ANIMATION LAYERS */}
            <AnimatePresence>
                {/* 1. ENTRY COUNTDOWN SLIT SCREEN (Last 5s of Entry) */}
                {showEntrySplit && (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex overflow-hidden"
                    >
                        {/* LEFT: LONG */}
                        <motion.div 
                            initial={{ x: '-100%', skewX: -15 }} animate={{ x: 0, skewX: -15 }} 
                            className="absolute inset-y-0 left-[-15%] w-[65%] bg-[#3CB371] z-10 flex items-center justify-center border-r-[15px] border-white/20 shadow-[30px_0_60px_rgba(0,0,0,0.6)] overflow-hidden"
                            transition={{ type: "spring", damping: 25, stiffness: 80 }}
                        >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 pointer-events-none mix-blend-overlay" />
                            <div className="skew-x-[15%] flex flex-col items-center relative z-10 mr-10">
                                <TrendingUp size={40} className="md:size-[100px] text-white mb-2 md:mb-6 drop-shadow-[0_0_40px_rgba(255,255,255,0.6)]" />
                                <h2 className="text-4xl md:text-8xl font-black text-white italic tracking-tighter uppercase">LONG</h2>
                            </div>
                        </motion.div>
 
                        {/* RIGHT: SHORT */}
                        <motion.div 
                            initial={{ x: '100%', skewX: -15 }} animate={{ x: 0, skewX: -15 }} 
                            className="absolute inset-y-0 right-[-15%] w-[65%] bg-[#FF7F50] z-0 flex items-center justify-center overflow-hidden"
                            transition={{ type: "spring", damping: 25, stiffness: 80 }}
                        >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 pointer-events-none mix-blend-overlay" />
                            <div className="skew-x-[15%] flex flex-col items-center relative z-10 ml-10">
                                <TrendingDown size={40} className="md:size-[100px] text-white mb-2 md:mb-6 drop-shadow-[0_0_40px_rgba(255,255,255,0.6)]" />
                                <h2 className="text-4xl md:text-8xl font-black text-white italic tracking-tighter uppercase">SHORT</h2>
                            </div>
                        </motion.div>
 
                        {/* CENTER RELOADED COUNTDOWN - Corrected Position */}
                        <motion.div 
                            initial={{ scale: 0, y: 100, rotate: -90 }} 
                            animate={{ scale: 1, y: 0, rotate: 0 }}
                            exit={{ scale: 0, y: -100 }}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 z-[55] flex items-center justify-center"
                        >
                            <div className="relative w-full h-full flex items-center justify-center">
                                {/* Glow Background */}
                                <div className="absolute inset-0 bg-[#3CB371] blur-[60px] opacity-20 animate-pulse rounded-full" />
                                
                                <div className="relative w-40 h-40 rounded-full bg-black/90 backdrop-blur-3xl border-4 border-[#3CB371]/30 flex flex-col items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                                    <span className="text-[10px] font-black text-[#3CB371] mb-1 tracking-[0.5em] uppercase">Lock In</span>
                                    <motion.span 
                                        key={timeLeft} 
                                        initial={{ scale: 1.5, opacity: 0 }} 
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="text-7xl font-black text-white font-mono italic leading-none"
                                    >
                                        {timeLeft}
                                    </motion.span>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* 2. ROUND START COUNTDOWN (Big Overlay) */}
                {showLockedCountdown && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm"
                    >
                        <div className="flex flex-col items-center gap-4">
                            <motion.div 
                                animate={{ rotate: [0, 360] }} transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                                className="w-32 h-32 rounded-full border-4 border-dashed border-[#3CB371]/30 flex items-center justify-center"
                            >
                                <Lock size={40} className="text-[#3CB371]" />
                            </motion.div>
                            <motion.h2 
                                key={timeLeft} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                                className="text-7xl font-black text-white italic tracking-tighter"
                            >
                                {timeLeft > 15 ? 'BATTLE' : 'LOCKED'}
                            </motion.h2>
                        </div>
                    </motion.div>
                )}

                {/* 3. RESULT REVEAL SLANT SLASH SCREEN (Styled Textured Card) */}
                {showWinnerAnimation && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 z-[70] flex overflow-hidden"
                    >
                        <motion.div 
                            initial={{ 
                                x: isAbove ? '-100%' : '100%', 
                                skewX: isAbove ? 20 : -20 
                            }} 
                            animate={{ 
                                x: 0, 
                                skewX: 0 
                            }}
                            transition={{ 
                                x: { type: "spring", damping: 15, stiffness: 120, mass: 1 },
                                skewX: { delay: 0.1, duration: 0.8, ease: "easeOut" }
                            }}
                            className={`absolute inset-0 z-10 shadow-[0_0_150px_rgba(0,0,0,1)] border-white/20 ${isAbove ? 'bg-[#3CB371]' : 'bg-[#FF7F50]'} w-full h-full overflow-hidden`}
                            style={{ willChange: 'transform' }}
                        >
                            {/* Texture & Glare */}
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-40 mix-blend-overlay pointer-events-none" />
                            <div className={`absolute inset-0 bg-gradient-to-${isAbove ? 'r' : 'l'} from-white/20 via-transparent to-black/30 pointer-events-none`} />
                            
                            <div className={`flex flex-col items-center justify-center h-full w-full relative z-10`}>
                                <motion.div 
                                    animate={{ 
                                        scale: [1, 1.15, 1], 
                                        rotate: [0, 5, -5, 0],
                                        filter: ["drop-shadow(0 0 20px white)", `drop-shadow(0 0 40px gold)`, "drop-shadow(0 0 20px white)"]
                                    }} 
                                    transition={{ repeat: Infinity, duration: 2.5 }}
                                >
                                    <Trophy size={80} className="md:size-[140px] text-white mb-4 md:mb-10 drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]" />
                                </motion.div>
                                <h1 className="text-5xl md:text-[10rem] font-black text-white italic tracking-tighter drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] uppercase leading-none">
                                    {isAbove ? 'Long Wins' : 'Short Wins'}
                                </h1>
                                <span className="text-[12px] md:text-2xl font-black text-white/40 uppercase tracking-[0.6em] mt-4 md:mt-8 bg-black/20 px-6 py-2 rounded-full backdrop-blur-sm">
                                    Round Settled
                                </span>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

    {/* USER WIN ALERT OVERLAY */}
            <AnimatePresence>
                {userDirection !== null && isSettled && (isAbove === (userDirection === 'UP')) && (
                    <motion.div 
                        initial={{ scale: 0.5, y: 100, opacity: 0 }} 
                        animate={{ scale: 1, y: 0, opacity: 1 }} 
                        exit={{ scale: 0.8, y: 50, opacity: 0 }}
                        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[80] px-10 py-5 rounded-[40px] bg-gradient-to-r from-[#3CB371] to-[#2E8B57] shadow-2xl border-4 border-white/30 flex items-center gap-6"
                    >
                        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center"><Zap size={32} className="text-white fill-white" /></div>
                        <div className="flex flex-col">
                            <h3 className="text-3xl font-black text-white italic tracking-tighter leading-none">YOU WON!</h3>
                            <span className="text-sm font-bold text-white/80 uppercase tracking-widest mt-1">Payout Credited</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
