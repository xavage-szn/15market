import React, { useEffect, useState, useRef, memo, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';

/* ─── Coral-Green LCD Jumbotron Styles ───────────────────────────────────── */
const LCD_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

  /* ── Panel Shell ── */
  .lcd-panel {
    background: #07090a;
    border-top: 2px solid #1e2b1e;
    border-bottom: 2px solid #1e2b1e;
    box-shadow:
      0 0 0 1px #111,
      inset 0 0 60px rgba(0,0,0,0.9),
      inset 0 0 120px rgba(0,0,0,0.6);
    position: relative;
    overflow: hidden;
  }

  /* Scanlines */
  .lcd-panel::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(60,179,113,0.012) 2px,
      rgba(60,179,113,0.012) 4px
    );
    pointer-events: none;
    z-index: 10;
  }

  /* Edge vignette */
  .lcd-panel::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(0,0,0,0.5) 0%,
      transparent 6%,
      transparent 94%,
      rgba(0,0,0,0.5) 100%
    );
    pointer-events: none;
    z-index: 11;
  }

  /* Light theme panel */
  .lcd-panel-light {
    background: #f0faf4;
    border-top: 2px solid #3CB371;
    border-bottom: 2px solid #3CB371;
    box-shadow:
      0 0 0 1px rgba(60,179,113,0.3),
      inset 0 0 40px rgba(60,179,113,0.04);
  }
  .lcd-panel-light::before {
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 3px,
      rgba(60,179,113,0.025) 3px,
      rgba(60,179,113,0.025) 6px
    );
  }

  /* ── Typography ── */
  .lcd-text {
    font-family: 'Share Tech Mono', 'Courier New', monospace !important;
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: none;
    font-smooth: never;
  }

  /* ── Green (WON / CALL) Glow ── */
  .lcd-green {
    color: #3dff8f;
    text-shadow:
      0 0 4px #00ff41,
      0 0 10px #3CB371,
      0 0 20px rgba(60,179,113,0.5);
  }

  /* ── Coral (LOST / PUT) Glow ── */
  .lcd-coral {
    color: #ff8a60;
    text-shadow:
      0 0 4px #FF7F50,
      0 0 10px #ff5522,
      0 0 20px rgba(255,127,80,0.5);
  }

  /* ── Amber (maintenance / warning) ── */
  .lcd-amber {
    color: #ffbb33;
    text-shadow:
      0 0 4px #ffaa00,
      0 0 10px #cc8800,
      0 0 20px rgba(255,170,0,0.4);
  }

  /* ── Dim white (neutral label) ── */
  .lcd-white {
    color: #d0f0d8;
    text-shadow:
      0 0 4px rgba(60,179,113,0.35),
      0 0 8px rgba(0,255,65,0.2);
  }

  /* Divider pipe */
  .lcd-divider {
    width: 1px;
    flex-shrink: 0;
    background: linear-gradient(to bottom, transparent, #1e3d1e 30%, #1e3d1e 70%, transparent);
    box-shadow: 0 0 4px rgba(60,179,113,0.08);
  }

  /* ── Badge base ── */
  .lcd-badge {
    border: 1px solid;
    font-family: 'Share Tech Mono', monospace !important;
    letter-spacing: 0.07em;
    -webkit-font-smoothing: none;
    border-radius: 3px;
    display: inline-flex;
    align-items: center;
  }

  /* CALL / UP — coral (swapped to match WON) */
  .lcd-badge-call {
    background: rgba(255, 127, 80, 0.07);
    border-color: rgba(255, 127, 80, 0.28);
    color: #ff8a60;
    text-shadow: 0 0 6px #FF7F50;
    box-shadow: 0 0 8px rgba(255, 127, 80, 0.12);
  }

  /* PUT / DOWN — green (swapped to match LOST) */
  .lcd-badge-put {
    background: rgba(0, 255, 65, 0.07);
    border-color: rgba(0, 255, 65, 0.28);
    color: #3dff8f;
    text-shadow: 0 0 6px #00ff41;
    box-shadow: 0 0 8px rgba(0, 255, 65, 0.12);
  }

  /* WON result — coral (user request) */
  .lcd-badge-won {
    background: rgba(255,127,80,0.07);
    border-color: rgba(255,127,80,0.25);
    color: #ff8a60;
    text-shadow: 0 0 6px #FF7F50;
  }

  /* LOST result — green (swapped) */
  .lcd-badge-lost {
    background: rgba(0,255,65,0.07);
    border-color: rgba(0,255,65,0.25);
    color: #3dff8f;
    text-shadow: 0 0 6px #00ff41;
  }

  /* ── Blink animation (live dot, maintenance) ── */
  .lcd-blink {
    animation: lcd-blink-kf 0.85s step-end infinite;
  }
  @keyframes lcd-blink-kf {
    0%,100% { opacity: 1; }
    50%      { opacity: 0.15; }
  }

  /* ── Light theme overrides ── */
  .lcd-panel-light .lcd-green  { color: #1a6b3c; text-shadow: none; }
  .lcd-panel-light .lcd-coral  { color: #c94e1e; text-shadow: none; }
  .lcd-panel-light .lcd-amber  { color: #a06000; text-shadow: none; }
  .lcd-panel-light .lcd-white  { color: #1A3026; text-shadow: none; }
  .lcd-panel-light .lcd-divider { background: #3CB37130; box-shadow: none; }
  .lcd-panel-light .lcd-badge-call { background: rgba(60,179,113,0.08); border-color: rgba(60,179,113,0.35); color: #1a6b3c; text-shadow: none; box-shadow: none; }
  .lcd-panel-light .lcd-badge-put  { background: rgba(255,127,80,0.08); border-color: rgba(255,127,80,0.35); color: #c94e1e; text-shadow: none; box-shadow: none; }
  .lcd-panel-light .lcd-badge-won  { background: rgba(60,179,113,0.08); border-color: rgba(60,179,113,0.3);  color: #1a6b3c; text-shadow: none; }
  .lcd-panel-light .lcd-badge-lost { background: rgba(255,127,80,0.08); border-color: rgba(255,127,80,0.3);  color: #c94e1e; text-shadow: none; }
`;

function GlobalTradeScrollerComponent({ theme }) {
    const [history, setHistory] = useState(() => {
        try {
            const saved = localStorage.getItem("15market_global_history_v2");
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });
    const [profiles, setProfiles] = useState({});
    const [activeBroadcast, setActiveBroadcast] = useState(null);
    const lastFetchRef = useRef(0);

    const truncate = (str) => str ? `${str.slice(0, 4)}...${str.slice(-4)}` : "";

    const fetchGlobalData = useCallback(async () => {
        try {
            const arcRes = await fetch(`${KEEPER_URL_ARC}/history`);
            if (arcRes.ok) {
                const arcData = await arcRes.json();
                if (Array.isArray(arcData)) {
                    arcData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    const finalHistory = arcData.slice(0, 100);

                    const newJson = JSON.stringify(finalHistory.map(h => h.id));
                    const oldJson = JSON.stringify(history.map(h => h.id));
                    if (newJson !== oldJson) {
                        setHistory(finalHistory);
                        localStorage.setItem("15market_global_history_v2", JSON.stringify(finalHistory));
                    }

                    let updatedProfiles = { ...profiles };
                    const ownersToFetch = Array.from(new Set(finalHistory.map(item => item.owner)))
                        .filter(owner => owner && !updatedProfiles[owner]);

                    if (ownersToFetch.length > 0) {
                        await Promise.all(ownersToFetch.map(async (owner) => {
                            try {
                                const keeperRes = await fetch(`${KEEPER_URL_ARC}/profile?address=${owner}`);
                                if (keeperRes.ok) {
                                    const keeperData = await keeperRes.json();
                                    if (keeperData && keeperData.username) {
                                        updatedProfiles[owner] = keeperData;
                                        return;
                                    }
                                }
                                updatedProfiles[owner] = { username: truncate(owner) };
                            } catch (e) {
                                updatedProfiles[owner] = { username: truncate(owner) };
                            }
                        }));
                        setProfiles(prev => ({ ...prev, ...updatedProfiles }));
                    }
                }
            }
            lastFetchRef.current = Date.now();
        } catch (err) {
            console.error("Global Scroller Sync Error:", err);
        }
    }, []);

    useEffect(() => {
        fetchGlobalData();
        const interval = setInterval(fetchGlobalData, 2000);

        const checkBroadcast = () => {
            try {
                const settingsSaved = localStorage.getItem('15market_citadel_settings');
                if (settingsSaved) {
                    const settings = JSON.parse(settingsSaved);
                    if (settings.maintenanceMode) {
                        setActiveBroadcast({
                            id: 'maintenance-mode',
                            type: 'MAINTENANCE',
                            text: 'SYSTEM UNDER MAINTENANCE — TRADING OPERATIONS SUSPENDED',
                            expiry: Date.now() + 99999999
                        });
                        return;
                    }
                }
            } catch (e) { setActiveBroadcast(null); }
        };

        checkBroadcast();
        const bInterval = setInterval(checkBroadcast, 2000);

        return () => {
            clearInterval(interval);
            clearInterval(bInterval);
        };
    }, []);

    const ghostTrades = useMemo(() => {
        const symbols = ["ETH", "BTC", "SOL", "MON", "JUP", "XRP"];
        const names = ["MOMENTUM_BOT", "PULSE_TRD", "ZEROX_ALPHA", "ARC_LIQUID", "SONIC_X", "WHALE_001"];
        return Array.from({ length: 10 }).map((_, i) => ({
            id: `ghost-${i}`,
            owner: "0x0000000000000000000000000000000000000000",
            username: names[i % names.length],
            amount: (Math.random() * 2 + 0.5).toFixed(2),
            symbol: symbols[i % symbols.length],
            direction: Math.random() > 0.5 ? "UP" : "DOWN",
            status: Math.random() > 0.5 ? "WON" : "LOST",
            timestamp: Date.now() - (i * 10000),
            isGhost: true
        }));
    }, []);

    const mergedHistory = useMemo(() => {
        const filtered = history.filter(t => ["WON", "LOST"].includes(t.status));
        if (filtered.length === 0) return ghostTrades;
        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return filtered.slice(0, 100);
    }, [history, ghostTrades]);

    const repeatedHistory = useMemo(() => {
        if (!mergedHistory || mergedHistory.length === 0) return [];
        let list = [...mergedHistory];
        while (list.length < 40) { list = [...list, ...mergedHistory]; }
        return [...list, ...list];
    }, [mergedHistory]);

    const isLight = theme === 'light';

    return (
        <>
            <style>{LCD_STYLES}</style>

            {/* ── Full-width LCD panel — no side labels, pure ticker ── */}
            <div
                className={`w-full h-10 lg:h-12 relative z-[40] overflow-hidden lcd-panel ${isLight ? 'lcd-panel-light' : ''}`}
                style={{
                    /* Mask the ENTIRE panel — deep fade at both absolute screen edges */
                    maskImage: `linear-gradient(
                        to right,
                        transparent   0%,
                        rgba(0,0,0,0.2)  3%,
                        rgba(0,0,0,0.6)  8%,
                        rgba(0,0,0,0.9) 14%,
                        black           22%,
                        black           78%,
                        rgba(0,0,0,0.9) 86%,
                        rgba(0,0,0,0.6) 92%,
                        rgba(0,0,0,0.2) 97%,
                        transparent  100%
                    )`,
                    WebkitMaskImage: `linear-gradient(
                        to right,
                        transparent   0%,
                        rgba(0,0,0,0.2)  3%,
                        rgba(0,0,0,0.6)  8%,
                        rgba(0,0,0,0.9) 14%,
                        black           22%,
                        black           78%,
                        rgba(0,0,0,0.9) 86%,
                        rgba(0,0,0,0.6) 92%,
                        rgba(0,0,0,0.2) 97%,
                        transparent  100%
                    )`
                }}
            >
                {/* Left solid-colour fog — matched to panel background for a hard edge illusion */}
                <div
                    className="absolute left-0 top-0 bottom-0 w-[20%] pointer-events-none z-30"
                    style={{
                        background: isLight
                            ? 'linear-gradient(to right, #f0faf4 0%, #f0faf4 20%, rgba(240,250,244,0.8) 60%, transparent 100%)'
                            : 'linear-gradient(to right, #07090a 0%, #07090a 20%, rgba(7,9,10,0.8) 60%, transparent 100%)'
                    }}
                />
                {/* Right solid-colour fog */}
                <div
                    className="absolute right-0 top-0 bottom-0 w-[20%] pointer-events-none z-30"
                    style={{
                        background: isLight
                            ? 'linear-gradient(to left, #f0faf4 0%, #f0faf4 20%, rgba(240,250,244,0.8) 60%, transparent 100%)'
                            : 'linear-gradient(to left, #07090a 0%, #07090a 20%, rgba(7,9,10,0.8) 60%, transparent 100%)'
                    }}
                />

                {/* ── Maintenance Broadcast Overlay ── */}
                <AnimatePresence mode="wait">
                    {activeBroadcast && (
                        <motion.div
                            key={`broadcast-${activeBroadcast.id}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex items-center z-40"
                            style={{ background: isLight ? '#f0faf4' : '#07090a' }}
                        >
                            <motion.div
                                className="flex items-center gap-24 whitespace-nowrap"
                                animate={{ x: ["0%", "-50%"] }}
                                transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
                            >
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-4 mx-8">
                                        <span className="lcd-text lcd-badge lcd-badge-call text-[7px] px-2 py-0.5 gap-1.5">
                                            <Radio size={7} className="lcd-blink" />
                                            {activeBroadcast.type}
                                        </span>
                                        <span className="lcd-text text-[9px] lg:text-[11px] tracking-widest lcd-amber">
                                            *** {activeBroadcast.text} ***
                                        </span>
                                    </div>
                                ))}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Main ticker ── */}
                <motion.div
                    animate={{ x: ["0%", "-50%"] }}
                    className="flex items-center whitespace-nowrap h-full"
                    transition={{ x: { duration: 650, repeat: Infinity, ease: "linear" } }}
                >
                    {repeatedHistory.map((event, i) => {
                        const isUp = event.direction === "UP" || event.direction === 1 || String(event.direction) === "1";
                        const isWon = String(event.status).toUpperCase() === "WON";
                        const isLost = String(event.status).toUpperCase() === "LOST";
                        const uname = (event.username || profiles[event.owner]?.username || truncate(event.owner) || "ANON")
                            .toUpperCase().replace(/\s/g, '_').slice(0, 12);
                        const amt = Number(event.amount).toFixed(2);
                        const sym = (event.symbol || 'USDC').toUpperCase();

                        return (
                            <div key={`${event.id}-${i}`} className="flex items-center h-full">
                                {/* Vertical rule separator */}
                                <div className="lcd-divider h-5 mx-4 lg:mx-5" />

                                {/* Trade chip */}
                                <div className="flex items-center gap-1.5 lg:gap-2">
                                    <span className={`lcd-text lcd-badge text-[6px] lg:text-[7px] px-1.5 py-0.5 ${isUp ? 'lcd-badge-call' : 'lcd-badge-put'}`}>
                                        {isUp ? '▲ CALL' : '▼ PUT'}
                                    </span>
                                    <span className="lcd-text lcd-white text-[7px] lg:text-[8px] tracking-wider">
                                        {uname}
                                    </span>
                                    <span
                                        className="lcd-text text-[7px] lg:text-[8px] tracking-wide"
                                        style={{
                                            color: isWon ? '#ff8a60' : (isLost ? '#3dff8f' : (isLight ? '#2d5a3d' : '#8dcfaa')),
                                            textShadow: isWon ? '0 0 6px rgba(255,127,80,0.4)' : (isLost ? '0 0 6px rgba(0,255,65,0.4)' : 'none')
                                        }}
                                    >
                                        {amt}&nbsp;{sym}
                                    </span>
                                    <span className={`lcd-text lcd-badge text-[6px] lg:text-[7px] px-1.5 py-0.5 ${isWon ? 'lcd-badge-won' : 'lcd-badge-lost'}`}>
                                        {isWon ? '✓ WON' : '✕ LOST'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </motion.div>
            </div>
        </>
    );
}

export const GlobalTradeScroller = memo(GlobalTradeScrollerComponent);
