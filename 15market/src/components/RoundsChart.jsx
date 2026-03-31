import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Lock, Timer, Zap, Trophy, AlertCircle } from 'lucide-react';

/**
 * RoundsChart — Premium Live Chart with Split-Screen Animations.
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
    const isDark = !isLight;
    
    // Freeze the entry price locally as soon as the phase transitions to locked.
    // This stops the entry line from constantly following the live price!
    const frozenEntryPriceRef = useRef(null);
    useEffect(() => {
        if (phase === 'locked') {
            if (frozenEntryPriceRef.current === null) {
                const p = parseFloat(entryPrice);
                if (!isNaN(p)) frozenEntryPriceRef.current = p;
            }
        } else {
            frozenEntryPriceRef.current = null;
        }
    }, [phase, entryPrice]);

    const effectiveEntryPrice = (phase === 'locked' && frozenEntryPriceRef.current !== null) 
        ? frozenEntryPriceRef.current 
        : parseFloat(entryPrice);

    const ePriceNum = effectiveEntryPrice;
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

            const ePrice = effectiveEntryPrice;
            if (targetPriceRef.current !== null && interpolatedPriceRef.current !== null) {
                const diff = targetPriceRef.current - interpolatedPriceRef.current;
                interpolatedPriceRef.current += diff * 0.15;
            }

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
            const labelH = 20; // Corrected fixed spacing for better alignment
            const liveX = W - 100; // Leave more room for the label "in front"
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
                ctx.beginPath(); ctx.roundRect(10, entryY - 10, 50, 20, 10); ctx.fill();
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 10px Inter, sans-serif';
                ctx.fillText('ENTRY', 18, entryY + 4);
            }

            // Exit Marker (if settled)
            if (isSettled) {
                const exitY = toY(cPriceNum);
                ctx.fillStyle = isAbove ? GREEN : RED;
                ctx.beginPath(); ctx.roundRect(W - 70, exitY - 10, 60, 20, 10); ctx.fill();
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

                // Fill Path - Ensuring it starts from outside left
                ctx.beginPath();
                let firstX = -100; // Force it to start off-screen
                ctx.moveTo(firstX, H); 
                
                history.forEach(pt => {
                    const x = getX(pt.t);
                    const y = toY(pt.p);
                    if (x < -200 || x > W + 100) return;
                    if (firstX === -100) { ctx.lineTo(x, y); firstX = x; }
                    else ctx.lineTo(x, y);
                });
                
                ctx.lineTo(liveX, liveY);
                ctx.lineTo(liveX, H);
                ctx.closePath();
                ctx.save();
                ctx.fillStyle = grad; ctx.fill();
                ctx.restore();

                // Stroke Path
                ctx.beginPath();
                let started = false;
                history.forEach(pt => {
                    const x = getX(pt.t);
                    const y = toY(pt.p);
                    if (x < -200 || x > W + 100) return;
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

                // Live Price Label
                const labelText = latestPriceVal.toFixed(2);
                ctx.font = 'bold 12px IBM Plex Mono, monospace';
                const labelW = ctx.measureText(labelText).width + 16;
                const priceLabelH = 20;

                // Horizontal Line
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = `${statusColor}40`;
                ctx.beginPath(); ctx.moveTo(0, liveY); ctx.lineTo(W, liveY); ctx.stroke();
                ctx.setLineDash([]);

                // Label Box
                ctx.fillStyle = statusColor;
                ctx.beginPath();
                ctx.roundRect(W - labelW - 10, liveY - priceLabelH/2, labelW, priceLabelH, 6);
                ctx.fill();
                
                ctx.fillStyle = '#ffffff';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, W - labelW - 10 + 8, liveY);
            }

            // 4. DYNAMIC GLOWING GRID (Premium Effect)
            const gridStep = 50;
            const gridOffset = (nowPx / 60) % gridStep;
            
            ctx.save();
            ctx.strokeStyle = isLight ? 'rgba(60,179,113,0.06)' : 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            
            // Draw Grid Lines
            for (let x = -gridOffset; x < W + gridStep; x += gridStep) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            }
            for (let y = 0; y < H; y += gridStep) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            }

            // Draw Glowing Intersections
            ctx.fillStyle = isLight ? 'rgba(60,179,113,0.12)' : 'rgba(255,255,255,0.08)';
            for (let x = -gridOffset; x < W + gridStep; x += gridStep) {
                for (let y = 0; y < H; y += gridStep) {
                    if ((Math.floor(x + gridOffset) / gridStep + Math.floor(y / gridStep)) % 3 === 0) {
                        ctx.beginPath();
                        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            // Subtle Spotlight tracking live price
            const spotlight = ctx.createRadialGradient(liveX, liveY, 0, liveX, liveY, 150);
            spotlight.addColorStop(0, isLight ? 'rgba(60,179,113,0.05)' : 'rgba(60,179,113,0.08)');
            spotlight.addColorStop(1, 'transparent');
            ctx.fillStyle = spotlight;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();

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
        <div className={`relative w-full h-full flex flex-col overflow-hidden bg-[#0d0d0d] select-none ${!isDark ? 'bg-[#e2efea]' : ''}`}>
            {/* Branded Background Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img src="/logo.png" alt="15market" style={{
                    width: '85%',
                    opacity: isDark ? 0.08 : 0.05,
                    filter: isDark ? 'grayscale(1) brightness(0.7)' : 'grayscale(1) brightness(0.1)',
                    mixBlendMode: isDark ? 'screen' : 'multiply'
                }} />
            </div>
            <canvas ref={canvasRef} className="flex-1 w-full h-full relative z-10" />



            {/* STATUS BAR (Price, Pools, Timer) */}
            <div className={`absolute top-2 left-2 right-2 flex items-center justify-between gap-2 z-30 transition-all duration-500 ${showEntrySplit ? 'opacity-0 translate-y-[-20px]' : 'opacity-100'}`}>
                
                {/* LEFT: Price & Pools */}
                <div className="flex items-center gap-1.5 md:gap-3 flex-1">
                    {/* Live Price Pill - Now Horizontal for better visibility */}
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/40 backdrop-blur-xl border ${phase === 'locked' ? (isAbove ? 'border-[#3CB371]/40' : 'border-[#FF7F50]/40') : 'border-white/5'}`}>
                        <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${phase === 'entry' ? 'bg-[#3CB371]' : (isAbove ? 'bg-[#3CB371]' : 'bg-[#FF7F50]')}`} />
                            <span className="text-[8px] font-black text-white/40 tracking-widest uppercase truncate">
                                {phase === 'entry' ? 'Live' : (isAbove ? 'Bullish' : 'Bearish')}
                            </span>
                        </div>
                        <div className="w-[1px] h-3 bg-white/10" />
                        <span className={`text-sm md:text-lg font-black font-mono tabular-nums leading-none ${phase === 'entry' ? 'text-[#3CB371]' : (isAbove ? 'text-[#3CB371]' : 'text-[#FF7F50]')}`}>
                            ${parseFloat(currentPrice).toFixed(2)}
                        </span>
                    </div>

                    {/* Pools Pill (Shifted to the left of timer) */}
                    <div className="flex items-center p-1 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5 shadow-2xl overflow-hidden min-w-[120px] md:min-w-[180px]">
                        {/* Long Half */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 flex-1 transition-all ${isAbove ? 'bg-[#3CB371]/10' : ''}`}>
                             <TrendingUp size={10} className={isAbove ? 'text-[#3CB371]' : 'text-white/20'} />
                             <span className={`text-[11px] font-black ${isAbove ? 'text-[#3CB371]' : 'text-white'}`}>{longPct}%</span>
                        </div>
                        {/* Divider */}
                        <div className="w-[1px] h-4 bg-white/10" />
                        {/* Short Half */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 flex-1 transition-all ${!isAbove ? 'bg-[#FF7F50]/10' : ''}`}>
                             <span className={`text-[11px] font-black ${!isAbove ? 'text-[#FF7F50]' : 'text-white'}`}>{shortPct}%</span>
                             <TrendingDown size={10} className={!isAbove ? 'text-[#FF7F50]' : 'text-white/20'} />
                        </div>
                    </div>
                </div>

                {/* RIGHT: Timer */}
                <div className="relative w-12 h-12 md:w-14 md:h-14 shrink-0">
                    <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                        <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                        <circle cx="28" cy="28" r="24" fill="none" stroke={timeLeft > 5 ? '#3CB371' : '#FF7F50'} strokeWidth="3" strokeDasharray={150} strokeDashoffset={150 * (1 - (timeLeft / totalDuration))} strokeLinecap="round" className="transition-all duration-1000" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                        <span className="text-[12px] md:text-[14px] font-black font-mono text-white">{timeLeft}s</span>
                        <span className={`text-[6px] font-black uppercase tracking-tighter mt-0.5 ${timeLeft > 5 ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>Left</span>
                    </div>
                </div>
            </div>

            {/* ANIMATION LAYERS */}
            <AnimatePresence>
                {/* 1. ENTRY COUNTDOWN SLIT SCREEN (Last 5s of Entry) */}
                {showEntrySplit && (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex overflow-hidden"
                    >                        {/* LEFT: LONG */}
                        <motion.div 
                            initial={{ x: '-100%', skewX: -15 }} animate={{ x: 0, skewX: -15 }} 
                            className="absolute inset-y-0 left-[-20%] w-[70%] bg-[#3CB371] z-10 flex items-center justify-center border-r-[15px] border-white/20 shadow-[30px_0_60px_rgba(0,0,0,0.6)] overflow-hidden"
                            transition={{ type: "spring", damping: 25, stiffness: 80 }}
                        >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 pointer-events-none mix-blend-overlay" />
                            <div className="skew-x-[15%] flex flex-col items-center relative z-10 ml-4 md:ml-10 lg:ml-14 max-w-[60%] overflow-hidden text-center">
                                <TrendingUp className="size-12 md:size-24 lg:size-32 text-white mb-2 md:mb-4 drop-shadow-[0_0_40px_rgba(255,255,255,0.6)] shrink-0" />
                                <h2 className="text-3xl md:text-5xl lg:text-7xl font-black text-white italic tracking-tighter uppercase whitespace-nowrap overflow-hidden text-ellipsis">LONG</h2>
                            </div>
                        </motion.div>

                        {/* RIGHT: SHORT */}
                        <motion.div 
                            initial={{ x: '100%', skewX: -15 }} animate={{ x: 0, skewX: -15 }} 
                            className="absolute inset-y-0 right-[-20%] w-[70%] bg-[#FF7F50] z-0 flex items-center justify-center overflow-hidden"
                            transition={{ type: "spring", damping: 25, stiffness: 80 }}
                        >
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 pointer-events-none mix-blend-overlay" />
                            <div className="skew-x-[15%] flex flex-col items-center relative z-10 mr-4 md:mr-10 lg:mr-14 max-w-[60%] overflow-hidden text-center">
                                <TrendingDown className="size-12 md:size-24 lg:size-32 text-white mb-2 md:mb-4 drop-shadow-[0_0_40px_rgba(255,255,255,0.6)] shrink-0" />
                                <h2 className="text-3xl md:text-5xl lg:text-7xl font-black text-white italic tracking-tighter uppercase whitespace-nowrap overflow-hidden text-ellipsis">SHORT</h2>
                            </div>
                        </motion.div>
 
                        {/* CENTER RELOADED COUNTDOWN - Corrected Position */}
                        <div className="absolute inset-0 z-[55] flex items-center justify-center pointer-events-none">
                            <motion.div 
                                initial={{ scale: 0, rotate: -90 }} 
                                animate={{ scale: 1, rotate: 0 }}
                                exit={{ scale: 0 }}
                                className="w-48 h-48 flex items-center justify-center pointer-events-auto"
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
                        </div>
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
                            
                            <div className={`flex flex-col items-center justify-center h-full w-full relative z-10 px-4 md:px-10 text-center overflow-hidden`}>
                                <motion.div 
                                    animate={{ 
                                        scale: [1, 1.1, 1], 
                                        rotate: [0, 5, -5, 0],
                                        filter: ["drop-shadow(0 0 20px white)", `drop-shadow(0 0 40px gold)`, "drop-shadow(0 0 20px white)"]
                                    }} 
                                    transition={{ repeat: Infinity, duration: 2.5 }}
                                    className="shrink-0"
                                >
                                    <Trophy className="size-16 md:size-32 lg:size-40 text-white mb-4 md:mb-8 drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]" />
                                </motion.div>
                                <h1 className="text-3xl md:text-6xl lg:text-8xl font-black text-white italic tracking-tighter drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] uppercase leading-none max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                    {isAbove ? 'Long Wins' : 'Short Wins'}
                                </h1>
                                <span className="text-[10px] md:text-lg font-black text-white/40 uppercase tracking-[0.4em] mt-4 md:mt-6 bg-black/20 px-6 py-2 rounded-full backdrop-blur-sm shrink-0">
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
