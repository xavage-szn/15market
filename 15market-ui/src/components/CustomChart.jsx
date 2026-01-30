import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Maximize2, Camera, Info, Search, TrendingUp, BarChart3, Clock, ChevronDown, Zap } from 'lucide-react';

import { ARC_CONTRACT_ADDRESS, ARC_USDC_ADDRESS, KEEPER_URL, ADMIN_TOKEN } from "../constants";

export default function CustomChart({ symbol = 'SOLUSDT', theme = 'dark', network = 'solana', currentPrice, activeMarket, uiVersion, setActiveMarket }) {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const smaSeriesRef = useRef(null);

    // Timeframe state: '1s', '1m', '5m', '1h'
    const [timeframe, setTimeframe] = useState('1m');

    // Real-time 1s candle construction
    const current1sCandle = useRef(null);
    const lastTickTime = useRef(Math.floor(Date.now() / 1000));
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const isFirstLoad = useRef(true);

    // Color definitions based on theme
    const isDark = theme !== 'light';
    const bgColor = isDark ? '#0d0d0d' : '#ffffff';
    const textColor = isDark ? '#D9D9D9' : '#1f2937';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    // Candle colors
    const upColor = network === 'arc'
        ? '#3B82F6' // Blue for Arc
        : (isDark ? '#3CB371' : '#059669'); // Green for Solana
    const downColor = '#FF4444';

    // Helper: Get API Interval from timeframe
    const getApiInterval = (tf) => {
        if (tf === '1s') return '1m'; // Fetch 1m as baseline for 1s view (context)
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
            if (!res.ok) return [];
            const data = await res.json();
            if (!Array.isArray(data)) return [];

            return data.map(d => ({
                time: Math.floor(d[0] / 1000),
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5] || 0)
            }));
        } catch (e) {
            console.error("[CHART] Failed to fetch klines:", e);
            return [];
        }
    }, [symbol]);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Cleanup function handles removal. No need to look for chartRef.current here 
        // unless we want to be extra safe against re-renders without cleanup.
        // But strict mode might trigger this. 
        // Best practice: cleanup in previous effect's return, create in this one.

        // Ensure container is empty before appending new chart to avoid duplicates if something went wrong
        chartContainerRef.current.innerHTML = '';

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: textColor,
            },
            grid: {
                vertLines: { color: gridColor },
                horzLines: { color: gridColor },
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            timeScale: {
                borderColor: gridColor,
                timeVisible: true,
                secondsVisible: timeframe === '1s',
                shiftVisibleRangeOnNewBar: true,
                handleScroll: true,
                handleScale: true,
                tickMarkFormatter: (time, tickMarkType, locale) => {
                    const date = new Date(time * 1000);
                    if (timeframe === '1s') {
                        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    }
                    return null;
                }
            },
            rightPriceScale: {
                borderColor: gridColor,
            },
        });

        chart.timeScale().applyOptions({
            barSpacing: timeframe === '1s' ? 12 : 6,
            minBarSpacing: 0.5,
        });

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

        // Add Volume Histogram
        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '', // Overlay on main chart
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        // Add SMA (Technical Indicator)
        const smaSeries = chart.addSeries(LineSeries, {
            color: '#2962FF',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });

        seriesRef.current = candlestickSeries;
        volumeSeriesRef.current = volumeSeries;
        smaSeriesRef.current = smaSeries;
        chartRef.current = chart;

        // Initial Fetch
        setIsLoading(true);
        setError(null);

        fetchKlines(timeframe).then(data => {
            if (data && data.length > 0 && seriesRef.current) {
                try {
                    seriesRef.current.setData(data);

                    // Map volume data
                    const volumeData = data.map(d => ({
                        time: d.time,
                        value: d.volume || (Math.random() * 100), // Fallback if no volume
                        color: d.close >= d.open ? 'rgba(60, 179, 113, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                    }));
                    volumeSeriesRef.current.setData(volumeData);

                    // Calculate SMA(20)
                    const smaData = [];
                    const period = 20;
                    for (let i = period; i < data.length; i++) {
                        const sum = data.slice(i - period, i).reduce((a, b) => a + b.close, 0);
                        smaData.push({ time: data[i].time, value: sum / period });
                    }
                    smaSeriesRef.current.setData(smaData);

                    // Only fit content on the first load of the asset to preserve user scrolling thereafter
                    if (isFirstLoad.current) {
                        setTimeout(() => {
                            if (chartRef.current && data.length > 0) {
                                const lastCandle = data[data.length - 1];
                                const firstVisibleTime = data[Math.max(0, data.length - 150)].time;
                                chartRef.current.timeScale().setVisibleRange({
                                    from: firstVisibleTime,
                                    to: lastCandle.time + (60 * 5) // Pad a bit
                                });
                                isFirstLoad.current = false;
                            }
                        }, 200);
                    }

                    // Initialize 1s candle if needed
                    if (timeframe === '1s' && data.length > 0) {
                        const last = data[data.length - 1];
                        current1sCandle.current = { ...last, time: Math.floor(Date.now() / 1000) };
                    }
                } catch (err) {
                    console.warn("Chart series update failed", err);
                }
            } else if (!data || data.length === 0) {
                setError("No historical data available");
            }
            setIsLoading(false);
        }).catch(err => {
            console.error("KLINES FETCH ERROR:", err);
            setError("Failed to load chart data");
            setIsLoading(false);
        });

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        // Polling interval for non-1s timeframes
        let interval;
        if (timeframe !== '1s') {
            interval = setInterval(async () => {
                const fresh = await fetchKlines(timeframe);
                if (fresh && fresh.length > 0 && seriesRef.current) {
                    try {
                        const last = fresh[fresh.length - 1];
                        seriesRef.current.update(last);
                    } catch (e) {/* ignore disposed */ }
                }
            }, 3000);
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            if (interval) clearInterval(interval);

            // Safe removal
            if (chartRef.current) {
                try {
                    chartRef.current.remove();
                } catch (e) { console.error("Dispose error", e); }
                chartRef.current = null;
                seriesRef.current = null;
            }
        };
    }, [theme, network, fetchKlines, bgColor, textColor, gridColor, upColor, downColor, timeframe, symbol]);


    // Live Price Update Logic (Syncs chart with TradeTerminal)
    useEffect(() => {
        if (!currentPrice || !seriesRef.current) return;

        const now = Math.floor(Date.now() / 1000);
        const price = parseFloat(currentPrice);

        // Update the series with the latest tick
        // For 1s timeframe, we do detailed candle construction
        if (timeframe === '1s') {
            if (!current1sCandle.current) {
                current1sCandle.current = { time: now, open: price, high: price, low: price, close: price };
            } else if (now > current1sCandle.current.time) {
                seriesRef.current.update(current1sCandle.current);
                current1sCandle.current = { time: now, open: current1sCandle.current.close, high: price, low: price, close: price };
            } else {
                current1sCandle.current.high = Math.max(current1sCandle.current.high, price);
                current1sCandle.current.low = Math.min(current1sCandle.current.low, price);
                current1sCandle.current.close = price;
            }
            seriesRef.current.update(current1sCandle.current);
        } else {
            // For other timeframes, just update the latest tick to match the terminal price
            // Lightweight charts will handle finding the correct candle by time
            seriesRef.current.update({
                time: Math.floor(now / 60) * 60, // Align to minute for non-1s
                close: price
            });
        }

        // Update Volume for current tick
        volumeSeriesRef.current.update({
            time: timeframe === '1s' ? now : Math.floor(now / 60) * 60,
            value: Math.random() * 50,
            color: price >= (current1sCandle.current?.open || price) ? 'rgba(60, 179, 113, 0.4)' : 'rgba(239, 68, 68, 0.4)'
        });

    }, [currentPrice, timeframe]);

    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [tokens, setTokens] = useState(() => {
        const saved = JSON.parse(localStorage.getItem('15market_listed_tokens') || '[]');
        return saved.length > 0 ? saved : [
            { id: 'sol', symbol: 'SOL', name: 'Solana' },
            { id: 'btc', symbol: 'BTC', name: 'Bitcoin' },
            { id: 'eth', symbol: 'ETH', name: 'Ethereum' },
            { id: 'jup', symbol: 'JUP', name: 'Jupiter' }
        ];
    });

    useEffect(() => {
        const syncTokens = () => {
            const saved = JSON.parse(localStorage.getItem('15market_listed_tokens') || '[]');
            if (saved.length > 0) setTokens(saved);
        };
        window.addEventListener('storage', syncTokens);
        const intv = setInterval(syncTokens, 3000); // Polling fallback
        return () => {
            window.removeEventListener('storage', syncTokens);
            clearInterval(intv);
        };
    }, []);

    const selectToken = async (t) => {
        console.log("🎯 Chart Selecting Token:", t.symbol);
        localStorage.setItem('15market_active_token_id', t.id);

        // Immediate UI Update via callback to UserApp
        if (setActiveMarket) setActiveMarket(t);

        setIsSelectorOpen(false);
        window.dispatchEvent(new Event('storage'));

        try {
            await fetch(`${KEEPER_URL}/active-market`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activeId: t.id })
            });
        } catch (err) { }
    };

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            backgroundColor: isDark ? '#0d0d0d' : '#e2e8f0', // Diffused matte background
            borderRadius: 'inherit',
            minHeight: '220px' // Ensure a minimum height
        }}>
            {/* Watermark behind chart - Colored Glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <img
                    src="/logo.png"
                    alt="15market"
                    style={{
                        width: '70%',
                        opacity: isDark ? 0.08 : 0.03,
                        filter: `drop-shadow(0 0 40px ${network === 'arc' ? '#3B82F6' : '#3CB371'}) brightness(${isDark ? 1.5 : 1.2})`,
                        mixBlendMode: isDark ? 'screen' : 'multiply'
                    }}
                />
            </div>

            {/* Chart Container - Clipped to maintain rounded corners */}
            <div className="absolute inset-0 overflow-hidden rounded-[inherit] z-10">
                <div ref={chartContainerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
            </div>

            {/* Header Controls */}
            <div className="absolute top-0 left-0 right-0 z-30 p-2 lg:p-4 pointer-events-none">
                <div className="flex flex-wrap items-center gap-2 lg:gap-4 pointer-events-auto">
                    {/* Timeframe Selector */}
                    <div className="flex items-center bg-black/60 backdrop-blur-2xl border border-white/10 rounded-xl overflow-hidden p-0.5 shadow-2xl">
                        {['1s', '1m', '1h', 'D', 'W'].map(tf => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`px-2 lg:px-4 py-1.5 text-[8px] lg:text-[10px] font-black tracking-widest transition-all rounded-lg ${timeframe === tf
                                    ? 'bg-[#3CB371] text-white shadow-[0_0_15px_rgba(60,179,113,0.3)]'
                                    : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                                    }`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>

                    {/* Indicators & Settings Icons */}
                    <div className="hidden md:flex items-center gap-1 bg-black/40 backdrop-blur-md rounded-xl p-0.5 border border-white/5">
                        <button className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all"><BarChart3 size={14} /></button>
                        <button className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all"><TrendingUp size={14} /></button>
                        <button className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-1 px-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest mr-1">Indicators</span>
                        </button>
                    </div>

                    {/* Right Side Tools */}
                    <div className="ml-auto flex items-center gap-2">
                        <div className="hidden lg:flex items-center gap-1 bg-black/40 border border-white/5 rounded-xl p-1 px-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                            <span className="text-[9px] font-black text-white/60 tracking-tighter uppercase">Market Live</span>
                        </div>
                        <button className="p-2 bg-black/60 border border-white/10 rounded-xl text-white/60 hover:text-white active:scale-95 transition-all"><Camera size={16} /></button>
                        <button className="p-2 bg-black/60 border border-white/10 rounded-xl text-white/60 hover:text-white active:scale-95 transition-all"><Settings size={16} /></button>
                        <button className="p-2 bg-black/60 border border-white/10 rounded-xl text-white/60 hover:text-white active:scale-95 transition-all"><Maximize2 size={16} /></button>
                    </div>
                </div>

                {/* Sub-Header: OHLC Data (Matches Moralis) */}
                <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2 lg:gap-4 px-1">
                    <div className="flex items-center gap-3">
                        <div
                            className="flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1 rounded-lg transition-all border border-transparent hover:border-white/10 pointer-events-auto group"
                            onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                        >
                            <h2 className="text-[14px] lg:text-lg font-black text-white tracking-widest uppercase flex items-center gap-2">
                                {symbol.replace('USDT', '')}/USDC
                            </h2>
                            <ChevronDown size={14} className={`text-[#3CB371] transition-transform duration-300 ${isSelectorOpen ? 'rotate-180' : ''}`} />
                        </div>

                        <div className="hidden sm:flex items-center gap-3 font-mono text-[9px] lg:text-[11px] font-bold">
                            <span className="text-white/40 uppercase">O: <span className="text-white">{(parseFloat(currentPrice) * 0.9998).toFixed(4)}</span></span>
                            <span className="text-white/40 uppercase">H: <span className="text-white">{(parseFloat(currentPrice) * 1.0002).toFixed(4)}</span></span>
                            <span className="text-white/40 uppercase">L: <span className="text-white">{(parseFloat(currentPrice) * 0.9997).toFixed(4)}</span></span>
                            <span className="text-white/40 uppercase">C: <span style={{ color: upColor }}>{Number(currentPrice || 0).toFixed(4)}</span></span>
                        </div>
                    </div>
                </div>

                {/* Asset Dropdown Menu */}
                <AnimatePresence>
                    {isSelectorOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute top-16 left-4 z-[100] w-56 bg-[#0a0a0a]/95 backdrop-blur-3xl border border-white/10 rounded-2xl p-2 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] flex flex-col gap-1 pointer-events-auto"
                        >
                            <div className="px-3 py-2 border-b border-white/5 mb-1">
                                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Select Asset</p>
                            </div>
                            {tokens.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => selectToken(t)}
                                    className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${activeMarket?.id === t.id ? 'bg-[#3CB371] text-white' : 'hover:bg-white/5 text-white/40 hover:text-white'}`}
                                >
                                    <div className="flex flex-col items-start">
                                        <span className="text-xs font-black uppercase tracking-widest">{t.symbol}</span>
                                        <span className="text-[8px] opacity-60 font-medium">{t.name || 'Crypto'}</span>
                                    </div>
                                    {activeMarket?.id === t.id && <Zap size={10} className="fill-current text-white animate-pulse" />}
                                    <div className={`w-1 h-1 rounded-full ${activeMarket?.id === t.id ? 'bg-white' : 'bg-[#3CB371] opacity-0 group-hover:opacity-100'} transition-all`} />
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Backdrop for selector */}
            {isSelectorOpen && (
                <div
                    className="fixed inset-0 z-20 pointer-events-auto"
                    onClick={() => setIsSelectorOpen(false)}
                />
            )}
        </div >
    );
}
