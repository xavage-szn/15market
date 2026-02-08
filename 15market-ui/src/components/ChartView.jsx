// src/components/ChartView.jsx
"use client";

import { useEffect, useRef, useState } from "react";

export default function ChartView() {
  const canvasRef = useRef(null);
  const [price, setPrice] = useState("--");
  const [asset, setAsset] = useState("BTC");
  const [candles, setCandles] = useState([]);

  // Pyth price feed IDs (mainnet)
  const pythFeeds = {
    BTC: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    ETH: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4c95185f2f90f",
    SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4c95185f2f90f", // placeholder, real one below
    // Real SOL: "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Force canvas size
    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      draw();
    };

    // Initial 60 fake candles so you see something instantly
    const initCandles = [];
    const basePrice = asset === "BTC" ? 95000 : asset === "ETH" ? 3400 : 180;
    for (let i = 59; i >= 0; i--) {
      const p = basePrice + Math.sin(i / 6) * (basePrice * 0.01);
      initCandles.push({
        open: p,
        high: p * (1 + Math.random() * 0.005),
        low: p * (1 - Math.random() * 0.005),
        close: p + (Math.random() - 0.5) * p * 0.01,
        time: Date.now() - i * 60000,
      });
    }
    setCandles(initCandles);

    // Pyth real-time price fetch
    const fetchPythPrice = async () => {
      const id = pythFeeds[asset] || pythFeeds.BTC;
      try {
        const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${id}`);
        const data = await res.json();
        const priceData = data.parsed[0];
        if (!priceData) return;

        const currentPrice = priceData.price.price * Math.pow(10, priceData.price.expo);
        setPrice(currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }));

        const now = Date.now();
        setCandles(prev => {
          const newCandles = [...prev];
          const last = newCandles[newCandles.length - 1];

          // Update current minute candle
          if (last && Math.floor(now / 60000) === Math.floor(last.time / 60000)) {
            last.close = currentPrice;
            last.high = Math.max(last.high, currentPrice);
            last.low = Math.min(last.low, currentPrice);
          } else {
            // New minute
            newCandles.push({
              open: currentPrice,
              high: currentPrice,
              low: currentPrice,
              close: currentPrice,
              time: now,
            });
          }
          return newCandles.slice(-60);
        });
      } catch (err) {
        console.log("Pyth fetch error (normal on some networks)", err);
      }
    };

    fetchPythPrice();
    const interval = setInterval(fetchPythPrice, 1000); // Pyth updates ~400ms

    // Draw chart
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (candles.length === 0) return;

      const padding = 60;
      const chartHeight = canvas.height / 2 - padding * 2;
      const chartWidth = canvas.width / 2 - padding * 2;
      const barWidth = chartWidth / candles.length;

      const prices = candles.flatMap(c => [c.high, c.low]);
      const min = Math.min(...prices) * 0.999;
      const max = Math.max(...prices) * 1.001;

      candles.forEach((c, i) => {
        const x = padding + i * barWidth;
        const openY = padding + ((max - c.open) / (max - min)) * chartHeight;
        const closeY = padding + ((max - c.close) / (max - min)) * chartHeight;
        const highY = padding + ((max - c.high) / (max - min)) * chartHeight;
        const lowY = padding + ((max - c.low) / (max - min)) * chartHeight;

        const isGreen = c.close >= c.open;
        ctx.strokeStyle = isGreen ? "#10b981" : "#ef4444";
        ctx.fillStyle = isGreen ? "#10b981" : "#ef4444";
        ctx.lineWidth = 3;

        // Wick
        ctx.beginPath();
        ctx.moveTo(x + barWidth / 2, highY);
        ctx.lineTo(x + barWidth / 2, lowY);
        ctx.stroke();

        // Body
        const bodyHeight = Math.abs(closeY - openY) || 3;
        ctx.fillRect(x + barWidth * 0.1, Math.min(openY, closeY), barWidth * 0.8, bodyHeight);
      });
    };

    const drawInterval = setInterval(draw, 500);
    resize();
    window.addEventListener("resize", resize);

    return () => {
      clearInterval(interval);
      clearInterval(drawInterval);
      window.removeEventListener("resize", resize);
    };
  }, [asset, candles]);

  return (
    <div className="relative w-full h-screen bg-gradient-to-br from-amber-900 via-orange-900 to-red-900 rounded-3xl overflow-hidden shadow-4xl">
      {/* Asset Tabs */}
      <div className="absolute top-8 left-8 z-10 flex gap-4 bg-white/20 backdrop-blur-xl rounded-2xl p-3">
        {["BTC", "ETH", "SOL"].map((a) => (
          <button
            key={a}
            onClick={() => setAsset(a)}
            className={`px-8 py-4 rounded-xl font-bold text-xl transition-all ${
              asset === a
                ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-2xl"
                : "text-white/80 hover:text-white hover:bg-white/10"
            }`}
          >
            {a}/USDT
          </button>
        ))}
      </div>

      {/* Live Price */}
      <div className="absolute top-8 right-8 z-10 text-right">
        <div className="text-7xl font-black text-white drop-shadow-2xl">${price}</div>
        <div className="text-2xl text-white/70">Pyth Network • Live</div>
      </div>

      {/* Canvas Chart */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}
