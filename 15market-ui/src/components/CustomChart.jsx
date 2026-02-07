import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Maximize2, Camera, Info, Search, TrendingUp, BarChart3, Clock, ChevronDown, Zap } from 'lucide-react';

import { KEEPER_URL_ARC } from "../constants";

export default function CustomChart({ symbol = 'SOLUSDT', theme = 'dark', currentPrice, activeMarket, setActiveMarket }) {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const smaSeriesRef = useRef(null);

    const [timeframe, setTimeframe] = useState('1m');
    const current1sCandle = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const isFirstLoad = useRef(true);

    const isDark = theme !== 'light';
    const textColor = isDark ? '#D9D9D9' : '#1f2937';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    const upColor = '#3B82F6'; // Arc Blue
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

        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

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

        setIsLoading(true);

        fetchKlines(timeframe).then(data => {
            if (data && data.length > 0 && seriesRef.current) {
                seriesRef.current.setData(data);
                const volumeData = data.map(d => ({
                    time: d.time,
                    value: d.volume || (Math.random() * 100),
                    color: d.close >= d.open ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                }));
                volumeSeriesRef.current.setData(volumeData);

                const smaData = [];
                const period = 20;
                for (let i = period; i < data.length; i++) {
                    const sum = data.slice(i - period, i).reduce((a, b) => a + b.close, 0);
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
                                to: lastCandle.time + (60 * 5)
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
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        let interval;
        if (timeframe !== '1s') {
            interval = setInterval(async () => {
                const fresh = await fetchKlines(timeframe);
                if (fresh && fresh.length > 0 && seriesRef.current) {
                    seriesRef.current.update(fresh[fresh.length - 1]);
                }
            }, 3000);
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            if (interval) clearInterval(interval);
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, [theme, fetchKlines, textColor, gridColor, upColor, downColor, timeframe, symbol]);

    useEffect(() => {
        if (!currentPrice || !seriesRef.current) return;
        const now = Math.floor(Date.now() / 1000);
        const price = parseFloat(currentPrice);

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
            seriesRef.current.update({ time: Math.floor(now / 60) * 60, close: price });
        }
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

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: isDark ? '#0d0d0d' : '#e2e8f0', borderRadius: 'inherit', minHeight: '220px' }}>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <img src="/logo.png" alt="15market" style={{ width: '70%', opacity: isDark ? 0.08 : 0.03, filter: `drop-shadow(0 0 40px ${upColor}) brightness(${isDark ? 1.5 : 1.2})`, mixBlendMode: isDark ? 'screen' : 'multiply' }} />
            </div>

            <div className="absolute inset-0 overflow-hidden rounded-[inherit] z-10">
                <div ref={chartContainerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
            </div>

            <div className="absolute top-0 left-0 right-0 z-30 p-2 lg:p-4 pointer-events-none">
                <div className="flex flex-wrap items-center gap-2 lg:gap-4 pointer-events-auto">
                    <div className="flex items-center bg-black/60 backdrop-blur-2xl border border-white/10 rounded-xl overflow-hidden p-0.5 shadow-2xl">
                        {['1s', '1m', '1h', 'D', 'W'].map(tf => (
                            <button key={tf} onClick={() => setTimeframe(tf)} className={`px-2 lg:px-4 py-1.5 text-[8px] lg:text-[10px] font-black tracking-widest transition-all rounded-lg ${timeframe === tf ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'text-white/40 hover:text-white/80 hover:bg-white/5'}`}>{tf}</button>
                        ))}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <button className="p-2 bg-black/60 border border-white/10 rounded-xl text-white/60 hover:text-white active:scale-95 transition-all"><Camera size={16} /></button>
                        <button className="p-2 bg-black/60 border border-white/10 rounded-xl text-white/60 hover:text-white active:scale-95 transition-all"><Settings size={16} /></button>
                        <button className="p-2 bg-black/60 border border-white/10 rounded-xl text-white/60 hover:text-white active:scale-95 transition-all"><Maximize2 size={16} /></button>
                    </div>
                </div>

                <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2 lg:gap-4 px-1">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1 rounded-lg transition-all border border-transparent hover:border-white/10 pointer-events-auto group" onClick={() => setIsSelectorOpen(!isSelectorOpen)}>
                            <h2 className="text-[14px] lg:text-lg font-black text-white tracking-widest uppercase flex items-center gap-2">{symbol.replace('USDT', '')}/USDC</h2>
                            <ChevronDown size={14} className={`text-blue-500 transition-transform duration-300 ${isSelectorOpen ? 'rotate-180' : ''}`} />
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                    {isSelectorOpen && (
                        <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute top-16 left-4 z-[100] w-56 bg-[#0a0a0a]/95 backdrop-blur-3xl border border-white/10 rounded-2xl p-2 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] flex flex-col gap-1 pointer-events-auto">
                            <div className="px-3 py-2 border-b border-white/5 mb-1"><p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Select Asset</p></div>
                            {tokens.map(t => (
                                <button key={t.id} onClick={() => { setActiveMarket(t); setIsSelectorOpen(false); }} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${activeMarket?.id === t.id ? 'bg-blue-500 text-white' : 'hover:bg-white/5 text-white/40 hover:text-white'}`}>
                                    <div className="flex flex-col items-start"><span className="text-xs font-black uppercase tracking-widest">{t.symbol}</span><span className="text-[8px] opacity-60 font-medium">{t.name || 'Crypto'}</span></div>
                                    {activeMarket?.id === t.id && <Zap size={10} className="fill-current text-white animate-pulse" />}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {isSelectorOpen && <div className="fixed inset-0 z-20 pointer-events-auto" onClick={() => setIsSelectorOpen(false)} />}
        </div>
    );
}
