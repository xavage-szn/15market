import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries } from 'lightweight-charts';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Maximize2, Camera, Info, Search, TrendingUp, BarChart3, Clock, ChevronDown, Zap, Activity } from 'lucide-react';

import { KEEPER_URL_ARC } from "../constants";

export default function CustomChart({ symbol = 'SOLUSDT', theme = 'dark', currentPrice, activeMarket, setActiveMarket, activeTrades = [] }) {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const areaSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const smaSeriesRef = useRef(null);
    const lastCandleTime = useRef(null);

    const [timeframe, setTimeframe] = useState('1m');
    const [chartType, setChartType] = useState('line'); // 'candles' or 'line'
    const current1sCandle = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const isFirstLoad = useRef(true);

    const [showGrid, setShowGrid] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const isDark = theme !== 'light';
    const textColor = isDark ? '#D9D9D9' : '#1f2937';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

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
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            let url = `/api-mexc/api/v3/klines?symbol=${symbol}&interval=${apiInterval}&limit=${targetCount}`;

            // In production Vercel, relative paths for APIs usually fail without complex proxy config. 
            // We'll fallback to direct MEXC if the proxy isn't set up.
            const res = await fetch(url);

            // CHECK FOR VERCEL SPA REDIRECT (HTML instead of JSON)
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
                value: parseFloat(d[4]), // for line series
                volume: parseFloat(d[5] || 0)
            }));
        } catch (e) {
            console.error("[CHART] Failed to fetch klines:", e);
            return [];
        }
    }, [symbol]);

    // Track active trade lines
    const tradePriceLines = useRef(new Map()); // tradeId -> priceLine
    const tradeExpiryLines = useRef(new Map()); // tradeId -> timeLine

    useEffect(() => {
        if (!chartContainerRef.current) return;

        chartContainerRef.current.innerHTML = '';

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: textColor,
            },
            grid: {
                vertLines: { color: showGrid ? gridColor : 'transparent' },
                horzLines: { color: showGrid ? gridColor : 'transparent' },
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    labelBackgroundColor: '#3CB371',
                    style: 0, // Solid
                    width: 1,
                    color: 'rgba(255, 255, 255, 0.2)',
                    labelVisible: true,
                },
                horzLine: {
                    labelBackgroundColor: '#3CB371',
                    style: 0,
                    width: 1,
                    color: 'rgba(255, 255, 255, 0.2)',
                    labelVisible: true,
                },
            },
            timeScale: {
                borderColor: gridColor,
                timeVisible: true,
                secondsVisible: timeframe === '1s' || chartType === 'line',
                shiftVisibleRangeOnNewBar: true,
                handleScroll: true,
                handleScale: true,
            },
            rightPriceScale: {
                borderColor: gridColor,
                autoScale: true,
                alignLabels: true,
            },
        });

        chart.timeScale().applyOptions({
            barSpacing: timeframe === '1s' ? 12 : 6,
            minBarSpacing: 0.5,
        });

        // Setup series based on type
        if (chartType === 'candles') {
            const candlestickSeries = chart.addSeries(CandlestickSeries, {
                upColor: upColor,
                downColor: downColor,
                borderVisible: false,
                wickUpColor: upColor,
                wickDownColor: downColor,
                priceFormat: {
                    type: 'price',
                    precision: 4,
                    minMove: 0.0001,
                },
            });
            seriesRef.current = candlestickSeries;
        } else {
            const areaSeries = chart.addSeries(AreaSeries, {
                lineColor: '#3CB371',
                topColor: 'rgba(60, 179, 113, 0.4)',
                bottomColor: 'rgba(60, 179, 113, 0.0)',
                lineWidth: 3,
                priceFormat: {
                    type: 'price',
                    precision: 4,
                    minMove: 0.0001,
                },
            });
            seriesRef.current = areaSeries;
        }

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

        fetchKlines(timeframe).then(data => {
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
            }
            setIsLoading(false);
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
    }, [theme, fetchKlines, textColor, gridColor, upColor, downColor, timeframe, symbol, chartType, showGrid]);

    // Handle Fullscreen Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

    // Live Trade Markers & Price Lines
    useEffect(() => {
        if (!seriesRef.current || !chartRef.current) return;

        const updateMarkers = () => {
            const currentSeries = seriesRef.current;
            const currentChart = chartRef.current;
            if (!currentSeries || !currentChart) return;

            const currentTradeIds = new Set(activeTrades.map(t => String(t.id)));

            // Remove price lines for closed trades
            for (const [id, line] of tradePriceLines.current.entries()) {
                if (!currentTradeIds.has(id)) {
                    if (typeof currentSeries.removePriceLine === 'function') {
                        try {
                            currentSeries.removePriceLine(line);
                        } catch (e) { }
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

                // Add Price Line
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

                // Entry Marker
                markers.push({
                    time: Math.floor(startTime / 1000),
                    position: isCall ? 'belowBar' : 'aboveBar',
                    color: isCall ? '#3CB371' : '#FF4444',
                    shape: isCall ? 'arrowUp' : 'arrowDown',
                    text: `${trade.amount} • ENTRY`,
                    size: 1,
                });

                // Live Bubble Placeholder (at Current Time)
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
                    currentSeries.setMarkers(markers);
                } catch (e) { }
            }
        };

        updateMarkers();
        const interval = setInterval(updateMarkers, 1000);
        return () => clearInterval(interval);
    }, [activeTrades, currentPrice, chartType]);

    useEffect(() => {
        if (!currentPrice || !seriesRef.current) return;
        const now = Math.floor(Date.now() / 1000);
        const price = parseFloat(currentPrice);

        if (timeframe === '1s' || chartType === 'line') {
            const time = timeframe === '1s' ? now : Math.floor(now / 5) * 5;
            if (chartType === 'candles') {
                if (!current1sCandle.current) {
                    current1sCandle.current = { time, open: price, high: price, low: price, close: price };
                } else if (time > current1sCandle.current.time) {
                    seriesRef.current.update(current1sCandle.current);
                    current1sCandle.current = { time, open: current1sCandle.current.close, high: price, low: price, close: price };
                } else {
                    current1sCandle.current.high = Math.max(current1sCandle.current.high, price);
                    current1sCandle.current.low = Math.min(current1sCandle.current.low, price);
                    current1sCandle.current.close = price;
                }
                seriesRef.current.update(current1sCandle.current);
            } else {
                seriesRef.current.update({ time, value: price });
            }
        } else {
            seriesRef.current.update({ time: Math.floor(now / 60) * 60, close: price });
        }
    }, [currentPrice, timeframe, chartType]);

    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [tokens, setTokens] = useState(() => {
        const saved = JSON.parse(localStorage.getItem('15market_listed_tokens') || '[]');
        return saved.length > 0 ? saved : [
            { id: 'eth', symbol: 'ETH', name: 'Ethereum' },
            { id: 'btc', symbol: 'BTC', name: 'Bitcoin' },
            { id: 'sol', symbol: 'SOL', name: 'Solana' },
        ];
    });

    const tradeResults = useMemo(() => {
        return activeTrades.map(trade => {
            const entryPrice = parseFloat(trade.entryPrice);
            const spotPrice = parseFloat(currentPrice);
            const isCall = trade.direction === "UP" || trade.direction === "buy";
            const won = isCall ? spotPrice > entryPrice : spotPrice < entryPrice;
            const diff = Math.abs(spotPrice - entryPrice).toFixed(4);
            return { id: trade.id, won, diff, amount: trade.amount };
        });
    }, [activeTrades, currentPrice]);

    const toggleFullscreen = () => {
        if (!isFullscreen) {
            const elem = chartContainerRef.current.parentElement.parentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            setIsFullscreen(false);
        }
    };

    return (
        <div className={`relative w-full h-full ${isFullscreen ? 'fixed inset-0 z-[9999] bg-[#0d0d0d]' : ''}`} style={{ backgroundColor: isDark ? '#0d0d0d' : '#FFF8E7', borderRadius: isFullscreen ? '0' : 'inherit', minHeight: isFullscreen ? '100vh' : '220px' }}>
            {/* Branded Background Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <img src="/logo.png" alt="15market" style={{
                    width: '65%',
                    opacity: isDark ? 0.05 : 0.04,
                    filter: isDark ? 'grayscale(1) brightness(0.8)' : 'grayscale(1) brightness(0.05)',
                    mixBlendMode: isDark ? 'screen' : 'multiply'
                }} />
            </div>

            <div className="absolute inset-0 overflow-hidden rounded-[inherit] z-10">
                <div ref={chartContainerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
            </div>

            {/* LIVE RESULTS FLOATING OVERLAY */}
            <div className="absolute top-24 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {tradeResults.map((result) => (
                        <motion.div
                            key={result.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className={`px-3 py-1.5 rounded-xl border backdrop-blur-md flex items-center gap-2 shadow-xl ${result.won ? 'bg-[#3CB371]/20 border-[#3CB371]/30' : 'bg-[#FF4444]/20 border-[#FF4444]/30'
                                }`}
                        >
                            <div className={`w-2 h-2 rounded-full animate-pulse ${result.won ? 'bg-[#3CB371]' : 'bg-[#FF4444]'}`} />
                            <span className="text-[10px] font-black uppercase text-white tracking-widest">
                                {result.won ? `+$${(result.amount * 1.95).toFixed(2)}` : `-$${result.amount}`}
                            </span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="absolute top-0 left-0 right-0 z-30 p-2 lg:p-4 pointer-events-none">
                <div className="flex flex-wrap items-center gap-2 lg:gap-4 pointer-events-auto">
                    {/* Timeframe Selector */}
                    <div className="flex items-center bg-black/60 backdrop-blur-2xl border border-white/10 rounded-xl overflow-hidden p-0.5 shadow-2xl">
                        {['1s', '1m', '1h', 'D'].map(tf => (
                            <button key={tf} onClick={() => setTimeframe(tf)} className={`px-2 lg:px-4 py-1.5 text-[8px] lg:text-[10px] font-black tracking-widest transition-all rounded-lg ${timeframe === tf ? 'bg-[#3CB371] text-white' : 'text-white/40 hover:text-white/80 hover:bg-white/5'}`}>{tf}</button>
                        ))}
                    </div>

                    {/* CHART TYPE TOGGLE - Expert Options Style */}
                    <div className="flex items-center bg-black/60 backdrop-blur-2xl border border-white/10 rounded-xl overflow-hidden p-0.5 shadow-2xl">
                        <button
                            onClick={() => setChartType('line')}
                            className={`p-1.5 transition-all rounded-lg ${chartType === 'line' ? 'bg-[#3CB371] text-white' : 'text-white/40 hover:text-white'}`}
                        >
                            <TrendingUp size={14} />
                        </button>
                        <button
                            onClick={() => setChartType('candles')}
                            className={`p-1.5 transition-all rounded-lg ${chartType === 'candles' ? 'bg-[#3CB371] text-white' : 'text-white/40 hover:text-white'}`}
                        >
                            <BarChart3 size={14} />
                        </button>
                    </div>

                    <div className="ml-auto flex items-center gap-2 relative">
                        <div className="relative">
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className={`p-2 bg-black/60 border border-white/10 rounded-xl transition-all shadow-2xl pointer-events-auto ${showSettings ? 'text-[#3CB371] border-[#3CB371]/50' : 'text-white/60 hover:text-white'}`}
                            >
                                <Settings size={16} />
                            </button>

                            <AnimatePresence>
                                {showSettings && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                        className="absolute top-12 right-0 w-48 bg-[#0a0a0a]/95 backdrop-blur-3xl border border-white/10 rounded-2xl p-2 shadow-2xl z-[110] flex flex-col gap-1 pointer-events-auto"
                                    >
                                        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/30 border-b border-white/5 mb-1">Chart Settings</div>
                                        <button
                                            onClick={() => { setShowGrid(!showGrid); setShowSettings(false); }}
                                            className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-white/80 hover:text-white"
                                        >
                                            <span className="text-[10px] font-black uppercase tracking-widest">Show Grid</span>
                                            <div className={`w-8 h-4 rounded-full relative transition-all ${showGrid ? 'bg-[#3CB371]' : 'bg-white/10'}`}>
                                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-all ${showGrid ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => { setChartType(chartType === 'candles' ? 'line' : 'candles'); setShowSettings(false); }}
                                            className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-white/80 hover:text-white"
                                        >
                                            <span className="text-[10px] font-black uppercase tracking-widest">Candles</span>
                                            <div className={`w-8 h-4 rounded-full relative transition-all ${chartType === 'candles' ? 'bg-[#3CB371]' : 'bg-white/10'}`}>
                                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-all ${chartType === 'candles' ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </div>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <button
                            onClick={toggleFullscreen}
                            className="p-2 bg-black/60 border border-white/10 rounded-xl text-white/60 hover:text-white transition-all shadow-2xl pointer-events-auto"
                        >
                            <Maximize2 size={16} />
                        </button>
                    </div>
                </div>

                <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2 lg:gap-4 px-1">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1 rounded-lg transition-all border border-transparent hover:border-white/10 pointer-events-auto group" onClick={() => setIsSelectorOpen(!isSelectorOpen)}>
                            <h2 className="text-[14px] lg:text-lg font-black text-white tracking-widest uppercase flex items-center gap-2">{symbol.replace('USDT', '')}</h2>
                            <ChevronDown size={14} className={`text-[#3CB371] transition-transform duration-300 ${isSelectorOpen ? 'rotate-180' : ''}`} />
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                    {isSelectorOpen && (
                        <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute top-16 left-4 z-[100] w-56 bg-[#0a0a0a]/95 backdrop-blur-3xl border border-white/10 rounded-2xl p-2 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] flex flex-col gap-1 pointer-events-auto">
                            {tokens.map(t => (
                                <button key={t.id} onClick={() => { setActiveMarket(t); setIsSelectorOpen(false); }} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${activeMarket?.id === t.id ? 'bg-[#3CB371] text-white' : 'hover:bg-white/5 text-white/40 hover:text-white'}`}>
                                    <div className="flex flex-col items-start"><span className="text-xs font-black uppercase tracking-widest">{t.symbol}</span><span className="text-[8px] opacity-60 font-medium">{t.name || 'Crypto'}</span></div>
                                    {activeMarket?.id === t.id && <Zap size={10} className="fill-current text-white animate-pulse" />}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
