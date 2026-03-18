import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Lock, Timer } from 'lucide-react';

/**
 * RoundsChart — Live line chart shown during the LOCKED phase of a Rounds P2P round.
 * Tracks price in real-time from entry price, shading WIN/LOSS zones.
 * Shows Long/Short pool amounts as overlays.
 */
export default function RoundsChart({
    theme,
    currentPrice,
    entryPrice,
    timeLeft,        // seconds remaining in locked phase (0–15)
    totalDuration,   // 15 seconds
    pools,           // { long, short, participants }
    userDirection,   // 'UP' | 'DOWN' | null (user's own direction)
    onResult,        // callback(result: 'WON' | 'LOST') when time ends
    odds,
    isSettled,       
}) {
    const canvasRef = useRef(null);
    const priceHistoryRef = useRef([]);
    const rafRef = useRef(null);
    const isLight = theme === 'light';
    const ePriceNum = parseFloat(entryPrice);
    const cPriceNum = parseFloat(currentPrice);
    const isAbove = !isNaN(ePriceNum) && !isNaN(cPriceNum) ? cPriceNum >= ePriceNum : false;

    // Smooth range state
    const smoothedLoRef = useRef(null);
    const smoothedHiRef = useRef(null);

    // Build colour palette
    const GREEN = '#3CB371';
    const RED = '#FF7F50';
    const GRID = isLight ? 'rgba(60,179,113,0.08)' : 'rgba(255,255,255,0.04)';

    // Track price history for drawing the line
    const targetPriceRef = useRef(null);
    const interpolatedPriceRef = useRef(null);

    useEffect(() => {
        const price = parseFloat(currentPrice);
        if (!price || isNaN(price)) return;
        targetPriceRef.current = price;
        if (interpolatedPriceRef.current === null) {
            interpolatedPriceRef.current = price;
        }
    }, [currentPrice]);

    // Record history
    useEffect(() => {
        const historyInterval = setInterval(() => {
            if (interpolatedPriceRef.current !== null) {
                const now = Date.now();
                priceHistoryRef.current.push({ t: now, p: interpolatedPriceRef.current });
                // Window + safety padding
                const cutoff = now - 30000;
                priceHistoryRef.current = priceHistoryRef.current.filter(pt => pt.t >= cutoff);
            }
        }, 50);
        return () => clearInterval(historyInterval);
    }, []);

    // Particle system
    const particlesRef = useRef([]);
    useEffect(() => {
        particlesRef.current = Array.from({ length: 20 }, () => ({
            x: Math.random() * 100,
            y: Math.random() * 100,
            s: 0.1 + Math.random() * 0.3,
            o: 0.05 + Math.random() * 0.15,
            size: 1 + Math.random() * 2
        }));
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false }); // Slightly better perf

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

            // Lerp current price for smooth scrolling
            if (targetPriceRef.current !== null && interpolatedPriceRef.current !== null) {
                const diff = targetPriceRef.current - interpolatedPriceRef.current;
                interpolatedPriceRef.current += diff * 0.12;
            }

            const ePrice = parseFloat(entryPrice);
            const history = priceHistoryRef.current;
            const latestPriceVal = interpolatedPriceRef.current || ePrice;

            if (!ePrice || isNaN(ePrice)) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            // ─── SMOOTH DYNAMIC RANGE ───
            const dist = Math.max(Math.abs(latestPriceVal - ePrice), ePrice * 0.0002);
            const rawLo = ePrice - dist * 2.5;
            const rawHi = ePrice + dist * 2.5;
            
            if (smoothedLoRef.current === null) smoothedLoRef.current = rawLo;
            if (smoothedHiRef.current === null) smoothedHiRef.current = rawHi;
            
            // Damping (Lerp) for the Y-scale itself to fix glitching bouncy chart
            smoothedLoRef.current += (rawLo - smoothedLoRef.current) * 0.05;
            smoothedHiRef.current += (rawHi - smoothedHiRef.current) * 0.05;
            
            const lo = smoothedLoRef.current;
            const hi = smoothedHiRef.current;
            const hRange = hi - lo;

            const toY = (p) => H - ((p - lo) / hRange) * H;
            const entryY = toY(ePrice);
            const nowPx = Date.now();

            // Time window: 20s visible
            const windowMs = 20000;
            const oldest = nowPx - (windowMs * 0.7); // Latest price at 70% mark
            const liveX = W * 0.7;
            const liveY = toY(latestPriceVal);

            // 1. Clear & Background
            ctx.fillStyle = isLight ? '#ffffff' : '#050505';
            ctx.fillRect(0, 0, W, H);

            // 2. Grid lines
            ctx.lineWidth = 1;
            ctx.strokeStyle = GRID;
            for (let x = 0; x < W; x += 60) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            }
            for (let y = 0; y < H; y += 40) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            }

            // 3. Shaded Zones
            const isPriceAbove = latestPriceVal >= ePrice;
            const statusColor = isPriceAbove ? GREEN : RED;
            
            ctx.fillStyle = isPriceAbove ? `${GREEN}10` : `${RED}10`;
            if (isPriceAbove) ctx.fillRect(0, 0, W, entryY);
            else ctx.fillRect(0, entryY, W, H - entryY);

            // 4. Particles
            particlesRef.current.forEach(p => {
                p.y -= p.s;
                if (p.y < -5) p.y = 105;
                const px = (p.x / 100) * W;
                const py = (p.y / 100) * H;
                ctx.fillStyle = isLight ? `rgba(60,179,113,${p.o})` : `rgba(255,255,255,${p.o})`;
                ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
            });

            // 5. Entry line
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = GREEN;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(0, entryY); ctx.lineTo(W, entryY); ctx.stroke();
            ctx.setLineDash([]);

            // 6. Price Path
            if (history.length >= 1) {
                const getX = (t) => liveX - ((nowPx - t) / windowMs) * W;

                // Gradient Flow
                const pathGrad = ctx.createLinearGradient(0, 0, 0, H);
                pathGrad.addColorStop(0, `${statusColor}30`);
                pathGrad.addColorStop(1, 'transparent');

                ctx.beginPath();
                let firstVal = -1;
                history.forEach(pt => {
                    const x = getX(pt.t);
                    const y = toY(pt.p);
                    if (x < 0 || x > W) return;
                    if (firstVal === -1) { ctx.moveTo(x, y); firstVal = x; }
                    else ctx.lineTo(x, y);
                });
                ctx.lineTo(liveX, liveY);
                if (firstVal !== -1) {
                    ctx.lineTo(liveX, H);
                    ctx.lineTo(firstVal, H);
                    ctx.closePath();
                    ctx.fillStyle = pathGrad;
                    ctx.fill();
                }

                // Sharp Line
                ctx.lineWidth = 3;
                ctx.strokeStyle = statusColor;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                let started = false;
                history.forEach(pt => {
                    const x = getX(pt.t);
                    const y = toY(pt.p);
                    if (x < 0 || x > W) return;
                    if (!started) { ctx.moveTo(x, y); started = true; }
                    else ctx.lineTo(x, y);
                });
                ctx.lineTo(liveX, liveY);
                ctx.stroke();

                // Live Dot
                const pulse = Math.sin(nowPx / 200) * 4;
                ctx.fillStyle = statusColor;
                ctx.beginPath(); ctx.arc(liveX, liveY, 6, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(liveX, liveY, 8 + pulse, 0, Math.PI * 2);
                ctx.lineWidth = 2; ctx.strokeStyle = `${statusColor}40`; ctx.stroke();
            }

            rafRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [entryPrice, theme, isLight]);

    // Result Trigger
    const resultTriggered = useRef(false);
    useEffect(() => {
        if (timeLeft > 0) resultTriggered.current = false;
        if (timeLeft <= 0 && !resultTriggered.current && !isSettled) {
            resultTriggered.current = true;
            onResult?.(isAbove ? 'WON' : 'LOST', cPriceNum);
        }
    }, [timeLeft, isAbove, cPriceNum, onResult, isSettled]);

    const totalPool = (pools?.long || 0) + (pools?.short || 0);
    const longPct = totalPool > 0 ? ((pools.long / totalPool) * 100).toFixed(0) : 50;
    const shortPct = totalPool > 0 ? ((pools.short / totalPool) * 100).toFixed(0) : 50;
    const progressPct = totalDuration > 0 ? ((totalDuration - timeLeft) / totalDuration) * 100 : 100;

    return (
        <div className="relative w-full h-full flex flex-col overflow-hidden">
            <canvas ref={canvasRef} className="flex-1 w-full h-full" />

            {/* Overlays */}
            <div className="absolute top-3 left-3 right-3 flex items-center gap-3 z-10">
                <motion.div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-black/70 backdrop-blur-xl border transition-all ${isAbove ? 'border-[#3CB371] shadow-[0_0_15px_rgba(60,179,113,0.3)]' : 'border-white/10 opacity-60'}`}>
                    <TrendingUp size={10} className={isAbove ? 'text-[#3CB371]' : 'text-white/40'} />
                    <span className={`text-[10px] font-black ${isAbove ? 'text-[#3CB371]' : 'text-white/40'}`}>{longPct}%</span>
                    <span className="text-[8px] font-bold text-white/40">${(pools?.long || 0).toFixed(0)}</span>
                </motion.div>

                <div className="flex-1 flex justify-center">
                    <div className="relative w-12 h-12">
                        <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                            <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                            <circle 
                                cx="28" cy="28" r="22" fill="none" 
                                stroke={timeLeft > 5 ? '#3CB371' : '#FF7F50'} 
                                strokeWidth="4" 
                                strokeDasharray={138} 
                                strokeDashoffset={138 * (1 - progressPct / 100)} 
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-black font-mono text-white">{timeLeft}</span>
                        </div>
                    </div>
                </div>

                <motion.div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-black/70 backdrop-blur-xl border transition-all ${!isAbove ? 'border-[#FF7F50] shadow-[0_0_15px_rgba(255,127,80,0.3)]' : 'border-white/10 opacity-60'}`}>
                    <span className="text-[8px] font-bold text-white/40">${(pools?.short || 0).toFixed(0)}</span>
                    <span className={`text-[10px] font-black ${!isAbove ? 'text-[#FF7F50]' : 'text-white/40'}`}>{shortPct}%</span>
                    <TrendingDown size={10} className={!isAbove ? 'text-[#FF7F50]' : 'text-white/40'} />
                </motion.div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 overflow-hidden">
                <motion.div 
                    className={`h-full ${timeLeft > 5 ? 'bg-[#3CB371]' : 'bg-[#FF7F50]'}`}
                    style={{ width: `${progressPct}%` }}
                />
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <AnimatePresence>
                    {isSettled && (
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }} 
                            animate={{ scale: 1, opacity: 1 }}
                            className={`px-8 py-4 rounded-[32px] backdrop-blur-2xl border flex flex-col items-center gap-1 shadow-2xl ${isAbove === (userDirection === 'UP') ? 'border-[#3CB371] bg-[#3CB371]/10' : 'border-[#FF7F50] bg-[#FF7F50]/10'}`}
                        >
                            <h2 className={`text-2xl font-black uppercase tracking-tighter ${isAbove === (userDirection === 'UP') ? 'text-[#3CB371]' : 'text-[#FF7F50]'}`}>
                                {isAbove === (userDirection === 'UP') ? 'YOU WON!' : 'ROUND OVER'}
                            </h2>
                            <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-white/40">Settlement Complete</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

