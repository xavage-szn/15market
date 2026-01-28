import { useEffect, useRef } from "react";

export default function ChartCard({ symbol = "BTCUSDT" }) {
const containerRef = useRef(null);

useEffect(() => {
// Prevent widget duplicate loads
if (containerRef.current?.childElementCount === 0) {
const script = document.createElement("script");
script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
script.type = "text/javascript";
script.async = true;
script.innerHTML = JSON.stringify({
symbol: `BINANCE:${symbol}`,
width: "100%",
height: "100%",
locale: "en",
dateRange: "1D",
colorTheme: "dark",
trendLineColor: "rgba(255,255,255,0.7)",
underLineColor: "rgba(255,255,255,0.1)",
autosize: true,
});

containerRef.current.appendChild(script);
}
}, [symbol]);

return (
<div className="backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-xl p-3 w-[280px] h-[200px]">
<div className="tradingview-widget-container w-full h-full" ref={containerRef}></div>
</div>
);
}
