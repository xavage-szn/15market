// src/components/SOLSecondChart.jsx — 100% FIXED & WORKING
import React, { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries } from "lightweight-charts";

export default function SOLSecondChart({ onPriceUpdate }) {
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const candleSeriesRef = useRef();
    const wsRef = useRef();

    useEffect(() => {
        // Create chart
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: "#0f172a" },
                textColor: "#e2e8f0",
                attributionLogo: false,
            },
            grid: {
                vertLines: { color: "#1e293b" },
                horzLines: { color: "#1e293b" },
            },
            width: chartContainerRef.current.clientWidth,
            height: 500,
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                borderColor: "#334155",
            },
            rightPriceScale: {
                borderColor: "#334155",
            },
            crosshair: {
                mode: 1,
            },
        });
        chartRef.current = chart;

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: "#6366f1",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#6366f1",
            wickDownColor: "#ef4444",
        });
        candleSeriesRef.current = candleSeries;

        // Binance 1-second kline WebSocket
        const ws = new WebSocket("wss://stream.binance.com:9443/ws/solusdt@kline_1s");
        wsRef.current = ws;

        let currentCandle = null;

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const k = data.k;

            const candle = {
                time: Math.floor(k.t / 1000),
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
            };

            // Update live price in parent
            if (onPriceUpdate) {
                onPriceUpdate(parseFloat(k.c).toFixed(2));
            }

            if (k.x) {
                // Candle closed — push it
                candleSeries.update(candle);

                // Start new candle for next second
                currentCandle = {
                    time: candle.time + 1,
                    open: candle.close,
                    high: candle.close,
                    low: candle.close,
                    close: candle.close,
                };
            } else {
                // Live updating candle
                currentCandle = candle;
            }

            // Always show the current (live or closed) candle
            candleSeries.update(currentCandle);
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
            console.log("Binance WebSocket closed");
        };

        // Handle resize
        const handleResize = () => {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        };
        window.addEventListener("resize", handleResize);

        // Cleanup everything
        return () => {
            window.removeEventListener("resize", handleResize);
            if (wsRef.current) {
                wsRef.current.close();
            }
            chart.remove();
        };
    }, [onPriceUpdate]);

    return (
        <div ref={chartContainerRef} className="w-full rounded-2xl overflow-hidden shadow-2xl" />
    );
}
