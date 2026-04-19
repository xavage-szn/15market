import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, HistogramSeries, LineSeries, AreaSeries } from 'lightweight-charts';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Zap } from 'lucide-react';

import { MascotLoader } from './MascotLoader';
import LiveStreamingChart from './LiveStreamingChart';

/**
 * INDEPENDENT CHART WIDGET
 * ─────────────────────────
 * This chart is 100% self-sufficient. It fetches its own price feed via
 * Binance WebSocket and REST API. It does NOT depend on the backend or
 * parent component for price data.
 *
 * Props:
 *   - symbol: Binance trading pair (e.g. 'ETHUSDT')
 *   - theme: 'dark' | 'light'
 *   - activeMarket: current market object
 *   - setActiveMarket: market change handler
 *   - activeTrades: array of active trades for markers
 *   - uiVersion: UI layout version
 *   - onPriceUpdate: optional callback to expose the live price to parent
 */
export default function CustomChart({ symbol = 'ETHUSDT', theme = 'dark', activeMarket, setActiveMarket, activeTrades = [], uiVersion = 'v1', onPriceUpdate }) {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const smaSeriesRef = useRef(null);
    const lastCandleTime = useRef(null);

    const [timeframe, setTimeframe] = useState('1s');
    const [isLoading, setIsLoading] = useState(true);
    const [chartProgress, setChartProgress] = useState(0);
    const [loaderStatus, setLoaderStatus] = useState('walking');
    const isFirstLoad = useRef(true);

    const [gridMode, setGridMode] = useState('none');
    const [isFullscreen, setIsFullscreen] = useState(false);

    // ─── INDEPENDENT PRICE STATE ───
    const [livePrice, setLivePrice] = useState(0);
    const livePriceRef = useRef(0);
    const priceHistoryRef = useRef([]);
    const wsRef = useRef(null);
    const wsReconnectTimer = useRef(null);

    const isDark = theme !== 'light';
    const textColor = isDark ? '#D9D9D9' : '#0f2618';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(60, 179, 113, 0.1)';

    const controlBgAlt = isDark ? 'bg-[#0a0a0a]/95' : 'bg-[#b5d3c7]/95';
    const controlBorder = isDark ? 'border-white/10' : 'border-[#3CB371]/25';
    const controlText = isDark ? 'text-white' : 'text-[#0a261a]';
    const controlTextDim = isDark ? 'text-white/40' : 'text-[#0a261a]/60';

    // ─── BINANCE WEBSOCKET: INDEPENDENT PRICE FEED ───
    useEffect(() => {
        const binanceSymbol = symbol.toLowerCase();
        let isMounted = true;

        // 1. FAST-START: Instantly fetch the current price via REST
        // so we don't have to wait for the first WS trade event (which can take seconds)
        fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol.toUpperCase()}`)
            .then(res => res.json())
            .then(data => {
                if (!isMounted) return;
                const price = parseFloat(data.price);
                if (price > 0 && !livePriceRef.current) {
                    livePriceRef.current = price;
                    setLivePrice(price);
                    setIsLoading(false);
                    if (onPriceUpdate) {
                        const truncated = Math.floor(price * 100) / 100;
                        onPriceUpdate(truncated.toFixed(2));
                    }
                }
            })
            .catch(e => console.warn('[Chart REST] Failed to fetch initial price', e));

        const connectWs = () => {
            // Clean up any existing connection
            if (wsRef.current) {
                try { wsRef.current.close(); } catch (e) {}
                wsRef.current = null;
            }

            // 2. USE DEFAULT PORT 443: Avoids 9443 which is often blocked by corporate/ISP firewalls
            const ws = new WebSocket(`wss://stream.binance.com/ws/${binanceSymbol}@trade`);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log(`[Chart WS] Connected to Binance stream: ${binanceSymbol}`);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.p) {
                        const price = parseFloat(data.p);
                        if (price > 0) {
                            livePriceRef.current = price;
                            const now = Date.now();

                            // Throttle React state updates to ~4Hz to prevent render storms
                            if (!ws._lastStateUpdate || now - ws._lastStateUpdate > 250) {
                                ws._lastStateUpdate = now;
                                setLivePrice(price);

                                // Expose to parent for trade entry price capture
                                if (onPriceUpdate) {
                                    const truncated = Math.floor(price * 100) / 100;
                                    onPriceUpdate(truncated.toFixed(2));
                                }
                            }

                            // Always push to history for the streaming chart
                            priceHistoryRef.current.push({ t: now, p: price });
                            if (priceHistoryRef.current.length > 600) {
                                priceHistoryRef.current = priceHistoryRef.current.slice(-400);
                            }

                            // Wake up the chart if still loading
                            if (isLoading && price > 0) {
                                setIsLoading(false);
                            }
                        }
                    }
                } catch (e) {}
            };

            ws.onerror = (err) => {
                console.warn('[Chart WS] Error:', err);
            };

            ws.onclose = () => {
                console.log('[Chart WS] Disconnected. Reconnecting in 3s...');
                wsReconnectTimer.current = setTimeout(connectWs, 3000);
            };
        };

        connectWs();

        return () => {
            if (wsReconnectTimer.current) clearTimeout(wsReconnectTimer.current);
            if (wsRef.current) {
                try { wsRef.current.close(); } catch (e) {}
                wsRef.current = null;
            }
        };
    }, [symbol]); // Reconnect on symbol change

    // ─── BINANCE REST: HISTORICAL KLINES ───
    const getApiInterval = (tf) => {
        if (tf === '1s') return '1m';
        if (tf === '5m') return '5m';
        if (tf === '1h') return '60m';
        return '1m';
    };

    const fetchKlines = useCallback(async (tf) => {
        try {
            const apiInterval = getApiInterval(tf);
            const binanceSymbol = symbol.toUpperCase();
            const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${apiInterval}&limit=1000`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json();
            if (!Array.isArray(data)) return [];

            return data.map(d => ({
                time: Math.floor(d[0] / 1000),
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                value: parseFloat(d[4]),
                volume: parseFloat(d[5] || 0)
            }));
        } catch (e) {
            console.error("[CHART] Failed to fetch klines:", e);
            return [];
        }
    }, [symbol]);

    const tradePriceLines = useRef(new Map());

    // ─── LIGHTWEIGHT CHARTS INIT ───
    useEffect(() => {
        if (!chartContainerRef.current) return;

        chartContainerRef.current.innerHTML = '';

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: textColor,
            },
            localization: {
                priceFormatter: price => price.toFixed(2),
            },
            grid: {
                vertLines: { color: gridMode === 'all' ? gridColor : 'transparent' },
                horzLines: { color: (gridMode === 'horz' || gridMode === 'all') ? gridColor : 'transparent' },
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    labelBackgroundColor: '#3CB371',
                    style: 0,
                    width: 1,
                    color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(60, 179, 113, 0.2)',
                    labelVisible: true,
                },
                horzLine: {
                    labelBackgroundColor: '#3CB371',
                    style: 0,
                    width: 1,
                    color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(60, 179, 113, 0.2)',
                    labelVisible: true,
                },
            },
            timeScale: {
                borderColor: gridColor,
                timeVisible: true,
                secondsVisible: timeframe === '1s',
                shiftVisibleRangeOnNewBar: true,
                handleScroll: true,
                handleScale: true,
            },
            rightPriceScale: {
                borderColor: gridColor,
                autoScale: true,
                alignLabels: true,
                borderVisible: false,
            },
            handleScale: {
                mouseWheel: true,
                pinch: true,
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
            },
        });

        chart.timeScale().applyOptions({
            barSpacing: timeframe === '1s' ? 12 : 6,
            minBarSpacing: 0.5,
        });

        const areaSeries = chart.addSeries(AreaSeries, {
            lineColor: isDark ? '#3CB371' : '#1e5a38',
            topColor: isDark ? 'rgba(60, 179, 113, 0.4)' : 'rgba(30, 90, 56, 0.5)',
            bottomColor: isDark ? 'rgba(60, 179, 113, 0.0)' : 'rgba(30, 90, 56, 0.05)',
            lineWidth: 3,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
        seriesRef.current = areaSeries;

        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        });
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        const smaSeries = chart.addSeries(LineSeries, {
            color: 'rgba(60, 179, 113, 0.3)',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });

        volumeSeriesRef.current = volumeSeries;
        smaSeriesRef.current = smaSeries;
        chartRef.current = chart;

        setIsLoading(true);
        setChartProgress(0);
        setLoaderStatus('walking');

        const progressInterval = setInterval(() => {
            setChartProgress(prev => {
                if (prev < 75) return prev + Math.random() * 2;
                return prev;
            });
        }, 100);

        fetchKlines(timeframe).then(data => {
            clearInterval(progressInterval);
            if (data && data.length > 0 && seriesRef.current) {
                seriesRef.current.setData(data);

                const volumeData = data.map(d => ({
                    time: d.time,
                    value: d.volume || (Math.random() * 100),
                    color: d.close >= d.open ? 'rgba(60, 179, 113, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                }));
                volumeSeriesRef.current.setData(volumeData);

                const smaData = [];
                const period = 20;
                for (let i = period; i < data.length; i++) {
                    const sum = data.slice(i - period, i).reduce((a, b) => a + (b.close || b.value), 0);
                    smaData.push({ time: data[i].time, value: sum / period });
                }
                smaSeriesRef.current.setData(smaData);

                if (isFirstLoad.current) {
                    setTimeout(() => {
                        if (chartRef.current && data.length > 0) {
                            const lastCandle = data[data.length - 1];
                            const firstVisibleTime = data[Math.max(0, data.length - 150)].time;
                            chartRef.current.timeScale().setVisibleRange({
                                from: firstVisibleTime,
                                to: lastCandle.time + (60 * 2)
                            });
                            isFirstLoad.current = false;
                        }
                    }, 200);
                }

                setLoaderStatus('running');
                setChartProgress(75);

                const finishInterval = setInterval(() => {
                    setChartProgress(prev => {
                        if (prev >= 100) {
                            clearInterval(finishInterval);
                            setTimeout(() => setIsLoading(false), 300);
                            return 100;
                        }
                        return prev + 5;
                    });
                }, 40);
            } else {
                setIsLoading(false);
            }
        });

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                });
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        if (chartContainerRef.current) {
            resizeObserver.observe(chartContainerRef.current);
        }

        let interval;
        if (timeframe !== '1s') {
            interval = setInterval(async () => {
                const fresh = await fetchKlines(timeframe);
                if (fresh && fresh.length > 0 && seriesRef.current) {
                    const newCandle = fresh[fresh.length - 1];
                    if (typeof newCandle.time !== 'number') return;
                    if (lastCandleTime.current && newCandle.time < lastCandleTime.current) return;
                    seriesRef.current.update(newCandle);
                    lastCandleTime.current = newCandle.time;
                }
            }, 3000);
        }

        return () => {
            resizeObserver.disconnect();
            if (interval) clearInterval(interval);
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
            seriesRef.current = null;
            volumeSeriesRef.current = null;
            smaSeriesRef.current = null;
            tradePriceLines.current.clear();
        };
    }, [theme, fetchKlines, textColor, gridColor, timeframe, symbol, gridMode]);

    // ─── ESCAPE KEY FOR FULLSCREEN ───
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

    // ─── TRADE MARKERS ON CHART ───
    useEffect(() => {
        if (!seriesRef.current || !chartRef.current) return;

        const updateMarkers = () => {
            const currentSeries = seriesRef.current;
            const currentChart = chartRef.current;
            if (!currentSeries || !currentChart) return;

            const currentTradeIds = new Set(activeTrades.map(t => String(t.id)));

            for (const [id, line] of tradePriceLines.current.entries()) {
                if (!currentTradeIds.has(id)) {
                    if (typeof currentSeries.removePriceLine === 'function') {
                        try { currentSeries.removePriceLine(line); } catch (e) { }
                    }
                    tradePriceLines.current.delete(id);
                }
            }

            const markers = [];
            const now = Date.now();

            activeTrades.forEach(trade => {
                const id = String(trade.id);
                const entryPrice = parseFloat(trade.entryPrice || livePriceRef.current);
                const isCall = trade.direction === "UP" || trade.direction === "buy";

                const startTime = (trade.startTime || trade.nonce) > 1000000000000
                    ? (trade.startTime || trade.nonce)
                    : (trade.startTime || trade.nonce) * 1000;

                const durationMs = (trade.duration || 15) * 1000;
                const expiryTime = startTime + durationMs;
                const secondsLeft = Math.max(0, Math.floor((expiryTime - now) / 1000));

                if (!tradePriceLines.current.has(id)) {
                    if (typeof currentSeries.createPriceLine === 'function') {
                        try {
                            const priceLine = currentSeries.createPriceLine({
                                price: entryPrice,
                                color: isCall ? '#3CB371' : '#FF4444',
                                lineWidth: 2,
                                lineStyle: 2,
                                axisLabelVisible: true,
                                title: `${trade.amount} USDC`,
                            });
                            tradePriceLines.current.set(id, priceLine);
                        } catch (e) { }
                    }
                }

                markers.push({
                    time: Math.floor(startTime / 1000),
                    position: isCall ? 'belowBar' : 'aboveBar',
                    color: isCall ? '#3CB371' : '#FF4444',
                    shape: isCall ? 'arrowUp' : 'arrowDown',
                    text: `${trade.amount} • ENTRY`,
                    size: 1,
                });

                if (secondsLeft > 0) {
                    markers.push({
                        time: Math.floor(now / 1000),
                        position: 'inBar',
                        color: isCall ? '#3CB371' : '#FF4444',
                        shape: 'circle',
                        text: `EXP: ${secondsLeft}s`,
                        size: 0.5,
                    });
                }
            });

            if (typeof currentSeries.setMarkers === 'function') {
                try {
                    const validMarkers = markers
                        .filter(m => m.time && m.time > 0)
                        .sort((a, b) => a.time - b.time);

                    const uniqueMarkers = [];
                    const seenTimes = new Set();
                    for (const m of validMarkers) {
                        if (!seenTimes.has(m.time)) {
                            uniqueMarkers.push(m);
                            seenTimes.add(m.time);
                        }
                    }
                    currentSeries.setMarkers(uniqueMarkers);
                } catch (e) {
                    console.warn("[Chart] Marker Update Error:", e.message);
                }
            }
        };

        updateMarkers();
        const interval = setInterval(updateMarkers, 1000);
        return () => clearInterval(interval);
    }, [activeTrades]);

    // ─── LIVE PRICE → CHART UPDATES (from our own WS) ───
    useEffect(() => {
        const updateInterval = setInterval(() => {
            const price = livePriceRef.current;
            if (!price || !seriesRef.current) return;

            if (timeframe !== '1s') {
                const time = Math.floor(Date.now() / 60000) * 60;
                if (lastCandleTime.current && time < lastCandleTime.current) return;
                seriesRef.current.update({ time, value: price });
                lastCandleTime.current = time;
            }
        }, 500);

        return () => clearInterval(updateInterval);
    }, [timeframe]);

    // ─── TOKEN SELECTOR STATE ───
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [tokens, setTokens] = useState(() => {
        const defaultList = [
            { id: 'eth', symbol: 'ETH', name: 'Ethereum', binance: 'ETHUSDT' },
            { id: 'btc', symbol: 'BTC', name: 'Bitcoin', binance: 'BTCUSDT' },
            { id: 'sol', symbol: 'SOL', name: 'Solana', binance: 'SOLUSDT' },
            { id: 'mon', symbol: 'MON', name: 'Monad', binance: 'SOLUSDT' },
        ];
        const savedRaw = localStorage.getItem('15market_listed_tokens');
        if (savedRaw && (savedRaw.toLowerCase().includes('price') || !savedRaw.includes('binance'))) {
            localStorage.removeItem('15market_listed_tokens');
            return defaultList;
        }
        const saved = JSON.parse(savedRaw || '[]');
        return saved.length > 0 ? saved : defaultList;
    });

    // ─── LIVE TRADE RESULTS OVERLAY ───
    const tradeResults = useMemo(() => {
        const now = Date.now();
        return activeTrades.map(trade => {
            const entryPrice = parseFloat(trade.entryPrice);
            const referencePrice = (trade.lockedExitPrice || trade.settlementPrice)
                ? parseFloat(trade.lockedExitPrice || trade.settlementPrice)
                : livePriceRef.current;

            const isCall = trade.direction === "UP" || trade.direction === "buy" || trade.direction === 1;
            const won = isCall ? referencePrice > entryPrice : referencePrice < entryPrice;
            const diff = Math.abs(referencePrice - entryPrice).toFixed(4);
            return { id: trade.id, won, diff, amount: trade.amount };
        });
    }, [activeTrades, livePrice]);

    const toggleFullscreen = () => {
        if (!isFullscreen) {
            const elem = chartContainerRef.current.parentElement.parentElement;
            if (elem.requestFullscreen) elem.requestFullscreen();
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
            else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    return (
        <div
            className={`relative w-full h-full flex flex-col flex-1 ${isFullscreen ? 'fixed inset-0 z-[9999] bg-[#0d0d0d]' : ''}`}
            style={{
                backgroundColor: 'transparent',
                borderRadius: isFullscreen ? '0' : 'inherit',
                minHeight: isFullscreen ? '100vh' : (uiVersion === 'v2' ? '120px' : '220px')
            }}
        >
            {/* Branded Background Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img src="/logo.png" alt="15market" style={{
                    width: '85%',
                    opacity: isDark ? 0.12 : 0.08,
                    filter: isDark ? 'grayscale(1) brightness(0.7)' : 'grayscale(1) brightness(0.1)',
                    mixBlendMode: isDark ? 'screen' : 'multiply'
                }} />
            </div>

            {/* Chart Area */}
            <div className="absolute inset-0 z-10 flex-1 h-full">
                <div
                    ref={chartContainerRef}
                    className={`w-full h-full ${timeframe === '1s' ? 'hidden' : 'block'}`}
                />

                {timeframe === '1s' && (
                    <LiveStreamingChart
                        theme={theme}
                        currentPrice={livePriceRef.current || 0}
                        symbol={symbol}
                        priceHistory={priceHistoryRef.current}
                    />
                )}

                {/* Loading Overlay */}
                <AnimatePresence>
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`absolute inset-0 z-[60] flex flex-col items-center justify-center backdrop-blur-md ${isDark ? 'bg-black/40' : 'bg-[#f0f9f4]/60'}`}
                        >
                            <div className="flex flex-col items-center justify-center w-full h-full">
                                <MascotLoader
                                    status={loaderStatus}
                                    progress={chartProgress}
                                    label="Calibrating Flight Path"
                                    theme={theme}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Live Results Floating Overlay */}
            <div className="absolute top-24 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {tradeResults.map((result) => (
                        <motion.div
                            key={result.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className={`px-3 py-1.5 rounded-xl border backdrop-blur-md flex items-center gap-2 shadow-xl ${result.won
                                ? 'bg-[#3CB371]/20 border-[#3CB371]/30'
                                : 'bg-[#FF4444]/20 border-[#FF4444]/30'
                                }`}
                        >
                            <div className={`w-2 h-2 rounded-full animate-pulse ${result.won ? 'bg-[#3CB371]' : 'bg-[#FF4444]'}`} />
                            <span className={`text-[10px] font-black uppercase ${isDark ? 'text-white' : 'text-[#0a261a]'} tracking-widest`}>
                                {result.won ? `+$${(result.amount * 1.95).toFixed(2)}` : `-$${result.amount}`}
                            </span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Top Controls */}
            <div className="absolute top-0 left-0 right-0 z-30 p-2 lg:p-4 pointer-events-none">
                <div className="flex items-center justify-between gap-2 pointer-events-auto">

                    {/* LEFT: symbol selector */}
                    <div className="flex items-center gap-2">
                        <div
                            className={`flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1 rounded-lg transition-all border border-transparent hover:${controlBorder} pointer-events-auto group`}
                            onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                        >
                            <h2 className={`text-[14px] lg:text-lg font-black ${controlText} tracking-widest uppercase flex items-center gap-2`}>
                                {symbol.replace('USDT', '')}
                            </h2>
                            <ChevronDown size={14} className="text-[#3CB371] transition-transform duration-300 group-hover:scale-110" />
                        </div>

                        {/* Live price badge */}
                        {livePrice > 0 && (
                            <div className={`px-2 py-0.5 rounded-lg text-[11px] font-black tabular-nums ${isDark ? 'bg-[#3CB371]/10 text-[#3CB371]' : 'bg-[#1e5a38]/10 text-[#1e5a38]'}`}>
                                ${livePrice.toFixed(2)}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isSelectorOpen && (
                    <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`absolute top-16 left-4 z-[100] w-56 ${controlBgAlt} backdrop-blur-3xl border ${controlBorder} rounded-2xl p-2 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] flex flex-col gap-1 pointer-events-auto`}>
                        {tokens.map(t => (
                            <button key={t.id} onClick={() => { setActiveMarket(t); setIsSelectorOpen(false); }} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${activeMarket?.id === t.id ? 'bg-[#3CB371] text-white' : `hover:bg-white/5 ${controlTextDim} hover:${controlText}`}`}>
                                <div className="flex flex-col items-start"><span className="text-xs font-black uppercase tracking-widest">{t.symbol}</span><span className="text-[8px] opacity-60 font-medium">{t.name || 'Crypto'}</span></div>
                                {activeMarket?.id === t.id && <Zap size={10} className="fill-current text-white animate-pulse" />}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
