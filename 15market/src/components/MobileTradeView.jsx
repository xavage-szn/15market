import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, Search, History, ArrowUp, ArrowDown, X } from 'lucide-react';
import { priceSocketService } from '../utils/priceSocket';
import { KEEPER_URL_ARC } from '../constants';
import { GlobalTradeScroller } from './GlobalTradeScroller';
import { FlipClock, ProgressBeam, ResolvingOutcome, TradeOutcome } from './TradingWidget';

const LOGO_MAP = {
  eth: '/ethusdc.png',
  btc: '/btc.png',
  sol: '/sol.png',
  mon: '/monad.png',
  avax: '/avax.png',
};

function getLogoFilter(isLight) {
  if (isLight) return 'brightness(0)';
  return 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)';
}

/**
 * MobileSteppedChart — High-performance Canvas stepped-line (ladder) chart.
 * Renders the exact stepped line, soft area fill, dashed strike line,
 * hollow current price ring, and green live price badge pill matching the reference design.
 */
function MobileSteppedChart({
  symbol = 'ETHUSDT',
  theme = 'light',
  currentPrice,
  activeTrades = [],
  windowMs = 25000,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const priceHistoryRef = useRef([]);
  const rafRef = useRef(null);
  const targetPriceRef = useRef(null);
  const interpolatedPriceRef = useRef(null);
  const yMinRef = useRef(null);
  const yMaxRef = useRef(null);
  const activeTradesRef = useRef(activeTrades);
  const isLight = theme === 'light';
  const GREEN = '#17A364';

  useEffect(() => { activeTradesRef.current = activeTrades; }, [activeTrades]);

  const numericPrice = parseFloat(currentPrice) || 0;

  // Cache helpers — synchronous localStorage first, async Redis background sync
  const getCacheKey = (sym) => `15market_mobile_chart_${sym?.toLowerCase()}`;
  const loadCachedHistorySync = (sym) => {
    // Synchronous load from localStorage (instant)
    try {
      const cached = localStorage.getItem(getCacheKey(sym));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.length > 0) {
          const lastTs = parsed[parsed.length - 1].t;
          const now = Date.now();
          const shift = now - lastTs;
          return parsed.map(p => ({ t: p.t + shift, p: p.p }));
        }
      }
    } catch {}
    return [];
  };
  const syncFromRedis = async (sym) => {
    // Background sync from Redis → localStorage
    try {
      const { KEEPER_URL_ARC } = await import('../constants');
      const res = await fetch(`${KEEPER_URL_ARC}/chart/history/${encodeURIComponent(sym)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Update localStorage with Redis data
          localStorage.setItem(getCacheKey(sym), JSON.stringify(data));
          return data;
        }
      }
    } catch {}
    return null;
  };
  const saveHistoryToCache = (sym, history) => {
    // Save to localStorage (instant)
    try {
      localStorage.setItem(getCacheKey(sym), JSON.stringify(history.slice(-300)));
    } catch {}
    // Background save to Redis
    try {
      import('../constants').then(({ KEEPER_URL_ARC }) => {
        fetch(`${KEEPER_URL_ARC}/chart/history/${encodeURIComponent(sym)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history: history.slice(-300) }),
        });
      });
    } catch {}
  };

  // Initialize: load cached history synchronously, then sync from Redis in background
  useEffect(() => {
    const symKey = (symbol || 'ETHUSDT').replace('USDT', '').toLowerCase();
    const basePrice = numericPrice > 0 ? numericPrice : (symKey === 'btc' ? 68000 : symKey === 'sol' ? 140 : 1880.89);

    if (priceHistoryRef.current.length === 0) {
      // 1. Instant load from localStorage
      const cached = loadCachedHistorySync(symbol);
      if (cached.length > 10) {
        priceHistoryRef.current = cached;
        interpolatedPriceRef.current = cached[cached.length - 1].p;
        targetPriceRef.current = cached[cached.length - 1].p;
      } else {
        // Fallback: generate synthetic data
        const now = Date.now();
        const initial = [];
        let walk = basePrice;
        const stepCount = 35;
        const timeStep = windowMs / stepCount;

        for (let i = stepCount; i >= 0; i--) {
          const t = now - (i * timeStep);
          if (i % 3 === 0) {
            walk += (Math.random() - 0.48) * (basePrice * 0.0015);
          }
          initial.push({ t, p: walk });
        }
        priceHistoryRef.current = initial;
        interpolatedPriceRef.current = walk;
        targetPriceRef.current = basePrice;
      }

      // 2. Background sync from Redis (updates localStorage for next load)
      syncFromRedis(symbol).then(redisData => {
        if (redisData && redisData.length > 10) {
          const lastTs = redisData[redisData.length - 1].t;
          const now = Date.now();
          const shift = now - lastTs;
          const shifted = redisData.map(p => ({ t: p.t + shift, p: p.p }));
          priceHistoryRef.current = shifted;
          interpolatedPriceRef.current = shifted[shifted.length - 1].p;
          targetPriceRef.current = shifted[shifted.length - 1].p;
        }
      });
    }
  }, [symbol, numericPrice, windowMs]);

  // Listen to live Pyth / Binance websocket prices
  useEffect(() => {
    const symKey = (symbol || 'ETHUSDT').replace('USDT', '').toLowerCase();

    const handlePrice = (data) => {
      if (data && data.key === symKey) {
        const p = parseFloat(data.price);
        if (!isNaN(p) && p > 0) {
          targetPriceRef.current = p;
          if (interpolatedPriceRef.current === null) {
            interpolatedPriceRef.current = p;
          }
        }
      }
    };

    const unbind = priceSocketService.on('price', handlePrice);
    return () => unbind();
  }, [symbol]);

  // Sync with prop currentPrice if provided
  useEffect(() => {
    if (numericPrice > 0) {
      targetPriceRef.current = numericPrice;
      if (interpolatedPriceRef.current === null) {
        interpolatedPriceRef.current = numericPrice;
      }
    }
  }, [numericPrice]);

  // Append new points to rolling history every 50ms and periodically save to cache
  useEffect(() => {
    let saveCounter = 0;
    const mountTime = Date.now();
    const iv = setInterval(() => {
      if (interpolatedPriceRef.current !== null) {
        const now = Date.now();
        const history = priceHistoryRef.current;
        const last = history[history.length - 1];

        // Smoothly step toward target with a gentler lerp
        if (targetPriceRef.current !== null) {
          const diff = targetPriceRef.current - interpolatedPriceRef.current;
          interpolatedPriceRef.current += diff * 0.18;
        }

        if (!last || now > last.t) {
          history.push({ t: now, p: interpolatedPriceRef.current });
        }
        if (history.length > 500) {
          priceHistoryRef.current = history.slice(-300);
        }
        // Save to cache every 2 seconds (40 * 50ms)
        saveCounter++;
        if (saveCounter >= 40) {
          saveCounter = 0;
          const realData = history.filter(p => p.t >= mountTime);
          if (realData.length >= 10) {
            saveHistoryToCache(symbol, realData);
          }
        }
      }
    }, 50);

    return () => clearInterval(iv);
  }, [symbol]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });

    const draw = () => {
      const container = containerRef.current;
      const W = container ? container.offsetWidth : canvas.offsetWidth;
      const H = container ? container.offsetHeight : canvas.offsetHeight;

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

      const history = priceHistoryRef.current;
      const latestPrice = interpolatedPriceRef.current || (history.length > 0 ? history[history.length - 1].p : 1880.89);

      const now = Date.now();
      const startTime = now - windowMs;

      // Layout boundaries
      const SCREEN_SHIFT = 40;
      const priceScaleWidth = 84;
      const liveXBoundary = W - priceScaleWidth - SCREEN_SHIFT;
      // Allow negative X so the line extends past the left edge of the screen
      const getX = (t) => Math.min(liveXBoundary, ((t - startTime) / windowMs) * liveXBoundary);

      // Calculate visible price range — include points slightly before the window for the offscreen lead-in
      let pMin = latestPrice;
      let pMax = latestPrice;
      let visiblePoints = [];

      for (let i = 0; i < history.length; i++) {
        const pt = history[i];
        // Include points from 20% before the window start for offscreen lead-in
        if (pt.t >= startTime - windowMs * 0.2) {
          visiblePoints.push(pt);
          if (pt.p < pMin) pMin = pt.p;
          if (pt.p > pMax) pMax = pt.p;
        }
      }

      if (visiblePoints.length === 0) {
        visiblePoints = [{ t: startTime, p: latestPrice }, { t: now, p: latestPrice }];
      }

      let diff = pMax - pMin;
      if (diff === 0) diff = latestPrice * 0.001;

      // 18% top and bottom padding for balanced breathing room
      const targetMin = pMin - diff * 0.18;
      const targetMax = pMax + diff * 0.18;

      if (yMinRef.current === null) {
        yMinRef.current = targetMin;
        yMaxRef.current = targetMax;
      } else {
        yMinRef.current += (targetMin - yMinRef.current) * 0.12;
        yMaxRef.current += (targetMax - yMaxRef.current) * 0.12;
      }

      const lo = yMinRef.current;
      const hi = yMaxRef.current;
      const range = (hi - lo) || 1;
      const toY = (p) => H - ((p - lo) / range) * H;

      const liveX = liveXBoundary;
      const liveY = toY(latestPrice);

      // 1. Horizontal Dashed Strike/Reference Line across the canvas
      const strikePrice = visiblePoints[0]?.p || latestPrice;
      const strikeY = Math.max(15, Math.min(H - 15, toY(strikePrice)));

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.2;
      ctx.moveTo(0, strikeY);
      ctx.lineTo(W, strikeY);
      ctx.stroke();
      ctx.restore();

      // 2. Build the Smooth Line Path (round joins, flowing from offscreen left)
      // Start from offscreen left so the line appears to stream in from outside the screen
      const firstX = getX(visiblePoints[0].t);
      const leadInX = Math.min(firstX, -40); // Ensure we start well offscreen
      const firstY = toY(visiblePoints[0].p);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leadInX, firstY);
      ctx.lineTo(firstX, firstY);

      for (let i = 1; i < visiblePoints.length; i++) {
        const px = getX(visiblePoints[i].t);
        const py = toY(visiblePoints[i].p);
        ctx.lineTo(px, py);
      }

      // Connect to live point
      ctx.lineTo(liveX, liveY);

      // 3. Gradient Area Fill under the smooth path
      ctx.save();
      const fillPath = new Path2D();
      fillPath.moveTo(leadInX, firstY);
      fillPath.lineTo(firstX, firstY);
      for (let i = 1; i < visiblePoints.length; i++) {
        const px = getX(visiblePoints[i].t);
        const py = toY(visiblePoints[i].p);
        fillPath.lineTo(px, py);
      }
      fillPath.lineTo(liveX, liveY);
      fillPath.lineTo(W, liveY);
      fillPath.lineTo(W, H);
      fillPath.lineTo(leadInX, H);
      fillPath.closePath();

      const fillGrad = ctx.createLinearGradient(0, liveY, 0, H);
      fillGrad.addColorStop(0, isLight ? 'rgba(23, 163, 100, 0.22)' : 'rgba(23, 163, 100, 0.28)');
      fillGrad.addColorStop(0.55, isLight ? 'rgba(23, 163, 100, 0.08)' : 'rgba(23, 163, 100, 0.10)');
      fillGrad.addColorStop(1, 'rgba(23, 163, 100, 0.0)');
      ctx.fillStyle = fillGrad;
      ctx.fill(fillPath);
      ctx.restore();

      // 4. Stroke the Smooth Line (round joins for anti-aliased rendering)
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // 5. Current Price Marker (Hollow Ring with White Center & Green Border)
      ctx.beginPath();
      ctx.arc(liveX, liveY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 6. Connected Live Price Pill Badge on the Right
      const priceText = latestPrice.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: latestPrice < 10 ? 4 : 2,
      });

      const badgeH = 24;
      const badgeW = priceScaleWidth - 6;
      const badgeX = liveX + 4;
      const badgeY = Math.max(4, Math.min(H - badgeH - 4, liveY - badgeH / 2));

      ctx.fillStyle = GREEN;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px "Comfortaa", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

      // 7. Horizontal line after the price badge extending offscreen right
      const lineY = badgeY + badgeH / 2;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 1.8;
      ctx.moveTo(badgeX + badgeW, lineY);
      ctx.lineTo(W + 40, lineY);
      ctx.stroke();
      ctx.restore();

      // 8. ACTIVE TRADE ENTRY MARKERS — Dotted vertical lines + LIVE badge
      const trades = activeTradesRef.current;
      if (trades && trades.length > 0) {
        trades.forEach(trade => {
          const entryPrice = parseFloat(trade.entryPrice);
          if (isNaN(entryPrice)) return;

          const tid = String(trade.id);
          const start = trade.startTime || (tid.length > 12 ? parseInt(tid) : now);
          const duration = trade.duration || 15;
          const expiry = trade.expiryMs || (start + (duration * 1000));
          const isSettled = ['WON', 'LOST', 'PAID'].includes(trade.status);
          const isExpired = now >= expiry || isSettled;
          const isWon = trade.status === 'WON' || trade.status === 'PAID';

          const entryX = getX(start);
          if (entryX < -20 || entryX > W + 20) return;

          const entryY = toY(entryPrice);
          const remainingMs = Math.max(0, expiry - now);
          const remainingSec = (remainingMs / 1000).toFixed(1);

          const currentLivePrice = latestPrice;
          const isInProfit = typeof trade.won === 'boolean'
            ? trade.won
            : (trade.direction === 'UP' || trade.direction === 1 || String(trade.direction) === '1'
                ? currentLivePrice >= entryPrice
                : currentLivePrice <= entryPrice);

          // TARGET PRICE LINE — thick grey dashed line at the entry (target) price
          ctx.save();
          ctx.setLineDash([6, 5]);
          ctx.strokeStyle = isLight ? 'rgba(120,120,120,0.55)' : 'rgba(150,150,150,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, entryY);
          ctx.lineTo(W, entryY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          // Target label — italic, small, on the right (just before the price scale)
          ctx.save();
          ctx.font = 'italic 600 7px Inter, system-ui, sans-serif';
          const entryDecimals = entryPrice < 10 ? 4 : 2;
          const tgtLabel = `TGT ${entryPrice.toFixed(entryDecimals)}`;
          const tgtLabelW = ctx.measureText(tgtLabel).width + 10;
          const tgtX = (W - priceScaleWidth) - tgtLabelW - 8;
          const tgtYTop = Math.max(4, Math.min(entryY - 12, H - 16));
          ctx.fillStyle = isLight ? 'rgba(255,255,255,0.85)' : 'rgba(30,34,32,0.85)';
          ctx.beginPath();
          ctx.roundRect(tgtX, tgtYTop, tgtLabelW, 11, 3);
          ctx.fill();
          ctx.fillStyle = isLight ? '#6b6b6b' : '#c9c9c9';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(tgtLabel, tgtX + 5, tgtYTop + 5.5);
          ctx.restore();

          // Badge — pinned to the entry point ON the price streaming line:
          // hover just above it when there is room, otherwise just below it.
          const badgeW2 = 68;
          const badgeH2 = 30;
          const badgeX2 = entryX - badgeW2 / 2;
          const flagGap2 = 5;
          let badgeY2, lineTop, lineBottom;
          if (entryY - badgeH2 - flagGap2 >= 4) {
            badgeY2 = entryY - badgeH2 - flagGap2;   // badge above the line point
            lineTop = badgeY2 + badgeH2;
            lineBottom = entryY;
          } else {
            badgeY2 = Math.min(H - badgeH2 - 6, entryY + flagGap2); // badge below
            lineTop = entryY;
            lineBottom = badgeY2;
          }

          let badgeColor, badgeGlow, resultText, resultColor;
          if (isSettled) {
            badgeColor = isWon ? 'rgba(23,163,100,0.95)' : 'rgba(240,76,76,0.95)';
            badgeGlow = isWon ? 'rgba(23,163,100,0.5)' : 'rgba(240,76,76,0.5)';
            resultText = isWon ? 'WON' : 'LOST';
            resultColor = isWon ? '#4ADE80' : '#FF7F50';
          } else {
            badgeColor = isLight ? 'rgba(23,163,100,0.92)' : 'rgba(20,71,44,0.92)';
            badgeGlow = 'rgba(23,163,100,0.35)';
          }

          // Soft glow behind vertical line
          if (lineBottom > lineTop) {
            const lineGlow = ctx.createLinearGradient(entryX - 10, 0, entryX + 10, 0);
            lineGlow.addColorStop(0, 'transparent');
            lineGlow.addColorStop(0.5, isSettled
              ? (isWon ? 'rgba(23,163,100,0.08)' : 'rgba(240,76,76,0.06)')
              : (isLight ? 'rgba(23,163,100,0.06)' : 'rgba(23,163,100,0.04)'));
            lineGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = lineGlow;
            ctx.fillRect(entryX - 10, lineTop, 20, lineBottom - lineTop);
          }

          // Dotted vertical line
          if (lineBottom > lineTop) {
            ctx.save();
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = isSettled
              ? (isWon ? 'rgba(23,163,100,0.5)' : 'rgba(240,76,76,0.4)')
              : (isLight ? 'rgba(23,163,100,0.45)' : 'rgba(23,163,100,0.35)');
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(entryX, lineTop);
            ctx.lineTo(entryX, lineBottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }

          // Entry price dot
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.beginPath();
          ctx.arc(entryX, entryY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(entryX, entryY, 4.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = isSettled ? (isWon ? GREEN : '#F04C4C') : GREEN;
          ctx.shadowBlur = 8;
          ctx.shadowColor = isSettled
            ? (isWon ? 'rgba(23,163,100,0.6)' : 'rgba(240,76,76,0.6)')
            : 'rgba(23,163,100,0.5)';
          ctx.beginPath();
          ctx.arc(entryX, entryY, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(entryX, entryY, 1.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Badge background
          ctx.save();
          ctx.shadowBlur = 20;
          ctx.shadowColor = badgeGlow;

          if (!isSettled) {
            const pulsePhase = Math.sin(now / 600) * 0.5 + 0.5;
            ctx.strokeStyle = `rgba(23,163,100,${0.15 + pulsePhase * 0.15})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(badgeX2 - 2, badgeY2 - 2, badgeW2 + 4, badgeH2 + 4, 10);
            ctx.stroke();
          }

          ctx.fillStyle = badgeColor;
          ctx.beginPath();
          ctx.roundRect(badgeX2, badgeY2, badgeW2, badgeH2, 8);
          ctx.fill();

          const highlightGrad = ctx.createLinearGradient(badgeX2, badgeY2, badgeX2, badgeY2 + badgeH2);
          highlightGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
          highlightGrad.addColorStop(0.4, 'rgba(255,255,255,0.02)');
          highlightGrad.addColorStop(1, 'rgba(0,0,0,0.05)');
          ctx.fillStyle = highlightGrad;
          ctx.beginPath();
          ctx.roundRect(badgeX2, badgeY2, badgeW2, badgeH2, 8);
          ctx.fill();

          ctx.strokeStyle = isSettled
            ? (isWon ? 'rgba(23,163,100,0.6)' : 'rgba(240,76,76,0.5)')
            : 'rgba(23,163,100,0.5)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.roundRect(badgeX2, badgeY2, badgeW2, badgeH2, 8);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.restore();

          const iconCenterX = badgeX2 + 12;
          const iconCenterY = badgeY2 + badgeH2 / 2 - 2;
          const iconR = 4.5;

          if (isSettled) {
            const pulse = Math.sin(now / 200) * 0.15 + 0.85;
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.translate(entryX, badgeY2 + badgeH2 / 2);
            ctx.shadowBlur = 14 * pulse;
            ctx.shadowColor = isWon ? 'rgba(74,222,128,0.6)' : 'rgba(255,127,80,0.5)';
            ctx.fillStyle = resultColor;
            ctx.font = '900 11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 2;
            ctx.strokeText(resultText, 0, 0);
            ctx.fillText(resultText, 0, 0);
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.restore();
          } else {
            // Stopwatch icon
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(iconCenterX, iconCenterY, iconR, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(iconCenterX, iconCenterY - iconR - 1);
            ctx.lineTo(iconCenterX, iconCenterY - iconR - 3);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(iconCenterX + iconR * 0.6, iconCenterY - iconR - 0.5);
            ctx.lineTo(iconCenterX + iconR * 0.85, iconCenterY - iconR - 2.5);
            ctx.stroke();

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

            ctx.beginPath();
            ctx.arc(iconCenterX, iconCenterY, 1, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.restore();

            // LIVE text
            const textStartX = iconCenterX + iconR + 3;
            ctx.fillStyle = '#4ADE80';
            ctx.font = '900 7px Inter, system-ui, sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillText('LIVE', textStartX, badgeY2 + 5);

            // Countdown
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px IBM Plex Mono, monospace';
            ctx.textBaseline = 'top';
            const countdownStr = remainingSec < 10 ? `0${remainingSec}` : remainingSec;
            ctx.fillText(countdownStr, textStartX, badgeY2 + 16);
          }
        });
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [theme, symbol, windowMs]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-visible select-none">
      {/* Centered faint 15market watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <img
          src="/logo.png"
          alt="15market"
          className="w-[220px] object-contain select-none"
          style={{
              opacity: isLight ? 0.12 : 0.1,
              filter: isLight ? 'grayscale(100%)' : 'grayscale(100%) invert(100%)',
          }}
        />
      </div>

      <canvas ref={canvasRef} className="w-full h-full block relative z-20" />
    </div>
  );
}

/**
 * MobileTradeView — The exact mobile layout matching the reference screenshot.
 */
export default function MobileTradeView({
  theme = 'light',
  activeMarket,
  handleMarketChange,
  defaultTokens = [],
  oraclePrices = {},
  changes24h = {},
  price,
  executeTrade,
  isExecuting,
  sessionBalance = 0,
  liveOdds,
  minStake = 1,
  tradeHistory = [],
  showFullHistory,
  setShowFullHistory,
  onViewReceipt,
  activeTrades = [],
  onCountdownEnd,
}) {
  const isLight = theme === 'light';
  const [assetOpen, setAssetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(15);
  const [stakeInput, setStakeInput] = useState('');
  const [sliderPct, setSliderPct] = useState(0);

  // Global / settled trades for the live market scroller
  const [tickerHistory, setTickerHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_global_history_v2");
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  useEffect(() => {
    let active = true;
    const fetchTicker = async () => {
      try {
        const res = await fetch(`${KEEPER_URL_ARC}/history`);
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data)) {
            data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            setTickerHistory(data.slice(0, 40));
          }
        }
      } catch (e) {}
    };
    fetchTicker();
    const iv = setInterval(fetchTicker, 12000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  const repeatedTicker = useMemo(() => {
    const list = tickerHistory.length > 0 ? tickerHistory : [
      { id: '1', symbol: 'ETH', direction: 'UP', status: 'WON', payout: '4.16' },
      { id: '2', symbol: 'BTC', direction: 'DOWN', status: 'WON', payout: '8.32' },
      { id: '3', symbol: 'SOL', direction: 'UP', status: 'WON', payout: '5.20' },
      { id: '4', symbol: 'ETH', direction: 'UP', status: 'WON', payout: '4.27' },
      { id: '5', symbol: 'BTC', direction: 'UP', status: 'WON', payout: '9.10' },
    ];
    let full = [...list];
    while (full.length < 24) full = [...full, ...list];
    return [...full, ...full];
  }, [tickerHistory]);

  const currentSymbol = (activeMarket?.symbol || activeMarket?.id || 'ETH').toUpperCase();
  const binanceSymbol = activeMarket?.binance || `${currentSymbol}USDT`;
  const livePriceNum = oraclePrices[(activeMarket?.id || 'eth').toLowerCase()] || parseFloat(price) || 0;

  const currentStake = parseFloat(stakeInput) || 0;

  // Find the current active trade (PENDING or RESOLVING)
  const currentActiveTrade = useMemo(() => {
    if (!activeTrades || activeTrades.length === 0) return null;
    return activeTrades.find(t => ['PENDING', 'RESOLVING'].includes(t.status)) || null;
  }, [activeTrades]);

  // Track settled trade for outcome display
  const [settledTrade, setSettledTrade] = useState(null);
  const [showOutcome, setShowOutcome] = useState(false);
  const settledTradeIdRef = useRef(null);
  const [countdownEnded, setCountdownEnded] = useState(false);

  // Timer state for active trade countdown - MUST be declared before any useEffect
  // that references remainingSec or tradeProgress in dependency arrays
  const [remainingSec, setRemainingSec] = useState(0);
  const [tradeProgress, setTradeProgress] = useState(0);

  // Display each authoritative settlement once. The feed may retain the
  // settled trade, so do not restart the outcome timer on every render/update.
  useEffect(() => {
    const settled = activeTrades?.find(t => ['WON', 'LOST', 'PAID'].includes(t.status));
    if (!settled) return;
    if (currentActiveTrade && (remainingSec > 0 || !countdownEnded)) return;

    const settlementId = String(settled.id ?? `${settled.timestamp ?? settled.settledAt ?? ''}-${settled.status}`);
    if (settledTradeIdRef.current === settlementId) return;
    settledTradeIdRef.current = settlementId;

    setSettledTrade(settled);
    setShowOutcome(true);
    const timer = setTimeout(() => {
      setShowOutcome(false);
      setSettledTrade(null);
      settledTradeIdRef.current = null;
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeTrades, currentActiveTrade, isExecuting, remainingSec, countdownEnded]);

  // Auto-detect countdown end: when remainingSec hits 0 and trade is still PENDING,
  // wait a moment then mark countdown as ended so the trade can resolve.
  // Also capture the live price as the exit price immediately.
  useEffect(() => {
    if (remainingSec === 0 && currentActiveTrade && currentActiveTrade.status === 'PENDING') {
      const timer = setTimeout(() => {
        setCountdownEnded(true);
        if (onCountdownEnd) {
          onCountdownEnd(livePriceNum);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
    if (currentActiveTrade && currentActiveTrade.status !== 'PENDING') {
      setCountdownEnded(false);
    }
  }, [remainingSec, currentActiveTrade, livePriceNum, onCountdownEnd]);

  const isTradeActive = !!currentActiveTrade || isExecuting || showOutcome;

useEffect(() => {
    if (!currentActiveTrade) {
        setRemainingSec(0);
        setTradeProgress(0);
        setCountdownEnded(false);
        return;
    }
    setCountdownEnded(false);
    const duration = currentActiveTrade.duration || 15;
    const totalMs = duration * 1000;
    let rafId;

    const tick = () => {
        const now = Date.now();
        const startTime = currentActiveTrade.startTime || currentActiveTrade.createdAt || currentActiveTrade.timestamp || Date.now();
        const expiry = currentActiveTrade.expiryMs || (startTime + totalMs);
        const remaining = Math.max(0, expiry - now);
        const secs = Math.ceil(remaining / 1000);
        const prog = Math.min(100, ((totalMs - remaining) / totalMs) * 100);
        setRemainingSec(secs);
        setTradeProgress(prog);
        rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
}, [currentActiveTrade]);

  // Odds calculation (defaults to 61¢ / 39¢ like in screenshot)
  const symLower = (activeMarket?.id || 'eth').toLowerCase();
  const backendOdds = liveOdds?.[symLower]?.[selectedDuration];
  const yesShare = backendOdds?.LONG ?? 0.61;
  const noShare = backendOdds?.SHORT ?? 0.39;
  const yesCents = Math.round(yesShare * 100);
  const noCents = Math.round(noShare * 100);

  const tokens = useMemo(() => {
    const list = defaultTokens.length > 0 ? defaultTokens : [
      { id: 'eth', symbol: 'ETH', binance: 'ETHUSDT', name: 'Ethereum' },
      { id: 'btc', symbol: 'BTC', binance: 'BTCUSDT', name: 'Bitcoin' },
      { id: 'sol', symbol: 'SOL', binance: 'SOLUSDT', name: 'Solana' },
      { id: 'mon', symbol: 'MON', binance: 'MONUSDT', name: 'Monad' },
      { id: 'avax', symbol: 'AVAX', binance: 'AVAXUSDT', name: 'Avalanche' },
    ];
    if (!searchQuery) return list;
    return list.filter(t => (t.symbol || t.id || '').toLowerCase().includes(searchQuery.toLowerCase()));
  }, [defaultTokens, searchQuery]);

  const pickAsset = (t) => {
    handleMarketChange?.(t);
    setAssetOpen(false);
  };

  // Slider change handler
  const handleSliderChange = (e) => {
    const pct = parseFloat(e.target.value);
    setSliderPct(pct);
    const maxVal = sessionBalance > 0 ? sessionBalance : 100;
    const computed = ((pct / 100) * maxVal).toFixed(2);
    setStakeInput(computed === '0.00' ? '' : computed);
  };

  // Stake input change handler
  const handleStakeChange = (e) => {
    const val = e.target.value;
    setStakeInput(val);
    const num = parseFloat(val) || 0;
    const maxVal = sessionBalance > 0 ? sessionBalance : 100;
    setSliderPct(Math.min(100, Math.max(0, (num / maxVal) * 100)));
  };

  // Trade execution
  const handleTrade = (direction) => {
    const stakeAmt = parseFloat(stakeInput) || 0;
    if (stakeAmt <= 0) return;
    executeTrade?.({
      direction,
      amount: stakeAmt,
      duration: selectedDuration,
    });
  };

  return (
    <div
      className={`w-full h-full flex flex-col min-h-0 overflow-hidden relative ${
        isLight ? 'bg-white' : 'bg-[#060907]'
      }`}
      style={{ fontFamily: '"Comfortaa", cursive' }}
    >
      {/* ─── 1. TOP LIVE MARKET SCROLLER (Darker Shade of Green with Zigzag Pattern Up & Down) ─── */}
      <div className="w-full relative z-30 shrink-0 select-none overflow-hidden">
        <GlobalTradeScroller theme={theme} />
      </div>

      {/* ─── ASSET SELECTOR DROPDOWN / MODAL ─── */}
      <AnimatePresence>
        {assetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-[44px] bottom-0 z-50 flex flex-col"
            style={{
              backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(6, 9, 7, 0.98)',
            }}
          >
            {/* Search header */}
            <div className="flex items-center gap-2 px-4 py-3">
              <Search size={16} className={isLight ? 'text-gray-400' : 'text-white/40'} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search market (ETH, BTC, SOL)..."
                autoFocus
                className={`flex-1 bg-transparent outline-none text-[14px] font-bold ${
                  isLight ? 'text-black placeholder:text-gray-400' : 'text-white placeholder:text-white/30'
                }`}
              />
            </div>

            {/* Asset items */}
            <div className="flex-1 overflow-y-auto px-2">
              {tokens.map((t) => {
                const isActive = (activeMarket?.id || 'eth').toLowerCase() === t.id.toLowerCase();
                const isUnavailable = t.id?.toLowerCase() === 'mon' || t.id?.toLowerCase() === 'avax';
                const raw = oraclePrices[t.id.toLowerCase()];
                const priceStr = raw ? raw.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00';
                const change = changes24h[t.id.toLowerCase()];
                const changeVal = typeof change === 'object' ? change?.change : change;
                const isUp = (changeVal ?? 0) >= 0;
                const logo = LOGO_MAP[t.id.toLowerCase()];

                return (
                  <button
                    key={t.id}
                    disabled={isUnavailable}
                    onClick={() => pickAsset(t)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors rounded-xl ${
                      isUnavailable ? 'opacity-40' : 'active:bg-[#17A364]/10'
                    } ${isActive ? 'bg-[#17A364]/10' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-black/5 dark:bg-white/10">
                        {logo ? (
                          <img src={logo} alt={t.symbol} className="w-6 h-6 object-contain" style={{ filter: getLogoFilter(isLight) }} crossOrigin="anonymous" />
                        ) : (
                          <span className="text-[12px] font-black">{t.symbol[0]}</span>
                        )}
                      </div>
                      <div>
                        <div className={`text-[15px] font-black leading-tight ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                          {t.symbol}
                        </div>
                        <div className={`text-[11px] font-bold ${isLight ? 'text-gray-400' : 'text-white/40'}`}>
                          {t.name}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-[14px] font-black tabular-nums ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                        ${priceStr}
                      </div>
                      {isUnavailable ? (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                          SOON
                        </span>
                      ) : (
                        <div className={`text-[11px] font-bold ${isUp ? 'text-[#17A364]' : 'text-[#EE4B4B]'}`}>
                          {isUp ? '+' : ''}{parseFloat(changeVal || 0).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 2. CHART AREA WITH SELECTED ASSET TICKER ON TOP LEFT ─── */}
      {/* Height: flexible both ways. On tall screens the chart grows (no 52% cap)
          so the trading controls + history stay anchored to the bottom with no
          dead gap; on short screens it shrinks to fit the UI. */}
      <div className="flex-1 min-h-[140px] w-full relative pt-1 pb-1" style={{ overflow: 'visible' }}>
        {/* Selected Asset Ticker on Top Left of Chart Widget (No pill behind it, big like desktop) */}
        <div className="absolute top-3.5 left-5 z-20">
          <button
            onClick={() => setAssetOpen(o => !o)}
            className="flex items-center gap-2 bg-transparent border-none p-0 outline-none cursor-pointer active:scale-95 transition-transform"
          >
            {LOGO_MAP[(activeMarket?.id || 'eth').toLowerCase()] && (
              <img
                src={LOGO_MAP[(activeMarket?.id || 'eth').toLowerCase()]}
                alt={currentSymbol}
                className={`${(activeMarket?.id || 'eth').toLowerCase() === 'eth' ? 'w-14 h-14' : (activeMarket?.id || 'eth').toLowerCase() === 'sol' ? 'w-[36.4px] h-[36.4px]' : 'w-7 h-7'} object-contain shrink-0`}
                style={{ filter: getLogoFilter(isLight) }}
                crossOrigin="anonymous"
              />
            )}
            <span
              className={`text-[16px] font-bold tracking-wider leading-none ${
                isLight ? 'text-[#0a261a]' : 'text-white'
              }`}
              style={{ fontFamily: '"Comfortaa", cursive' }}
            >
              {currentSymbol}
            </span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${
                isLight ? 'text-[#0a261a]/60' : 'text-white/60'
              } ${assetOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <div className="h-full" style={{ width: 'calc(100% + 80px)', marginLeft: '-40px', overflow: 'visible' }}>
          <MobileSteppedChart
            symbol={binanceSymbol}
            theme={theme}
            currentPrice={livePriceNum}
            activeTrades={activeTrades}
            windowMs={25000}
          />
        </div>
      </div>

      {/* ─── 3-6. TRADING CONTROLS or ACTIVE TRADE ANIMATION ─── */}
      <AnimatePresence mode="wait">
        {isTradeActive ? (
          <motion.div
            key="active-trade"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="shrink-0 relative flex flex-col items-center justify-center gap-2 px-4 py-3 min-h-[56px] w-full"
          >
            {isExecuting && !currentActiveTrade ? (
              <div className="flex items-center gap-2 text-[#17A364] animate-pulse text-[14px] font-black tracking-widest">
                <div className="w-4 h-4 rounded-full border-2 border-[#17A364] border-t-transparent animate-spin" />
                PLACING TRADE...
              </div>
            ) : currentActiveTrade && currentActiveTrade.status === 'PENDING' && remainingSec > 0 ? (
              <div className="flex items-center justify-center gap-3 w-full">
                <FlipClock seconds={remainingSec} isLight={isLight} />
                <ProgressBeam progress={tradeProgress} isWinning={
                  typeof currentActiveTrade.won === 'boolean'
                    ? currentActiveTrade.won
                    : (currentActiveTrade.direction === 'UP' || currentActiveTrade.direction === 'YES'
                        ? livePriceNum >= (parseFloat(currentActiveTrade.entryPrice) || 0)
                        : livePriceNum <= (parseFloat(currentActiveTrade.entryPrice) || 0))
                } />
              </div>
            ) : currentActiveTrade && currentActiveTrade.status === 'PENDING' ? (
              <ResolvingOutcome isLight={isLight} />
            ) : currentActiveTrade && currentActiveTrade.status === 'RESOLVING' ? (
              // Countdown over, verdict pending — neutral spinner, never price-colored
              <ResolvingOutcome isLight={isLight} />
            ) : showOutcome && settledTrade ? (
              <TradeOutcome
                won={settledTrade.status === 'WON' || settledTrade.status === 'PAID'}
                isLight={isLight}
                isPending={currentActiveTrade && currentActiveTrade.status === 'PENDING'}
              />
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="trading-controls"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25 }}
          >
            {/* ─── 3. TIMEFRAME SELECTOR (15s | 10s | 5s) ─── */}
            <div className="shrink-0 flex items-center justify-center gap-3 py-1 px-4 select-none">
              {[15, 10, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDuration(d)}
                  className={`py-1 px-5 rounded-full text-[14px] font-black transition-all active:scale-95 ${
                    selectedDuration === d
                      ? 'bg-[#17A364] text-white shadow-sm'
                      : isLight
                      ? 'text-[#0a261a]/60 hover:text-[#0a261a]'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>

            {/* ─── 4. STAKE INPUT PILL ─── */}
            <div className="shrink-0 px-4 py-1 select-none">
              <div
                className={`w-full rounded-full border-2 border-[#17A364] px-4 py-1.5 flex items-center shadow-sm ${
                  isLight ? 'bg-white/80' : 'bg-black/30'
                }`}
              >
                <span className="text-[#17A364] font-black text-[15px] select-none pl-1 mr-2">
                  $
                </span>
                <input
                  type="number"
                  value={stakeInput}
                  onChange={handleStakeChange}
                  placeholder="STAKE"
                  min="0"
                  step="0.01"
                  className={`w-full text-center font-black text-[14px] uppercase tracking-wider outline-none bg-transparent ${
                    isLight
                      ? 'text-[#17A364] placeholder:text-[#17A364]'
                      : 'text-[#17A364] placeholder:text-[#17A364]'
                  }`}
                />
              </div>
            </div>

            {/* ─── 5. STAKE SLIDER ─── */}
            <div className="shrink-0 px-6 py-2 select-none relative">
              <div className="relative w-full flex items-center h-5">
                <div
                  className={`w-full h-[3px] rounded-full relative ${
                    isLight ? 'bg-gray-300' : 'bg-white/20'
                  }`}
                >
                  {[0, 20, 40, 60, 80, 100].map((tick) => (
                    <div
                      key={tick}
                      className={`absolute top-1/2 -translate-y-1/2 w-[1.5px] h-[7px] ${
                        isLight ? 'bg-gray-400' : 'bg-white/40'
                      }`}
                      style={{ left: `${tick}%` }}
                    />
                  ))}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-[3px] border-[#17A364] transition-all -ml-2 pointer-events-none ${
                      isLight ? 'bg-white' : 'bg-black'
                    }`}
                    style={{ left: `${sliderPct}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={sliderPct}
                  onChange={handleSliderChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>

            {/* ─── 6. EXECUTION BUTTONS (YES | NO) ─── */}
            <div className="shrink-0 px-4 pt-1 pb-3 flex items-center gap-3 select-none">
              <button
                onClick={() => handleTrade('UP')}
                disabled={currentStake <= 0 || isExecuting}
                className={`flex-1 h-[52px] rounded-full bg-[#17A364] text-white flex items-center justify-center gap-3 font-black text-[18px] tracking-wide active:scale-[0.98] transition-all shadow-md ${
                  currentStake <= 0 || isExecuting ? 'opacity-85' : 'hover:brightness-105'
                }`}
              >
                {isExecuting ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    <span>YES</span>
                    <span className="text-[17px] font-black opacity-95">{yesCents}¢</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleTrade('DOWN')}
                disabled={currentStake <= 0 || isExecuting}
                className={`flex-1 h-[52px] rounded-full bg-[#EF5350] text-white flex items-center justify-center gap-3 font-black text-[18px] tracking-wide active:scale-[0.98] transition-all shadow-md ${
                  currentStake <= 0 || isExecuting ? 'opacity-85' : 'hover:brightness-105'
                }`}
              >
                {isExecuting ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    <span>NO</span>
                    <span className="text-[17px] font-black opacity-95">{noCents}¢</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 7. BOTTOM HISTORY SHEET DRAWER (NO COUNTER) ─── */}
      <div className="shrink-0 mt-auto select-none">
        <button
          onClick={() => setShowFullHistory?.(!showFullHistory)}
          className="w-full bg-[#17A364] text-white rounded-t-[28px] pt-2 pb-3.5 px-4 flex flex-col items-center justify-center shadow-lg active:brightness-95 transition-all"
        >
          {/* Horizontal Grab Bar */}
          <div className="w-12 h-1 bg-white/40 rounded-full mb-2" />

          {/* History bar text — Only carry TRADE HISTORY label, no counter */}
          <div className="flex items-center justify-center gap-2 text-[12px] font-black tracking-widest uppercase">
            <History size={14} className="text-white" />
            <span>TRADE HISTORY</span>
            <ChevronUp
              size={14}
              className={`transition-transform duration-300 ${showFullHistory ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
      </div>

      {/* ─── EXPANDABLE TRADE HISTORY MODAL / BOTTOM SHEET ─── */}
      <AnimatePresence>
        {showFullHistory && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-[32px] overflow-hidden shadow-2xl border-t border-black/10 dark:border-white/10 flex flex-col"
            style={{
              height: '40vh',
              backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(10, 16, 12, 0.98)',
            }}
          >
            {/* Header bar of drawer — Only carry TRADE HISTORY label, no counter */}
            <div
              onClick={() => setShowFullHistory(false)}
              className="w-full bg-[#17A364] text-white pt-2.5 pb-2 px-4 flex flex-col items-center justify-center cursor-pointer"
            >
              <div className="w-12 h-1 bg-white/40 rounded-full mb-1.5" />
              <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest">
                <History size={14} />
                <span>TRADE HISTORY</span>
                <ChevronDown size={14} />
              </div>
            </div>

            {/* List of Trades */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(!tradeHistory || tradeHistory.length === 0) ? (
                <div className="h-full flex flex-col items-center justify-center py-10 opacity-30 text-center">
                  <History size={36} className="mb-2" />
                  <p className="text-[11px] font-black uppercase tracking-wider">No trades executed yet</p>
                </div>
              ) : (
                tradeHistory.map((trade, idx) => {
                  const isWin = trade.status === 'WON' || trade.status === 'PAID' || trade.result === 'WIN';
                  const isUp = trade.direction === 'UP' || trade.direction === 'YES' || trade.direction === 1;
                  return (
                    <div
                      key={trade.id || idx}
                      onClick={() => onViewReceipt?.(trade)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer active:scale-[0.99] transition-transform ${
                        isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[11px] text-white ${
                            isUp ? 'bg-[#17A364]' : 'bg-[#EE4B4B]'
                          }`}
                        >
                          {isUp ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                        </div>
                        <div>
                          <div className={`text-[12px] font-black ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                            {trade.symbol || currentSymbol} {isUp ? 'YES' : 'NO'}
                          </div>
                          <div className={`text-[10px] font-bold ${isLight ? 'text-gray-400' : 'text-white/40'}`}>
                            Stake: ${parseFloat(trade.amount || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-[12px] font-black ${
                            isWin ? 'text-[#17A364]' : 'text-[#EE4B4B]'
                          }`}
                        >
                          {isWin ? `+$${parseFloat(trade.payout || 0).toFixed(2)}` : 'LOST'}
                        </div>
                        <div className={`text-[9px] font-bold ${isLight ? 'text-gray-400' : 'text-white/40'}`}>
                          {trade.status || 'SETTLED'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
