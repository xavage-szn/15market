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
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {/* Scroll through concepts quickly and stop on Prediction Markets */}
      {/* We need the scroll to stop, so we calculate a custom scrolledY instead of using the raw JitterScroll speed if we want it to stop. 
          Actually, we can just pass a speed that decelerates, or calculate it. 
          Let's just use the built-in JitterScroll but we'll stop the frame using a custom speed or pre-calculated list.
          Wait, JitterScroll uses `frame * speed`. To make it stop, we can pass a static offset if we rewrite JitterScroll slightly, but let's just make it scroll continuously and fade out! */}
      
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
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      
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
  const { fps } = useVideoConfig();

  const text1Op = interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  
  const wipeFrame = 120;
  const wipeY = interpolate(frame, [wipeFrame, wipeFrame + 8], [-1000, 0], { easing: Easing.bezier(0.4, 0, 1, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const isWipeImpact = frame >= wipeFrame && frame < wipeFrame + 2;

  const liqOp = interpolate(frame, [wipeFrame + 10, wipeFrame + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const liqScale = spring({ frame: Math.max(0, frame - (wipeFrame + 10)), fps, config: { damping: 12, stiffness: 300 } });
  
  const finalDesat = interpolate(frame, [270, 300], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", filter: `grayscale(${1 - finalDesat})`, alignItems: "center", justifyContent: "center" }}>
      
      <div style={{ fontFamily: FONTS.body, fontSize: 40, color: COLORS.white, opacity: text1Op, position: "absolute", top: 200, textAlign: "center" }}>
        Traditional crypto leverage is fast...<br/><span style={{ color: COLORS.gray }}>but it's dangerous.</span>
      </div>

      {isWipeImpact && <div style={{ position: "absolute", inset: 0, backgroundColor: COLORS.red, opacity: 0.2 }} />}

      {frame >= wipeFrame && (
        <div style={{ position: "absolute", width: 20, height: 1000, background: COLORS.red, transform: `translateY(${wipeY}px)`, boxShadow: `0 0 50px ${COLORS.red}` }} />
      )}

      {/* Liquidation text */}
      <div style={{ position: "absolute", width: "100%", top: "50%", transform: "translateY(-50%)", textAlign: "center", opacity: liqOp }}>
        <span style={{ fontFamily: FONTS.headline, fontWeight: 900, fontSize: 140, color: COLORS.red, transform: `scale(${liqScale})`, display: "inline-block" }}>LIQUIDATED</span>
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
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      
      <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center", opacity: titleOp }}>
        <span style={{ fontFamily: FONTS.headline, fontWeight: 800, fontSize: 56, color: COLORS.red }}>AND MEMECOINS?</span>
      </div>

      <JitterScroll items={issues} speed={10} itemHeight={120} delay={40} style={{ top: 100 }} />
      
    </AbsoluteFill>
  );
};
