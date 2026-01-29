import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries } from 'lightweight-charts';

export default function CustomChart({ symbol = 'SOLUSDT', theme = 'dark', network = 'solana', currentPrice }) {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);

    // Timeframe state: '1s', '1m', '5m', '1h'
    const [timeframe, setTimeframe] = useState('1m');

    // Real-time 1s candle construction
    const current1sCandle = useRef(null);
    const lastTickTime = useRef(Math.floor(Date.now() / 1000));

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
            const limit = tf === '1s' ? 500 : 1000;
            console.log(`[CHART] Fetching ${limit} klines (Interval: ${apiInterval}) for ${tf} view...`);

            const res = await fetch(`/api-mexc/api/v3/klines?symbol=${symbol}&interval=${apiInterval}&limit=${limit}`);
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`MEXC API Failure: ${res.status} ${errText}`);
            }
            const data = await res.json();

            if (!Array.isArray(data)) {
                console.warn("[CHART] Invalid data format from API:", data);
                return [];
            }

            const candles = data.map(d => ({
                time: Math.floor(d[0] / 1000),
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
            }));

            candles.sort((a, b) => a.time - b.time);

            // Filter duplicates
            const uniqueCandles = [];
            const seen = new Set();
            for (const c of candles) {
                if (!seen.has(c.time)) {
                    seen.add(c.time);
                    uniqueCandles.push(c);
                }
            }

            console.log(`[CHART] Successfully loaded ${uniqueCandles.length} historical candles.`);
            return uniqueCandles;
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
                secondsVisible: false, // Show seconds if 1s?
                tickMarkFormatter: (time, tickMarkType, locale) => {
                    if (timeframe === '1s') {
                        const date = new Date(time * 1000);
                        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    }
                    return null;
                }
            },
            rightPriceScale: {
                borderColor: gridColor,
            },
        });

        if (timeframe === '1s') {
            chart.timeScale().applyOptions({
                timeVisible: true,
                secondsVisible: true,
                barSpacing: 10,
            });
        }

        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: upColor,
            downColor: downColor,
            borderVisible: false,
            wickUpColor: upColor,
            wickDownColor: downColor,
        });

        seriesRef.current = candlestickSeries;
        chartRef.current = chart;

        // Initial Fetch
        fetchKlines(timeframe).then(data => {
            if (data && data.length > 0 && seriesRef.current) {
                // Check if series is still valid (not disposed)
                try {
                    candlestickSeries.setData(data);

                    // Small delay to ensure chart geometry is calculated before fitting
                    setTimeout(() => {
                        if (chartRef.current) {
                            chartRef.current.timeScale().fitContent();
                        }
                    }, 100);

                    // Initialize 1s candle if needed
                    if (timeframe === '1s' && data.length > 0) {
                        const last = data[data.length - 1];
                        current1sCandle.current = { ...last, time: Math.floor(Date.now() / 1000) };
                    }
                } catch (err) {
                    console.warn("Chart series update failed (disposed?)", err);
                }
            }
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


    // 1s Data Compounding Logic
    useEffect(() => {
        if (timeframe !== '1s' || !currentPrice || !seriesRef.current) return;

        const now = Math.floor(Date.now() / 1000);
        const price = parseFloat(currentPrice);

        if (!current1sCandle.current) {
            // First live tick - start the candle
            current1sCandle.current = {
                time: now,
                open: price,
                high: price,
                low: price,
                close: price
            };
            seriesRef.current.update(current1sCandle.current);
            return;
        }

        // Check if we need to start a NEW 1-second candle
        if (now > current1sCandle.current.time) {
            // Push final state of previous candle before starting new one
            seriesRef.current.update(current1sCandle.current);

            // Start new candle
            current1sCandle.current = {
                time: now,
                open: current1sCandle.current.close, // Smooth transition
                high: Math.max(current1sCandle.current.close, price),
                low: Math.min(current1sCandle.current.close, price),
                close: price
            };
        } else {
            // Update current candle
            current1sCandle.current.high = Math.max(current1sCandle.current.high, price);
            current1sCandle.current.low = Math.min(current1sCandle.current.low, price);
            current1sCandle.current.close = price;
        }

        seriesRef.current.update(current1sCandle.current);

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

    const selectToken = (t) => {
        console.log("🎯 Chart Selecting Token:", t.symbol);
        localStorage.setItem('15market_active_token_id', t.id);

        // Trigger storage event for same-window detection (immediate update)
        window.dispatchEvent(new Event('storage'));

        setIsSelectorOpen(false);
    };

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            backgroundColor: isDark ? '#0d0d0d' : '#ffffff', // Use fixed bg to prevent "invisibility"
            borderRadius: 'inherit',
            minHeight: '280px' // Ensure a minimum height
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
            <div className="absolute top-2 left-2 lg:top-4 lg:left-4 z-30 flex flex-wrap items-center gap-2 pr-4">
                {/* Asset Selector Trigger */}
                <div className="relative">
                    <button
                        onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                        className="flex items-center gap-2 px-2 py-1 lg:px-4 lg:py-2 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 hover:border-[var(--primary-color)] transition-all group active:scale-95"
                    >
                        <div className={`w-3 h-3 lg:w-4 lg:h-4 rounded-full flex items-center justify-center bg-[var(--primary-color)]/20`}>
                            <span className="text-[6px] lg:text-[8px] text-[var(--primary-color)] font-black">●</span>
                        </div>
                        <span className={`text-[10px] lg:text-xs font-black uppercase tracking-widest ${isDark ? 'text-white' : 'text-white'}`}>{symbol.replace('USDT', '')}</span>
                        <span className="text-[8px] lg:text-[10px] text-white/40 group-hover:text-[var(--primary-color)] transition-colors">▼</span>
                    </button>

                    {/* Dropdown Menu */}
                    {isSelectorOpen && (
                        <div className={`absolute top-full left-0 mt-2 w-48 backdrop-blur-2xl border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 z-50 ${isDark ? 'bg-black/90 border-white/10' : 'bg-white/95 border-black/10'}`}>
                            <div className="p-2 max-h-[300px] overflow-y-scroll" style={{ overflowY: 'scroll', WebkitOverflowScrolling: 'touch' }}>
                                {tokens.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => selectToken(t)}
                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group ${t.symbol + 'USDT' === symbol ? 'bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/20' : (isDark ? 'hover:bg-white/5' : 'hover:bg-black/5') + ' border border-transparent'}`}
                                    >
                                        <div className="flex flex-col items-start">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${t.symbol + 'USDT' === symbol ? 'text-[var(--primary-color)]' : (isDark ? 'text-white' : 'text-black')}`}>{t.symbol}</span>
                                            <span className={`text-[7px] font-bold uppercase ${isDark ? 'text-white/40' : 'text-black/40'}`}>{t.name}</span>
                                        </div>
                                        {t.symbol + 'USDT' === symbol && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary-color)] shadow-[0_0_8px_var(--primary-color)]" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Timeframe Selector */}
                <div className="flex items-center bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden">
                    {['1s', '1m', '5m', '1h'].map(tf => (
                        <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={`px-2.5 lg:px-4 py-1.5 lg:py-2 text-[9px] lg:text-[10px] font-black uppercase tracking-tighter transition-all ${timeframe === tf
                                ? (network === 'arc' ? 'bg-blue-600 text-white shadow-inner' : 'bg-[#3CB371] text-white shadow-inner')
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                                }`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            {/* Backdrop for selector */}
            {isSelectorOpen && (
                <div
                    className="fixed inset-0 z-20 pointer-events-auto"
                    onClick={() => setIsSelectorOpen(false)}
                />
            )}
        </div>
    );
}
