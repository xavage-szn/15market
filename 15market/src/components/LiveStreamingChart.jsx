import React, { useEffect, useRef } from 'react';
import { priceSocketService } from '../utils/priceSocket';
import { socketService } from '../utils/socket';

/**
 * LiveStreamingChart — A specialized Canvas-based line chart for 1s timeframe.
 * HIGH PERFORMANCE: Optimized drawing routines to avoid lags and redundant allocations.
 */
function LiveStreamingChartComponent({ theme, symbol }) {
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

    const isLight = theme === 'light';
    const GREEN = '#3CB371';

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
            const vPadding = isMobile ? H * 0.25 : H * 0.12;
            const effectiveH = H - (vPadding * 2);
            const toY = (p) => (H - vPadding) - ((p - lo) / range) * effectiveH;
            
            const liveX = getX(nowPx);
            const liveY = toY(latestPriceVal);

            // Cache Gradient
            if (!gradRef.current || lastHRef.current !== H || lastThemeRef.current !== theme) {
                const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
                fillGrad.addColorStop(0, isLight ? 'rgba(60, 179, 113, 0.3)' : `${GREEN}33`);
                fillGrad.addColorStop(1, 'transparent');
                gradRef.current = fillGrad;
                lastHRef.current = H;
                lastThemeRef.current = theme;
            }

            // Smooth clipping: Always start the line slightly off-screen to the left
            const startX = -20;
            const startY = toY(history[firstIdx].p);

            // FILL
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            for (let i = firstIdx + 1; i <= lastIdx; i++) {
                ctx.lineTo(getX(history[i].t), toY(history[i].p));
            }
            ctx.lineTo(liveX, liveY);
            ctx.lineTo(liveX, H + 20);
            ctx.lineTo(startX, H + 20);
            ctx.closePath();
            ctx.fillStyle = gradRef.current;
            ctx.fill();

            // STROKE WITH INTENSE SHADOW
            ctx.beginPath();
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.lineWidth = 3;
            ctx.strokeStyle = isLight ? '#2d8a57' : GREEN;
            
            // Add depth shadow to the line itself
            ctx.shadowBlur = 15;
            ctx.shadowColor = isLight ? 'rgba(30,90,56,0.5)' : 'rgba(60,179,113,0.6)';
            
            ctx.moveTo(startX, startY);
            for (let i = firstIdx + 1; i <= lastIdx; i++) {
                ctx.lineTo(getX(history[i].t), toY(history[i].p));
            }
            ctx.lineTo(liveX, liveY);
            ctx.stroke();
            ctx.shadowBlur = 0; // Reset for subsequent draws

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
            ctx.fillStyle = isLight ? '#2d8a57' : GREEN;
            ctx.beginPath();
            ctx.roundRect(liveX + 8, liveY - labelH/2, labelW, labelH, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.fillText(latestPriceValStr, liveX + 16, liveY);

            // WIDE AMBIENT BACKGROUND GLOW (New request: ambient light under signal point)
            const ambientGlow = ctx.createRadialGradient(liveX, liveY, 0, liveX, liveY, isMobile ? 120 : 180);
            ambientGlow.addColorStop(0, isLight ? 'rgba(60, 179, 113, 0.15)' : 'rgba(60, 179, 113, 0.2)');
            ambientGlow.addColorStop(0.5, isLight ? 'rgba(60, 179, 113, 0.05)' : 'rgba(60, 179, 113, 0.08)');
            ambientGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = ambientGlow;
            ctx.globalCompositeOperation = 'screen';
            ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'source-over';

            // ULTRA-INTENSE SIGNAL GLOW (Behind the point)
            const pulseSize = Math.sin(nowPx / 150) * 5;
            const glowSize = 25 + pulseSize;
            
            const signalGlow = ctx.createRadialGradient(liveX, liveY, 2, liveX, liveY, glowSize);
            signalGlow.addColorStop(0, isLight ? 'rgba(45, 138, 87, 0.8)' : `${GREEN}aa`);
            signalGlow.addColorStop(0.5, isLight ? 'rgba(45, 138, 87, 0.3)' : `${GREEN}40`);
            signalGlow.addColorStop(1, 'transparent');
            
            ctx.beginPath();
            ctx.arc(liveX, liveY, glowSize, 0, Math.PI * 2);
            ctx.fillStyle = signalGlow;
            ctx.fill();

            // Core point (Clean, no shadow to 'fade out' the glow at the point)
            ctx.beginPath();
            ctx.arc(liveX, liveY, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Precision Outer Ring (Subtle)
            ctx.beginPath();
            ctx.arc(liveX, liveY, 7 + (pulseSize * 0.5), 0, Math.PI * 2);
            ctx.strokeStyle = isLight ? 'rgba(45, 138, 87, 0.3)' : `${GREEN}40`;
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
