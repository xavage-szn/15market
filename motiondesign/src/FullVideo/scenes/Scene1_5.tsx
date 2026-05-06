import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { COLORS, FONTS } from "../constants";
import { JitterScroll } from "../components/GlobalComponents";

// ─── SCENE 1: THE PREDICTION MARKET ERA ─────────────────────────────────────
export const Scene1: React.FC = () => {
  const frame = useCurrentFrame();

  const concepts = [
    "Crypto",
    "DeFi",
    "Web3",
    "Smart Contracts",
    "Prediction Markets"
  ];

  const titleOp = interpolate(frame - 120, [0, 30], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      <JitterScroll items={concepts} speed={8} itemHeight={100} delay={0} />

      {/* Headline */}
      <div
        style={{
          position: "absolute",
          bottom: 150,
          width: "100%",
          textAlign: "center",
          color: COLORS.white,
          fontFamily: FONTS.headline,
          fontSize: 48,
          fontWeight: 800,
          opacity: titleOp,
          letterSpacing: "2px",
        }}
      >
        CHANGED EVERYTHING
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 2: THE GIANTS ─────────────────────────────────────────────────────
export const Scene2: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const markets = [
    "Hedgehog",
    "Augur",
    "Projection Finance",
    "SanR.app",
    "Better Fan",
    "DexWin",
    "Oriole Insights",
    "Duel Duck",
    "moonopol",
    "due.box",
    "Polymarket",
    "Kalshi"
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center", color: COLORS.gray, fontFamily: FONTS.headline, fontSize: 36, opacity: titleOp }}>
        THE MARKETS THAT BUILT TRUST
      </div>

      <JitterScroll items={markets} speed={12} itemHeight={120} delay={20} />

    </AbsoluteFill>
  );
};

// ─── SCENE 3: BUT THEY TAKE TOO LONG ─────────────────────────────────────────
export const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const text1Op = interpolate(frame - 40, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const text2Op = interpolate(frame - 100, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  const hoursY = spring({ frame: Math.max(0, frame - 180), fps, config: { damping: 15, stiffness: 300 } });
  const hoursYVal = interpolate(hoursY, [0, 1], [100, 0]);
  const hoursOp = interpolate(frame - 180, [0, 10], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const daysOp = interpolate(frame - 240, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      <div style={{ fontFamily: FONTS.body, fontSize: 48, color: COLORS.gray, opacity: text1Op, marginBottom: 20 }}>
        But let's be honest.
      </div>
      <div style={{ fontFamily: FONTS.headline, fontSize: 64, color: COLORS.white, opacity: text2Op, marginBottom: 80, fontWeight: "bold" }}>
        They take too long.
      </div>

      <div style={{ display: "flex", gap: 40, alignItems: "baseline" }}>
        <div style={{ fontFamily: FONTS.headline, fontWeight: 800, fontSize: 120, color: COLORS.white, opacity: hoursOp, transform: `translateY(${hoursYVal}px)` }}>HOURS.</div>
        <div style={{ fontFamily: FONTS.headline, fontWeight: 600, fontSize: 64, color: COLORS.gray, opacity: daysOp }}>SOMETIMES DAYS.</div>
      </div>

    </AbsoluteFill>
  );
};

// ─── SCENE 4: THE CRYPTO ALTERNATIVE ─────────────────────────────────────────
export const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const text1Op = interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  
  const crashStart = 100;
  const crashProgress = interpolate(frame - crashStart, [0, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.33, 1, 0.68, 1) });
  
  // Crashing path points
  const points = [
    { x: width * 0.5, y: -100 },
    { x: width * 0.45, y: height * 0.2 },
    { x: width * 0.55, y: height * 0.4 },
    { x: width * 0.4, y: height * 0.6 },
    { x: width * 0.6, y: height * 0.8 },
    { x: width * 0.3, y: height + 200 },
  ];

  const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  
  // Calculate current head position for arrowhead and candles
  const totalLen = points.length - 1;
  const currentIdx = Math.min(Math.floor(crashProgress * totalLen), totalLen - 1);
  const segmentProgress = (crashProgress * totalLen) % 1;
  const p1 = points[currentIdx];
  const p2 = points[currentIdx + 1];
  const headX = p1.x + (p2.x - p1.x) * segmentProgress;
  const headY = p1.y + (p2.y - p1.y) * segmentProgress;

  // Split animation
  const splitOffset = interpolate(crashProgress, [0.2, 1], [0, 150], { extrapolateLeft: "clamp" });

  const liqOp = interpolate(frame - (crashStart + 35), [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const liqScale = spring({ frame: Math.max(0, frame - (crashStart + 35)), fps, config: { damping: 10, stiffness: 200 } });

  // Clip Paths for the split effect
  const leftClip = `polygon(0% 0%, ${points[0].x}px 0%, ${points[1].x}px ${points[1].y}px, ${points[2].x}px ${points[2].y}px, ${points[3].x}px ${points[3].y}px, ${points[4].x}px ${points[4].y}px, ${points[5].x}px ${points[5].y}px, 0% 100%)`;
  const rightClip = `polygon(100% 0%, ${points[0].x}px 0%, ${points[1].x}px ${points[1].y}px, ${points[2].x}px ${points[2].y}px, ${points[3].x}px ${points[3].y}px, ${points[4].x}px ${points[4].y}px, ${points[5].x}px ${points[5].y}px, 100% 100%)`;

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      
      {/* Background Layer (Left Side) */}
      <AbsoluteFill style={{ 
        clipPath: leftClip, 
        transform: `translateX(-${splitOffset}px)`,
        backgroundColor: COLORS.bg 
      }}>
        <div style={{ padding: 200, color: COLORS.white, opacity: text1Op, textAlign: "center", fontFamily: FONTS.body, fontSize: 40 }}>
          Traditional crypto leverage is fast...<br/><span style={{ color: COLORS.gray }}>but it's dangerous.</span>
        </div>
      </AbsoluteFill>

      {/* Background Layer (Right Side) */}
      <AbsoluteFill style={{ 
        clipPath: rightClip, 
        transform: `translateX(${splitOffset}px)`,
        backgroundColor: COLORS.bg 
      }}>
        <div style={{ padding: 200, color: COLORS.white, opacity: text1Op, textAlign: "center", fontFamily: FONTS.body, fontSize: 40 }}>
          Traditional crypto leverage is fast...<br/><span style={{ color: COLORS.gray }}>but it's dangerous.</span>
        </div>
      </AbsoluteFill>

      {/* The Crash Line & Candles */}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", overflow: "visible", zIndex: 10 }}>
        <defs>
          <filter id="redGlow">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        
        {/* Jagged Crash Line */}
        <path
          d={pathD}
          fill="none"
          stroke={COLORS.red}
          strokeWidth="4"
          strokeDasharray="3000"
          strokeDashoffset={3000 * (1 - crashProgress)}
          style={{ filter: "url(#redGlow)" }}
        />

        {/* Arrow Head */}
        {crashProgress > 0 && (
          <g transform={`translate(${headX}, ${headY}) rotate(${Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI})`}>
            <path d="M -15 -15 L 15 0 L -15 15 Z" fill={COLORS.red} style={{ filter: "url(#redGlow)" }} />
          </g>
        )}

        {/* Red Candles along path */}
        {points.map((p, i) => {
          if (i === 0 || i > currentIdx + 1) return null;
          const op = i <= currentIdx ? 1 : segmentProgress;
          return (
            <rect
              key={i}
              x={p.x - 10}
              y={p.y - 40}
              width={20}
              height={80}
              fill={COLORS.red}
              opacity={op * 0.6}
            />
          );
        })}
      </svg>

      {/* Impact Flash */}
      {frame > crashStart + 30 && frame < crashStart + 35 && (
        <AbsoluteFill style={{ backgroundColor: COLORS.red, opacity: 0.3 }} />
      )}

      {/* Liquidation text */}
      <div style={{ position: "absolute", width: "100%", top: "50%", transform: "translateY(-50%)", textAlign: "center", opacity: liqOp, zIndex: 20 }}>
        <span style={{ 
          fontFamily: FONTS.headline, 
          fontWeight: 900, 
          fontSize: 160, 
          color: COLORS.red, 
          transform: `scale(${liqScale})`, 
          display: "inline-block",
          textShadow: `0 0 50px ${COLORS.red}aa`
        }}>
          LIQUIDATED
        </span>
      </div>

    </AbsoluteFill>
  );
};

// ─── SCENE 5: THE MEMECOIN NIGHTMARE ─────────────────────────────────────────
export const Scene5: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOp = interpolate(frame, [20, 50], [0, 1], { extrapolateLeft: "clamp" });

  const issues = [
    "Rugs",
    "Honeypots",
    "Stop Hunts",
    "Margin Calls",
    "Exit Scams",
    "Dev Dumps",
    "Illiquidity",
    "Scams"
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center", opacity: titleOp }}>
        <span style={{ fontFamily: FONTS.headline, fontWeight: 800, fontSize: 56, color: COLORS.red }}>AND MEMECOINS?</span>
      </div>

      <JitterScroll items={issues} speed={10} itemHeight={120} delay={40} />
      
    </AbsoluteFill>
  );
};
