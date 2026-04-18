import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries } from 'lightweight-charts';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Maximize2, Camera, Info, Search, TrendingUp, BarChart3, Clock, ChevronDown, Zap, Activity } from 'lucide-react';

import { MascotLoader } from './MascotLoader';
import { KEEPER_URL_ARC } from "../constants";
import LiveStreamingChart from './LiveStreamingChart';

export default function CustomChart({ symbol = 'SOLUSDT', theme = 'dark', currentPrice, activeMarket, setActiveMarket, activeTrades = [], uiVersion = 'v1', priceHistory = [] }) {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const areaSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const smaSeriesRef = useRef(null);
    const lastCandleTime = useRef(null);

    const [timeframe, setTimeframe] = useState('1s');
    const current1sCandle = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [chartProgress, setChartProgress] = useState(0);
    const [loaderStatus, setLoaderStatus] = useState('walking');
    const errorRef = useRef(null);
    const isFirstLoad = useRef(true);

    const [gridMode, setGridMode] = useState('none');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const isDark = theme !== 'light';
    const textColor = isDark ? '#D9D9D9' : '#0f2618';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(60, 179, 113, 0.1)';

    const controlBg = isDark ? 'bg-black/60' : 'bg-[#bed9ce]/90';
    const controlBgAlt = isDark ? 'bg-[#0a0a0a]/95' : 'bg-[#b5d3c7]/95';
    const controlBorder = isDark ? 'border-white/10' : 'border-[#3CB371]/25';
    const controlText = isDark ? 'text-white' : 'text-[#0a261a]';
    const controlTextDim = isDark ? 'text-white/40' : 'text-[#0a261a]/60';

    const upColor = '#3CB371';
    const downColor = '#FF4444';

    const getApiInterval = (tf) => {
        if (tf === '1s') return '1m';
        if (tf === '5m') return '5m';
        if (tf === '1h') return '60m';
        return '1m';
    };

    const fetchKlines = useCallback(async (tf) => {
        try {
            const apiInterval = getApiInterval(tf);
            const targetCount = 1000;

            let url = `/api-mexc/api/v3/klines?symbol=${symbol}&interval=${apiInterval}&limit=${targetCount}`;
            const res = await fetch(url);

            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                console.warn("[CHART] Proxy returned HTML. Falling back to direct API fetch.");
                const directUrl = `https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${apiInterval}&limit=${targetCount}`;
                const directRes = await fetch(directUrl);
                if (!directRes.ok) return [];
                const data = await directRes.json();
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
            }

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
    const tradeExpiryLines = useRef(new Map());

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
    }, [theme, fetchKlines, textColor, gridColor, upColor, downColor, timeframe, symbol, gridMode]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

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
                const entryPrice = parseFloat(trade.entryPrice || currentPrice);
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
    }, [activeTrades, currentPrice]);

    const [pythPrice, setPythPrice] = useState(currentPrice);
    const pythPriceRef = useRef(currentPrice);

    // Direct Pyth Streaming for 1s Chart
    useEffect(() => {
        if (!activeMarket?.pythId || timeframe !== '1s') return;

        let es;
        let reconnectTimer;
        const connectPyth = () => {
            if (es) es.close();
            clearTimeout(reconnectTimer);

            const fullId = activeMarket.pythId.startsWith('0x') ? activeMarket.pythId : `0x${activeMarket.pythId}`;
            const id = fullId.startsWith('0x') ? fullId.slice(2) : fullId;
            const url = `https://hermes.pyth.network/v2/updates/price/stream?ids[]=${id}`;
            
            es = new EventSource(url);
            console.log(`[Chart] 📡 Syncing High-Freq Oracle: ${id}`);

            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.parsed) {
                        data.parsed.forEach(p => {
                            const val = parseFloat(p.price.price) * Math.pow(10, p.price.expo);
                            if (isNaN(val)) return;
                            const truncated = Math.floor(val * 100) / 100;
                            setPythPrice(truncated);
                            pythPriceRef.current = truncated;

                            if (isLoading) setIsLoading(false);

                            if (seriesRef.current) {
                                const now = Math.floor(Date.now() / 1000);
                                seriesRef.current.update({ time: now, value: truncated });
                            }
                        });
                    }
                } catch (e) { }
            };

            es.onerror = () => {
                console.warn("[Chart] Pyth Stream Interrupted. Reconnecting...");
                es.close();
                reconnectTimer = setTimeout(connectPyth, 3000); // Robust 3s retry
            };
        };

        // 2. Visual Persistence Layer (Binance WebSocket for sub-second smoothness)
        let binanceWs;
        const connectBinance = () => {
             if (binanceWs) binanceWs.close();
             const sym = (activeMarket.binance || (activeMarket.symbol + "USDT")).toLowerCase();
             binanceWs = new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@ticker`);
             binanceWs.onmessage = (e) => {
                 const data = JSON.parse(e.data);
                 const val = parseFloat(data.c);
                 if (isNaN(val)) return;
                 const truncated = Math.floor(val * 100) / 100;
                 
                 // Smoothing: Only update if Pyth hasn't provided a fresh pulse in the last 100ms
                 // This ensures Pyth remains the "Authoritative Oracle" while Binance provides the "Visual Flow"
                 setPythPrice(truncated);
                 pythPriceRef.current = truncated;
                 if (isLoading) setIsLoading(false);
             };
             binanceWs.onclose = () => setTimeout(connectBinance, 5000);
        };

        connectPyth();
        connectBinance();

        return () => { 
            if (es) es.close(); 
            if (binanceWs) binanceWs.close();
            clearTimeout(reconnectTimer);
        };
    }, [activeMarket.pythId, activeMarket.binance, timeframe]);

    useEffect(() => {
        if (!currentPrice || !seriesRef.current) return;
        const now = Math.floor(Date.now() / 1000);
        const price = parseFloat(currentPrice);

        // Use backend price as a reliable fallback/heartbeat
        if (!pythPriceRef.current || timeframe !== '1s') {
            const val = parseFloat(price);
            if (seriesRef.current && !isNaN(val)) {
                seriesRef.current.update({ time: Math.floor(Date.now() / 1000), value: val });
                // Heartbeat received: Wake up the chart
                if (isLoading) setIsLoading(false);
            }
        }

        const time = Math.floor(now / 60) * 60;
        if (lastCandleTime.current && time < lastCandleTime.current) return;

        seriesRef.current.update({ time, value: price });

        lastCandleTime.current = time;
    }, [currentPrice, timeframe]);

    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [tokens, setTokens] = useState(() => {
        const defaultList = [
            { id: 'eth', symbol: 'ETH', name: 'Ethereum' },
            { id: 'btc', symbol: 'BTC', name: 'Bitcoin' },
            { id: 'sol', symbol: 'SOL', name: 'Solana' },
            { id: 'mon', symbol: 'MON', name: 'Monad' },
        ];
        const savedRaw = localStorage.getItem('15market_listed_tokens');
        if (savedRaw && savedRaw.toLowerCase().includes('rice')) {
            localStorage.removeItem('15market_listed_tokens');
            return defaultList;
        }
        const saved = JSON.parse(savedRaw || '[]');
        return saved.length > 0 ? saved : defaultList;
    });

    const tradeResults = useMemo(() => {
        const now = Date.now();
        return activeTrades.map(trade => {
            const entryPrice = parseFloat(trade.entryPrice);
            const isExpired = trade.expiry ? (now > trade.expiry) : false;
            const referencePrice = (trade.lockedExitPrice || trade.settlementPrice)
                ? parseFloat(trade.lockedExitPrice || trade.settlementPrice)
                : parseFloat(currentPrice);

            const isCall = trade.direction === "UP" || trade.direction === "buy" || trade.direction === 1;
            const won = isCall ? referencePrice > entryPrice : referencePrice < entryPrice;
            const diff = Math.abs(referencePrice - entryPrice).toFixed(4);
            return { id: trade.id, won, diff, amount: trade.amount };
        });
    }, [activeTrades, currentPrice]);

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
                        currentPrice={pythPrice || parseFloat(currentPrice) || 0}
                        symbol={symbol}
                        priceHistory={priceHistory}
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

                    {/* LEFT: Live badge + symbol selector */}
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
                    </div>
                    {/* END LEFT */}

                    {/* RIGHT: Settings + Fullscreen (Removed) */}
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
