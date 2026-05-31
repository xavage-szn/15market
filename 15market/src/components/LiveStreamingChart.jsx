import React, { useEffect, useRef } from 'react';
import { priceSocketService } from '../utils/priceSocket';
import { socketService } from '../utils/socket';

/**
 * LiveStreamingChart — A specialized Canvas-based line chart for 1s timeframe.
 * HIGH PERFORMANCE: Optimized drawing routines to avoid lags and redundant allocations.
 * Now includes trade entry markers with LIVE countdown badges rendered on canvas.
 */
function LiveStreamingChartComponent({ theme, symbol, activeTrades = [], currentPrice }) {
    const canvasRef = useRef(null);
    const priceHistoryRef = useRef([]);
    const rafRef = useRef(null);
    const targetPriceRef = useRef(null);
    const interpolatedPriceRef = useRef(null);
    const startTimeRef = useRef(null);
    const gradRef = useRef(null);
    
    // Y-Axis Smoothing
    const yMinRef = useRef(null);
    const yMaxRef = useRef(null);

    const lastHRef = useRef(0);
    const lastThemeRef = useRef(theme);
    const debugProbeRef = useRef({ badPriceTs: 0, emptyDrawTs: 0 });

    // Store activeTrades in ref so canvas draw loop sees latest
    const activeTradesRef = useRef(activeTrades);
    useEffect(() => { activeTradesRef.current = activeTrades; }, [activeTrades]);

    const isLight = theme === 'light';
    const GREEN = '#249C6C';

    // Listen for price updates from both primary and fallback streams
    useEffect(() => {
        const handlePrice = (data) => {
            if (data.key === symbol.replace('USDT', '').toLowerCase()) {
                const price = parseFloat(data.price);
                if (!isNaN(price)) {
                    targetPriceRef.current = price;
                    if (interpolatedPriceRef.current === null) {
                        interpolatedPriceRef.current = price;
                    }
                    if (startTimeRef.current === null) {
                        startTimeRef.current = Date.now();
                    }
                }
            }
        };

        const unbind = priceSocketService.on('price', handlePrice);
        
        return () => {
            unbind();
        };
    }, [symbol]);

    // Reset state on symbol change
    useEffect(() => {
        priceHistoryRef.current = [];
        targetPriceRef.current = null;
        interpolatedPriceRef.current = null;
        startTimeRef.current = null;
        yMinRef.current = null;
        yMaxRef.current = null;
    }, [symbol]);

    // History management
    useEffect(() => {
        const historyInterval = setInterval(() => {
            if (interpolatedPriceRef.current !== null) {
                const now = Date.now();
                const history = priceHistoryRef.current;
                const lastPt = history[history.length - 1];
                if (!lastPt || now > lastPt.t) {
                    history.push({ t: now, p: interpolatedPriceRef.current });
                }
                if (history.length > 1000) {
                    priceHistoryRef.current = history.slice(-600);
                }
            }
        }, 100);
        return () => clearInterval(historyInterval);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true });

        const draw = () => {
            const W = canvas.offsetWidth;
            const H = canvas.offsetHeight;
            if (!W || !H) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            const dpr = window.devicePixelRatio || 1;
            if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
                canvas.width = W * dpr;
                canvas.height = H * dpr;
                ctx.scale(dpr, dpr);
            }

            ctx.clearRect(0, 0, W, H);

            // FASTER INTERPOLATION (0.4 instead of 0.3)
            if (targetPriceRef.current !== null && interpolatedPriceRef.current !== null) {
                const diff = targetPriceRef.current - interpolatedPriceRef.current;
                interpolatedPriceRef.current += diff * 0.4;
            }

            const history = priceHistoryRef.current;
            const latestPriceVal = interpolatedPriceRef.current;
            if (latestPriceVal === null || history.length === 0 || !startTimeRef.current) {
                const now = Date.now();
                if ((now - (debugProbeRef.current.emptyDrawTs || 0)) > 5000) {
                    debugProbeRef.current.emptyDrawTs = now;
                    // #region agent log
                    fetch('http://127.0.0.1:7763/ingest/3594a004-3d00-491a-a04f-c0eea15a4941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'488cf3'},body:JSON.stringify({sessionId:'488cf3',runId:'initial',hypothesisId:'H11',location:'LiveStreamingChart.jsx:draw:noData',message:'chart draw skipped due to missing data',data:{symbol,latestPriceVal,historyLength:history.length,hasStart:!!startTimeRef.current},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion
                }
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            const nowPx = Date.now();
            const windowMs = 20000;
            const viewStartTime = nowPx - windowMs;
            const oldest = viewStartTime;

            const isMobile = W < 600;
            const latestPriceValStr = latestPriceVal.toFixed(2);
            ctx.font = `bold ${isMobile ? 14 : 12}px IBM Plex Mono, monospace`;
            const labelW = ctx.measureText(latestPriceValStr).width + 16;
            const liveXBoundary = W - labelW - 15;
            const getX = (t) => ((t - viewStartTime) / windowMs) * liveXBoundary;

            let pMin = latestPriceVal;
            let pMax = latestPriceVal;
            let firstIdx = -1;
            let lastIdx = -1;

            for (let i = 0; i < history.length; i++) {
                const pt = history[i];
                if (pt.t < oldest) continue;
                const x = getX(pt.t);
                if (x < 0) continue;
                if (x > liveXBoundary) break;
                
                if (firstIdx === -1) firstIdx = i;
                lastIdx = i;
                if (pt.p < pMin) pMin = pt.p;
                if (pt.p > pMax) pMax = pt.p;
            }

            if (firstIdx === -1) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            // Vertical Scaling with Smoothing
            const deviation = Math.max(pMax - latestPriceVal, latestPriceVal - pMin);
            const minDev = latestPriceVal * 0.0005;
            const finalDev = Math.max(deviation, minDev);
            const targetLo = latestPriceVal - finalDev;
            const targetHi = latestPriceVal + finalDev;

            if (yMinRef.current === null) {
                yMinRef.current = targetLo;
                yMaxRef.current = targetHi;
            } else {
                yMinRef.current += (targetLo - yMinRef.current) * 0.15;
                yMaxRef.current += (targetHi - yMaxRef.current) * 0.15;
            }

            const lo = yMinRef.current;
            const hi = yMaxRef.current;
            const range = hi - lo || 1;
            const vPadding = isMobile ? H * 0.08 : H * 0.12;
            const effectiveH = H - (vPadding * 2);
            const toY = (p) => (H - vPadding) - ((p - lo) / range) * effectiveH;
            
            const liveX = getX(nowPx);
            const liveY = toY(latestPriceVal);

            // Smooth clipping: Always start the line slightly off-screen to the left
            const startX = -20;
            const startY = toY(history[firstIdx].p);

            // CLIP + GRADIENT FILL TECHNIQUE
            // Step 1: Define the exact line shape as a clip region (follows the signal precisely)
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            for (let i = firstIdx + 1; i <= lastIdx; i++) {
                ctx.lineTo(getX(history[i].t), toY(history[i].p));
            }
            ctx.lineTo(liveX, liveY);   // Up to the live signal point
            ctx.lineTo(liveX, H + 20);  // Straight down — no slant, no crossing
            ctx.lineTo(startX, H + 20);
            ctx.closePath();
            ctx.clip(); // Lock drawing to inside the line shape

            // Step 2: Paint a purely horizontal gradient inside the clip
            // Strong green at the back (left), fully transparent at the signal point (right)
            // The clip ensures it never bleeds outside the line shape
            const fillGrad = ctx.createLinearGradient(0, 0, liveX, 0);
            fillGrad.addColorStop(0,    isLight ? 'rgba(36, 156, 108, 0.40)' : `${GREEN}44`);
            fillGrad.addColorStop(0.50, isLight ? 'rgba(36, 156, 108, 0.20)' : `${GREEN}22`);
            fillGrad.addColorStop(0.80, isLight ? 'rgba(36, 156, 108, 0.06)' : `${GREEN}0A`);
            fillGrad.addColorStop(1.00, 'rgba(0,0,0,0)');
            ctx.fillStyle = fillGrad;
            ctx.fillRect(startX, 0, liveX - startX + 2, H + 20); // Fill the whole clip area
            ctx.restore(); // Release the clip

            // STROKE WITH INTENSE SHADOW
            ctx.beginPath();
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.lineWidth = 3;
            ctx.strokeStyle = isLight ? '#1D7A52' : GREEN;
            
            // Add depth shadow to the line itself
            ctx.shadowBlur = 15;
            ctx.shadowColor = isLight ? 'rgba(30,90,56,0.5)' : 'rgba(36, 156, 108,0.6)';
            
            ctx.moveTo(startX, startY);
            for (let i = firstIdx + 1; i <= lastIdx; i++) {
                ctx.lineTo(getX(history[i].t), toY(history[i].p));
            }
            ctx.lineTo(liveX, liveY);
            ctx.stroke();
            ctx.shadowBlur = 0; // Reset for subsequent draws

            // ═══════════════════════════════════════════════════
            // ACTIVE TRADE ENTRY MARKERS — Dotted vertical lines + LIVE badge
            // ═══════════════════════════════════════════════════
            const trades = activeTradesRef.current;
            if (trades && trades.length > 0) {
                trades.forEach(trade => {
                    const entryPrice = parseFloat(trade.entryPrice);
                    if (isNaN(entryPrice)) return;

                    const tid = String(trade.id);
                    const start = trade.startTime || (tid.length > 12 ? parseInt(tid) : nowPx);
                    const duration = trade.duration || 15;
                    const expiry = trade.expiryMs || (start + (duration * 1000));
                    const isSettled = ["WON", "LOST", "PAID"].includes(trade.status);
                    const isExpired = nowPx >= expiry || isSettled;
                    
                    // Only draw markers for active (non-expired) trades
                    if (isExpired) return;

                    // Position the vertical line at the trade start time
                    const entryX = getX(start);
                    
                    // Skip if entry line is off-screen
                    if (entryX < -20 || entryX > W + 20) return;
                    
                    const entryY = toY(entryPrice);
                    const remainingMs = Math.max(0, expiry - nowPx);
                    const remainingSec = (remainingMs / 1000).toFixed(1);

                    // ═══════════════════════════════════════
                    // LIVE BADGE — Floating on the vertical line
                    // (Computed first so the dotted line knows where the badge bottom is)
                    // ═══════════════════════════════════════
                    const badgeW = isMobile ? 68 : 78;
                    const badgeH = isMobile ? 30 : 34;
                    const badgeX = entryX - badgeW / 2;
                    // Place badge at ~25% from top, but clamp to stay visible
                    const rawBadgeY = H * 0.18;
                    const badgeY = Math.max(8, Math.min(rawBadgeY, H - badgeH - 8));
                    const lineTop = badgeY + badgeH; // bottom edge of badge
                    const lineBottom = entryY;       // entry price on the signal line

                    // ── Soft glow behind the vertical line (only between badge and entry) ──
                    if (lineBottom > lineTop) {
                        const lineGlow = ctx.createLinearGradient(entryX - 10, 0, entryX + 10, 0);
                        lineGlow.addColorStop(0, 'transparent');
                        lineGlow.addColorStop(0.5, isLight ? 'rgba(36,156,108,0.06)' : 'rgba(36,156,108,0.04)');
                        lineGlow.addColorStop(1, 'transparent');
                        ctx.fillStyle = lineGlow;
                        ctx.fillRect(entryX - 10, lineTop, 20, lineBottom - lineTop);
                    }

                    // ── Thin dotted vertical line: badge bottom → entry price on signal ──
                    if (lineBottom > lineTop) {
                        ctx.save();
                        ctx.setLineDash([3, 4]);
                        ctx.strokeStyle = isLight ? 'rgba(36,156,108,0.45)' : 'rgba(36,156,108,0.35)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(entryX, lineTop);
                        ctx.lineTo(entryX, lineBottom);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.restore();
                    }

                    // ── Small dot marker at entry price on the signal line ──
                    ctx.save();
                    ctx.fillStyle = GREEN;
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = 'rgba(36,156,108,0.4)';
                    ctx.beginPath();
                    ctx.arc(entryX, entryY, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    // White inner dot
                    ctx.beginPath();
                    ctx.arc(entryX, entryY, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.restore();

                    // Badge background with glassmorphism
                    ctx.save();
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'rgba(36,156,108,0.35)';
                    
                    // Outer glow ring
                    const pulsePhase = Math.sin(nowPx / 600) * 0.5 + 0.5;
                    ctx.strokeStyle = `rgba(36,156,108,${0.15 + pulsePhase * 0.15})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.roundRect(badgeX - 2, badgeY - 2, badgeW + 4, badgeH + 4, 10);
                    ctx.stroke();
                    
                    // Main badge fill
                    ctx.fillStyle = isLight ? 'rgba(36,156,108,0.92)' : 'rgba(20,71,44,0.92)';
                    ctx.beginPath();
                    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
                    ctx.fill();
                    
                    // Subtle top highlight
                    const highlightGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
                    highlightGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
                    highlightGrad.addColorStop(0.4, 'rgba(255,255,255,0.02)');
                    highlightGrad.addColorStop(1, 'rgba(0,0,0,0.05)');
                    ctx.fillStyle = highlightGrad;
                    ctx.beginPath();
                    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
                    ctx.fill();

                    // Border
                    ctx.strokeStyle = 'rgba(36,156,108,0.5)';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.restore();

                    // ── Stopwatch icon (animated) ──
                    const iconCenterX = badgeX + (isMobile ? 12 : 14);
                    const iconCenterY = badgeY + badgeH / 2 - 2;
                    const iconR = isMobile ? 4.5 : 5.5;
                    
                    ctx.save();
                    // Clock circle
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.arc(iconCenterX, iconCenterY, iconR, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    // Top button nub
                    ctx.beginPath();
                    ctx.moveTo(iconCenterX, iconCenterY - iconR - 1);
                    ctx.lineTo(iconCenterX, iconCenterY - iconR - 3);
                    ctx.stroke();
                    
                    // Side button nub (right top)
                    ctx.beginPath();
                    ctx.moveTo(iconCenterX + iconR * 0.6, iconCenterY - iconR - 0.5);
                    ctx.lineTo(iconCenterX + iconR * 0.85, iconCenterY - iconR - 2.5);
                    ctx.stroke();
                    
                    // Animated hand — rotates with the countdown
                    const progress = 1 - (remainingMs / (duration * 1000));
                    const handAngle = -Math.PI / 2 + (progress * Math.PI * 2);
                    ctx.strokeStyle = '#4ADE80';
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    ctx.moveTo(iconCenterX, iconCenterY);
                    ctx.lineTo(
                        iconCenterX + Math.cos(handAngle) * (iconR * 0.65),
                        iconCenterY + Math.sin(handAngle) * (iconR * 0.65)
                    );
                    ctx.stroke();
                    
                    // Center dot
                    ctx.beginPath();
                    ctx.arc(iconCenterX, iconCenterY, 1, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.restore();

                    // ── "LIVE" text ──
                    const textStartX = iconCenterX + iconR + (isMobile ? 3 : 4);
                    ctx.fillStyle = '#4ADE80';
                    ctx.font = `900 ${isMobile ? 7 : 8}px Inter, system-ui, sans-serif`;
                    ctx.textBaseline = 'top';
                    ctx.fillText('LIVE', textStartX, badgeY + (isMobile ? 5 : 6));

                    // ── Countdown text ──
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `bold ${isMobile ? 9 : 10}px IBM Plex Mono, monospace`;
                    ctx.textBaseline = 'top';
                    const countdownStr = remainingSec < 10 ? `0${remainingSec}` : remainingSec;
                    ctx.fillText(countdownStr, textStartX, badgeY + (isMobile ? 16 : 18));
                });
            }

            // CROSSHAIR
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.moveTo(0, liveY);
            ctx.lineTo(W, liveY);
            ctx.stroke();
            ctx.setLineDash([]);

            // BADGE
            const labelH = 20;
            ctx.fillStyle = isLight ? '#1D7A52' : GREEN;
            ctx.beginPath();
            ctx.roundRect(liveX + 8, liveY - labelH/2, labelW, labelH, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${isMobile ? 14 : 12}px IBM Plex Mono, monospace`;
            ctx.fillText(latestPriceValStr, liveX + 16, liveY);

            // TIGHT AMBIENT GLOW — very close around the signal point
            const ambientGlow = ctx.createRadialGradient(liveX, liveY, 0, liveX, liveY, isMobile ? 30 : 40);
            ambientGlow.addColorStop(0, isLight ? 'rgba(36, 156, 108, 0.20)' : 'rgba(36, 156, 108, 0.25)');
            ambientGlow.addColorStop(0.6, isLight ? 'rgba(36, 156, 108, 0.06)' : 'rgba(36, 156, 108, 0.10)');
            ambientGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = ambientGlow;
            ctx.globalCompositeOperation = 'screen';
            ctx.fillRect(liveX - 40, liveY - 40, 80, 80);
            ctx.globalCompositeOperation = 'source-over';

            // TIGHT SIGNAL GLOW — stays very close to the dot
            const pulseSize = Math.sin(nowPx / 150) * 2;
            const glowSize = 10 + pulseSize;

            const signalGlow = ctx.createRadialGradient(liveX, liveY, 1, liveX, liveY, glowSize);
            signalGlow.addColorStop(0, isLight ? 'rgba(45, 138, 87, 0.9)' : `${GREEN}bb`);
            signalGlow.addColorStop(0.5, isLight ? 'rgba(45, 138, 87, 0.3)' : `${GREEN}30`);
            signalGlow.addColorStop(1, 'transparent');

            ctx.beginPath();
            ctx.arc(liveX, liveY, glowSize, 0, Math.PI * 2);
            ctx.fillStyle = signalGlow;
            ctx.fill();

            // Core point
            ctx.beginPath();
            ctx.arc(liveX, liveY, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Precision Outer Ring (Subtle)
            ctx.beginPath();
            ctx.arc(liveX, liveY, 6.5 + (pulseSize * 0.3), 0, Math.PI * 2);
            ctx.strokeStyle = isLight ? 'rgba(45, 138, 87, 0.25)' : `${GREEN}35`;
            ctx.lineWidth = 1;
            ctx.stroke();

            rafRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [theme, symbol]);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <canvas ref={canvasRef} className="w-full h-full" style={{ touchAction: 'none' }} />
        </div>
    );
}

export const LiveStreamingChart = React.memo(LiveStreamingChartComponent);
export default LiveStreamingChart;
