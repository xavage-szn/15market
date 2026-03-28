import React, { useEffect, useRef } from 'react';

/**
 * LiveStreamingChart — A specialized Canvas-based line chart for 1s timeframe.
 * UPDATED: Branding aligned with 1m Lightweight Chart.
 */
export default function LiveStreamingChart({ theme, currentPrice, symbol, priceHistory = [] }) {
    const canvasRef = useRef(null);
    const priceHistoryRef = useRef(priceHistory || []);
    const rafRef = useRef(null);
    const targetPriceRef = useRef(null);
    const interpolatedPriceRef = useRef(null);

    const isLight = theme === 'light';
    const GREEN = '#3CB371';
    const RED = '#FF7F50';
    // Remove grid as requested
    const GRID_COLOR = 'transparent';

    useEffect(() => {
        const price = parseFloat(currentPrice);
        if (!price || isNaN(price)) return;
        targetPriceRef.current = price;
        if (interpolatedPriceRef.current === null) {
            interpolatedPriceRef.current = price;
        }
    }, [currentPrice]);

    const hasGeneratedSynthetic = useRef(false);

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

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

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

            ctx.clearRect(0, 0, W, H);

            // Interpolation
            if (targetPriceRef.current !== null && interpolatedPriceRef.current !== null) {
                const diff = targetPriceRef.current - interpolatedPriceRef.current;
                interpolatedPriceRef.current += diff * 0.15;
            }

            const history = priceHistoryRef.current;
            const latestPriceVal = interpolatedPriceRef.current;
            if (!latestPriceVal) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            // Window: 20s visible, latest price on right
            const nowPx = Date.now();
            const windowMs = 20000;
            const oldest = nowPx - windowMs;

            // Y-Scale
            const visiblePts = history.filter(pt => pt.t >= oldest);
            let lo = latestPriceVal * 0.9998;
            let hi = latestPriceVal * 1.0002;

            if (visiblePts.length > 0) {
                const prices = visiblePts.map(pt => pt.p);
                const pMin = Math.min(...prices, latestPriceVal);
                const pMax = Math.max(...prices, latestPriceVal);
                
                // Centering Logic: find max deviation from current price
                const deviation = Math.max(pMax - latestPriceVal, latestPriceVal - pMin);
                // Use a minimum deviation of 0.05% of price to avoid flat lines
                const minDev = latestPriceVal * 0.0005;
                const finalDev = Math.max(deviation, minDev);

                lo = latestPriceVal - finalDev;
                hi = latestPriceVal + finalDev;
            }

            const toY = (p) => H - ((p - lo) / (hi - lo)) * H;
            const isMobile = W < 600;
            const labelText = latestPriceVal.toFixed(2);
            ctx.font = `bold ${isMobile ? 14 : 12}px IBM Plex Mono, monospace`;
            const labelW = ctx.measureText(labelText).width + 16;
            const liveX = W - labelW - 30; // Increased space like desktop
            const liveY = toY(latestPriceVal);

            // 1. Static Grid (Matching 1m)
            ctx.lineWidth = 1;
            ctx.strokeStyle = GRID_COLOR;
            for (let x = 0; x < W; x += 60) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            }
            for (let y = 0; y < H; y += 40) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            }

            // 2. Price Line Path
            if (history.length >= 1) {
                let mainColor = GREEN;
                if (isLight) {
                    mainColor = ctx.createLinearGradient(0, liveY - 100, 0, liveY + 100);
                    mainColor.addColorStop(0, '#48c97f');
                    mainColor.addColorStop(1, '#1e5a38');
                }

                // Flow logic (latest on right, trailing on left)
                const getX = (t) => liveX - ((nowPx - t) / windowMs) * W;

                // Fill Area (Matching Lightweight AreaSeries)
                const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
                fillGrad.addColorStop(0, isLight ? 'rgba(72,201,127,0.4)' : `${GREEN}40`);
                fillGrad.addColorStop(1, 'transparent');

                ctx.beginPath();
                let firstVisibleX = -1;
                history.forEach((pt) => {
                    const x = getX(pt.t);
                    const y = toY(pt.p);
                    // Allow points slightly off-screen to ensure path reaches the edge
                    if (x < -100 || x > W + 100) return;
                    if (firstVisibleX === -1) { ctx.moveTo(x, y); firstVisibleX = x; }
                    else ctx.lineTo(x, y);
                });
                ctx.lineTo(liveX, liveY);
                if (firstVisibleX !== -1) {
                    ctx.lineTo(liveX, H);
                    ctx.lineTo(firstVisibleX, H);
                    ctx.closePath();
                    ctx.fillStyle = fillGrad;
                    ctx.fill();
                }

                // Sharp Line (Drawing Thicker for better fill presence)
                ctx.lineWidth = 4;
                ctx.strokeStyle = mainColor;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                let started = false;
                history.forEach((pt) => {
                    const x = getX(pt.t);
                    const y = toY(pt.p);
                    if (x < -100 || x > W + 100) return;
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                });ctx.lineTo(liveX, liveY);
                ctx.stroke();

                // Horizontal Price Line (Crosshair)
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
                ctx.beginPath();
                ctx.moveTo(0, liveY);
                ctx.lineTo(W, liveY);
                ctx.stroke();
                ctx.setLineDash([]);

                // Live Badge
                const labelH = isMobile ? 24 : 20;

                ctx.fillStyle = isLight ? '#1e5a38' : GREEN;
                ctx.beginPath();
                ctx.roundRect(W - labelW - 10, liveY - labelH/2, labelW, labelH, 6);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, W - labelW - 10 + 8, liveY);

                // Pulse Dot
                const pulse = Math.sin(nowPx / 200) * 3;
                const dotSize = isMobile ? 5 : 4;
                ctx.beginPath();
                ctx.arc(liveX, liveY, dotSize, 0, Math.PI * 2);
                ctx.fillStyle = isLight ? '#48c97f' : '#ffffff';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(liveX, liveY, (dotSize + 2) + pulse, 0, Math.PI * 2);
                ctx.strokeStyle = isLight ? 'rgba(72,201,127,0.6)' : `${GREEN}60`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }

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
