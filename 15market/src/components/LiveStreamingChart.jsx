import React, { useEffect, useRef } from 'react';

/**
 * LiveStreamingChart — A specialized Canvas-based line chart for 1s timeframe.
 * HIGH PERFORMANCE: Optimized drawing routines to avoid lags and redundant allocations.
 */
export default function LiveStreamingChart({ theme, currentPrice, symbol, priceHistory = [] }) {
    const canvasRef = useRef(null);
    const priceHistoryRef = useRef(priceHistory || []);
    const rafRef = useRef(null);
    const targetPriceRef = useRef(null);
    const interpolatedPriceRef = useRef(null);
    const lastInvalidPriceRef = useRef(null);

    const isLight = theme === 'light';
    const GREEN = '#3CB371';
    // Remove grid as requested
    const GRID_COLOR = 'transparent';

    useEffect(() => {
        const price = parseFloat(currentPrice);
        if (!price || isNaN(price)) {
            if (lastInvalidPriceRef.current !== currentPrice) {
                lastInvalidPriceRef.current = currentPrice;
                // #region agent log
                fetch('http://127.0.0.1:7763/ingest/3594a004-3d00-491a-a04f-c0eea15a4941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'de7e69'},body:JSON.stringify({sessionId:'de7e69',runId:'initial',hypothesisId:'H2',location:'LiveStreamingChart.jsx:currentPrice:invalid',message:'Chart received invalid currentPrice',data:{symbol,currentPrice},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
            }
            return;
        }
        targetPriceRef.current = price;
        if (interpolatedPriceRef.current === null) {
            interpolatedPriceRef.current = price;
        }
    }, [currentPrice]);

    useEffect(() => {
        // #region agent log
        fetch('http://127.0.0.1:7763/ingest/3594a004-3d00-491a-a04f-c0eea15a4941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'de7e69'},body:JSON.stringify({sessionId:'de7e69',runId:'initial',hypothesisId:'H4',location:'LiveStreamingChart.jsx:symbol:change',message:'Chart symbol/render context changed',data:{symbol,currentPrice,propHistoryLength:Array.isArray(priceHistory) ? priceHistory.length : -1},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
    }, [symbol]);

    const hasGeneratedSynthetic = useRef(false);

    // Reset canvas state when switching markets to prevent path remnants from previous symbols.
    useEffect(() => {
        priceHistoryRef.current = [];
        hasGeneratedSynthetic.current = false;
        targetPriceRef.current = null;
        interpolatedPriceRef.current = null;
        lastInvalidPriceRef.current = null;
    }, [symbol]);

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

    useEffect(() => {
        const historyInterval = setInterval(() => {
            if (interpolatedPriceRef.current !== null) {
                const now = Date.now();
                const history = priceHistoryRef.current;
                const lastPt = history[history.length - 1];
                
                // Strict Monotonicity to prevent wrapping glitches
                if (!lastPt || now > lastPt.t) {
                    history.push({ t: now, p: interpolatedPriceRef.current });
                }
                
                // Efficient capping (O(1) amortized)
                if (history.length > 800) {
                    priceHistoryRef.current = history.slice(-500);
                }
            }
        }, 100);
        return () => clearInterval(historyInterval);
    }, []);

    // Sync history from prop on mount
    useEffect(() => {
        if (priceHistory && priceHistory.length > 0 && priceHistoryRef.current.length <= 1) {
            const incoming = [...priceHistory].sort((a,b) => a.t - b.t);
            priceHistoryRef.current = incoming;
        }
    }, [priceHistory]);

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
            const targetW = W * dpr;
            const targetH = H * dpr;
            if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
                ctx.scale(dpr, dpr);
            }

            ctx.clearRect(0, 0, W, H);

            // Interpolation (Smooth Move)
            if (targetPriceRef.current !== null && interpolatedPriceRef.current !== null) {
                const diff = targetPriceRef.current - interpolatedPriceRef.current;
                interpolatedPriceRef.current += diff * 0.15;
            }

            const history = priceHistoryRef.current;
            const latestPriceVal = interpolatedPriceRef.current;
            if (!latestPriceVal || history.length === 0) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            // Window Configuration
            const nowPx = Date.now();
            const windowMs = 20000;
            const oldest = nowPx - windowMs;

            // Keep only visible-time points to avoid stale offscreen path remnants.
            const visiblePoints = [];
            let pMin = latestPriceVal;
            let pMax = latestPriceVal;
            for (let i = 0; i < history.length; i++) {
                const pt = history[i];
                if (pt.t < oldest) continue;
                const x = getX(pt.t);
                if (x < 0 || x > liveX) continue;
                visiblePoints.push({ x, y: 0, p: pt.p });
                if (pt.p < pMin) pMin = pt.p;
                if (pt.p > pMax) pMax = pt.p;
            }

            // Fallback for empty screen
            const deviation = Math.max(pMax - latestPriceVal, latestPriceVal - pMin);
            const minDev = latestPriceVal * 0.0005;
            const finalDev = Math.max(deviation, minDev);

            const lo = latestPriceVal - finalDev;
            const hi = latestPriceVal + finalDev;
            const range = hi - lo || 1;

            const toY = (p) => H - ((p - lo) / range) * H;
            const isMobile = W < 600;
            const labelText = latestPriceVal.toFixed(2);
            ctx.font = `bold ${isMobile ? 14 : 12}px IBM Plex Mono, monospace`;
            const labelW = ctx.measureText(labelText).width + 16;
            const liveX = W - labelW - 15;
            const liveY = toY(latestPriceVal);

            const getX = (t) => liveX - ((nowPx - t) / windowMs) * W;

            // Drawing
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            // AREA FILL
            const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
            fillGrad.addColorStop(0, isLight ? 'rgba(72,201,127,0.3)' : `${GREEN}33`);
            fillGrad.addColorStop(1, 'transparent');

            if (visiblePoints.length === 0) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            for (let i = 0; i < visiblePoints.length; i++) {
                visiblePoints[i].y = toY(visiblePoints[i].p);
            }

            ctx.beginPath();
            const firstX = visiblePoints[0].x;
            const firstY = visiblePoints[0].y;
            ctx.moveTo(firstX, firstY);
            for (let i = 1; i < visiblePoints.length; i++) {
                ctx.lineTo(visiblePoints[i].x, visiblePoints[i].y);
            }
            ctx.lineTo(liveX, liveY);

            // Close area path
            const lastPathX = liveX;
            ctx.save();
            ctx.lineTo(lastPathX, H);
            ctx.lineTo(firstX, H);
            ctx.closePath();
            ctx.fillStyle = fillGrad;
            ctx.fill();
            ctx.restore();

            // STROKE LINE
            ctx.lineWidth = 3;
            ctx.strokeStyle = isLight ? '#1e5a38' : GREEN;
            ctx.stroke();

            // CROSSHAIR
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.moveTo(0, liveY);
            ctx.lineTo(W, liveY);
            ctx.stroke();
            ctx.setLineDash([]);

            // LIVE BADGE
            const labelH = 20;
            ctx.fillStyle = isLight ? '#1e5a38' : GREEN;
            ctx.beginPath();
            ctx.roundRect(liveX + 8, liveY - labelH/2, labelW, labelH, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, liveX + 16, liveY);

            // PULSE DOT
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
    }, [theme, isLight, symbol]);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <canvas ref={canvasRef} className="w-full h-full" style={{ touchAction: 'none' }} />
        </div>
    );
}
