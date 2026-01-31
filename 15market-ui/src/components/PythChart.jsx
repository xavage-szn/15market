import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';

const PYTH_BENCHMARKS_API = 'https://benchmarks.pyth.network/v1/shimmer/tradingview';
const SYMBOL = 'Crypto.SOL/USD';

export default function PythChart({ onPriceUpdate }) {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const [currentPrice, setCurrentPrice] = useState(null);
    const wsRef = useRef(null);
    const lastCandleRef = useRef(null); // Keep track of the live candle

    // Initial Setup
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#000000' },
                textColor: 'rgba(255, 255, 255, 0.5)',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            crosshair: {
                vertLine: {
                    color: '#3CB371',
                    width: 1,
                    style: 3,
                    labelBackgroundColor: '#3CB371',
                },
                horzLine: {
                    color: '#3CB371',
                    width: 1,
                    style: 3,
                    labelBackgroundColor: '#3CB371',
                },
            },
        });

        const newSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#6366f1',
            downColor: '#FF7F50',
            borderVisible: false,
            wickUpColor: '#6366f1',
            wickDownColor: '#FF7F50',
        });

        chartRef.current = chart;
        seriesRef.current = newSeries;

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []);

    // Data Fetching & WebSocket
    useEffect(() => {
        if (!seriesRef.current) return;

        let active = true;

        const initData = async () => {
            try {
                // Fetch recent history from Binance for consistency (1m candles for context)
                const res = await fetch("https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=1m&limit=100");
                let data = await res.json();

                if (!active) return;

                if (!Array.isArray(data)) {
                    console.warn("Binance API returned non-array:", data);
                    // Do not return, just use empty to allow WS to take over if possible
                    data = [];
                }

                const candles = data.map(d => ({
                    time: d[0] / 1000,
                    open: parseFloat(d[1]),
                    high: parseFloat(d[2]),
                    low: parseFloat(d[3]),
                    close: parseFloat(d[4])
                })).sort((a, b) => a.time - b.time);

                // Set initial data
                seriesRef.current.setData(candles);

                if (candles.length > 0) {
                    const last = candles[candles.length - 1];
                    setCurrentPrice(last.close);
                    lastCandleRef.current = last;
                    if (onPriceUpdate) onPriceUpdate(last.close.toFixed(4));
                }

                // Connect WebSocket for 1s updates
                // Note: Using 1s klines gives us "1 second chart" feel instantly
                const ws = new WebSocket("wss://stream.binance.com:9443/ws/solusdt@kline_1s");
                wsRef.current = ws;

                ws.onopen = () => console.log("✅ Chart WebSocket Connected");

                ws.onmessage = (event) => {
                    if (!active || !seriesRef.current) return;
                    const msg = JSON.parse(event.data);
                    const k = msg.k;

                    const open = parseFloat(k.o);
                    const high = parseFloat(k.h);
                    const low = parseFloat(k.l);
                    const close = parseFloat(k.c);
                    const time = Math.floor(k.t / 1000); // 1s Resolution

                    setCurrentPrice(close);
                    if (onPriceUpdate) onPriceUpdate(close.toFixed(4));

                    // Since we filled with 1m candles, we need to be careful. 
                    // If we just push 1s candles, the chart scale might look odd mixing 1m and 1s bars.
                    // However, users want to see "1 second responsiveness".
                    // Visual Hack: We just update the LATEST candle if it's the same minute, 
                    // OR we just push new 1s candles at the end.
                    // Let's try pushing 1s candles. It shows the micro-volatility nicely even if past is blocks.

                    const candle = { time, open, high, low, close };
                    seriesRef.current.update(candle);
                };

                ws.onerror = (e) => console.error("WS Error:", e);

            } catch (err) {
                console.error("Failed to load chart data:", err);
            }
        };

        initData();

        return () => {
            active = false;
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    return (
        <div className="relative w-full h-full rounded-[32px] overflow-hidden bg-black border border-white/5 shadow-2xl">
            <div ref={chartContainerRef} className="w-full h-full" />
        </div>
    );
}
