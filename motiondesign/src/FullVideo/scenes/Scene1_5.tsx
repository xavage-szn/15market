import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { COLORS, FONTS } from "../constants";
import { JitterScroll, LandingScroll } from "../components/GlobalComponents";

// ─── SCENE 1: THE PREDICTION MARKET ERA ─────────────────────────────────────
export const Scene1: React.FC = () => {
  const frame = useCurrentFrame();

  const concepts = [
    "Crypto",
    "DeFi",
    "Options",
    "Perpetuals",
    "Prediction Markets"
  ];

  const titleOp = interpolate(frame - 70, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      <LandingScroll 
        items={concepts} 
        targetIndex={4} 
        duration={60} 
        itemHeight={120} 
      />

      {/* Headline */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          width: "100%",
          textAlign: "center",
          color: COLORS.white,
          fontFamily: FONTS.headline,
          fontSize: 40,
          fontWeight: 800,
          opacity: titleOp,
          letterSpacing: "8px",
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

  const markets = [
    "Hedgehog",
    "Augur",
    "Projection",
    "SanR",
    "DexWin",
    "Oriole",
    "Duel Duck",
    "moonopol",
    "Kalshi",
    "Manifold",
    "Polymarket"
  ];

  const titleOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      <div style={{ position: "absolute", top: 120, width: "100%", textAlign: "center", color: COLORS.gray, fontFamily: FONTS.headline, fontSize: 32, opacity: titleOp, letterSpacing: "4px" }}>
        THE MARKETS THAT BUILT TRUST
      </div>

      <LandingScroll 
        items={markets} 
        targetIndex={10} 
        duration={80} 
        itemHeight={140} 
        style={{ width: "100%" }}
      />

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

// ─── SCENE 4: LIQUIDATION (REVERTED TO STRAIGHT LINE) ───────────────────────
export const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const text1Op = interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  
  const crashStart = 100;
  const crashProgress = interpolate(frame - crashStart, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.33, 1, 0.68, 1) });
  
  // Straight trend line
  const startX = width * 0.2;
  const startY = height * 0.3;
  const endX = width * 0.8;
  const endY = height * 0.8;

  const currentX = startX + (endX - startX) * crashProgress;
  const currentY = startY + (endY - startY) * crashProgress;

  const liqOp = interpolate(frame - (crashStart + 25), [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const liqScale = spring({ frame: Math.max(0, frame - (crashStart + 25)), fps, config: { damping: 10, stiffness: 200 } });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      
      <div style={{ color: COLORS.white, opacity: text1Op, textAlign: "center", fontFamily: FONTS.body, fontSize: 40, position: "absolute", top: 150 }}>
        Traditional crypto leverage is fast...<br/><span style={{ color: COLORS.gray }}>but it's dangerous.</span>
      </div>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", overflow: "visible" }}>
        <defs>
          <filter id="redGlow">
            <feGaussianBlur stdDeviation="15" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        
        {/* Trend Line */}
        <line
          x1={startX} y1={startY}
          x2={currentX} y2={currentY}
          stroke={COLORS.red}
          strokeWidth="8"
          style={{ filter: "url(#redGlow)" }}
        />

        {/* Candles pop in */}
        {new Array(10).fill(0).map((_, i) => {
          const p = i / 10;
          if (crashProgress < p) return null;
          const cx = startX + (endX - startX) * p;
          const cy = startY + (endY - startY) * p;
          return (
            <rect
              key={i}
              x={cx - 15}
              y={cy}
              width={30}
              height={50}
              fill={COLORS.red}
              opacity={0.8}
            />
          );
        })}
      </svg>

      {/* Impact Flash */}
      {frame > crashStart + 25 && frame < crashStart + 30 && (
        <AbsoluteFill style={{ backgroundColor: COLORS.red, opacity: 0.4 }} />
      )}

      {/* Liquidation text */}
      <div style={{ position: "absolute", width: "100%", top: "50%", transform: "translateY(-50%)", textAlign: "center", opacity: liqOp }}>
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
