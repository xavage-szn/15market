import React, { useEffect, useRef } from 'react';

/**
 * LiveStreamingChart — A specialized Canvas-based line chart for 1s timeframe.
 * HIGH PERFORMANCE: Optimized drawing routines to avoid lags and redundant allocations.
 */
function LiveStreamingChartComponent({ theme, currentPrice, symbol }) {
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

    const isLight = theme === 'light';
    const GREEN = '#3CB371';

    // Update target price and session start time
    useEffect(() => {
        const price = parseFloat(currentPrice);
        if (isNaN(price)) return;
        targetPriceRef.current = price;
        if (interpolatedPriceRef.current === null) {
            interpolatedPriceRef.current = price;
        }
        if (startTimeRef.current === null) {
            startTimeRef.current = Date.now();
        }
    }, [currentPrice]);

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
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            const nowPx = Date.now();
            const windowMs = 20000;
            const elapsed = nowPx - startTimeRef.current;
            const viewStartTime = elapsed < windowMs ? startTimeRef.current : nowPx - windowMs;
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
            const toY = (p) => H - ((p - lo) / range) * H;
            
            const liveX = getX(nowPx);
            const liveY = toY(latestPriceVal);

            // Cache Gradient
            if (!gradRef.current || lastHRef.current !== H || lastThemeRef.current !== theme) {
                const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
                fillGrad.addColorStop(0, isLight ? 'rgba(72,201,127,0.3)' : `${GREEN}33`);
                fillGrad.addColorStop(1, 'transparent');
                gradRef.current = fillGrad;
                lastHRef.current = H;
                lastThemeRef.current = theme;
            }

            const startX = getX(history[firstIdx].t);
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

            // STROKE
            ctx.beginPath();
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.lineWidth = 3;
            ctx.strokeStyle = isLight ? '#1e5a38' : GREEN;
            ctx.moveTo(startX, startY);
            for (let i = firstIdx + 1; i <= lastIdx; i++) {
                ctx.lineTo(getX(history[i].t), toY(history[i].p));
            }
            ctx.lineTo(liveX, liveY);
            ctx.stroke();

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
            ctx.fillStyle = isLight ? '#1e5a38' : GREEN;
            ctx.beginPath();
            ctx.roundRect(liveX + 8, liveY - labelH/2, labelW, labelH, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.fillText(latestPriceValStr, liveX + 16, liveY);

            // PULSE
            const pulse = Math.sin(nowPx / 250) * 2;
            ctx.beginPath();
            ctx.arc(liveX, liveY, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(liveX, liveY, 6 + pulse, 0, Math.PI * 2);
            ctx.strokeStyle = `${GREEN}80`;
            ctx.lineWidth = 1.5;
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
