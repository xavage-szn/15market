import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../constants";
import { Logo3D, TerminalText, AmbientGlow, ArcGraphics } from "../components/GlobalComponents";

// ─── SCENE 11: THE CLASSIC MODEL ───────────────────────────────────────────────
// ... lines 7-101 (unchanged)
export const Scene13: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arcScale = spring({ frame: Math.max(0, frame - 40), fps, config: { damping: 20 } });
  const aBlur = interpolate(arcScale, [0, 1], [20, 0]);

  const pillOp1 = interpolate(frame, [90, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pillOp2 = interpolate(frame, [120, 140], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pillOp3 = interpolate(frame, [150, 170], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      <div style={{ opacity: arcScale, filter: `blur(${aBlur}px)` }}>
        <ArcGraphics />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 30, alignItems: "center" }}>
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,230,118,0.2)", padding: "20px 40px", borderRadius: 30, color: COLORS.white, fontFamily: FONTS.headline, fontWeight: 300, fontSize: 24, opacity: pillOp1, letterSpacing: "4px", backdropFilter: "blur(20px)", textAlign: "center" }}>
          NOW LIVE ON ARC TESTNET<br/>
          <span style={{ fontSize: 18, color: COLORS.greenGlow }}>15MARKET.ONLINE</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,230,118,0.2)", padding: "20px 40px", borderRadius: 30, color: COLORS.white, fontFamily: FONTS.headline, fontWeight: 300, fontSize: 24, opacity: pillOp2, letterSpacing: "4px", backdropFilter: "blur(20px)" }}>PROGRAMMED MICRO-TRANSACTIONS</div>
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,230,118,0.2)", padding: "20px 40px", borderRadius: 30, color: COLORS.greenGlow, fontFamily: FONTS.headline, fontWeight: 800, fontSize: 24, opacity: pillOp3, letterSpacing: "4px", backdropFilter: "blur(20px)" }}>ZERO FRICTION</div>
      </div>

    </AbsoluteFill>
  );
};

// ─── SCENE 14: THE GAP FILLED ────────────────────────────────────────────────
export const Scene14: React.FC = () => {
  const frame = useCurrentFrame();

  const text1Op = interpolate(frame, [20, 50], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const text2Op = interpolate(frame, [80, 110], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const lineOp = interpolate(frame, [140, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>

      <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", gap: 150 }}>
        
        {/* Left Side (Polymarket context) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: text1Op }}>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: FONTS.headline, color: COLORS.gray, letterSpacing: "4px", marginBottom: 20 }}>THEY BUILT IT</div>
          <div style={{ fontSize: 48, fontWeight: 300, fontFamily: FONTS.headline, color: COLORS.white, letterSpacing: "2px" }}>Polymarket</div>
        </div>

        {/* Vertical Divider */}
        <div style={{ width: 1, height: 200, background: `linear-gradient(to bottom, transparent, rgba(255,255,255,0.2), transparent)`, opacity: lineOp }} />

        {/* Right Side (15Market) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: text2Op }}>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: FONTS.headline, color: COLORS.greenGlow, letterSpacing: "4px", marginBottom: 20 }}>WE REFINED IT</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Logo3D style={{ width: 100, height: 100 }} />
          </div>
        </div>

      </div>

    </AbsoluteFill>
  );
};

// ─── SCENE 15: THE MARKET MOVES. ─────────────────────────────────────────────
export const Scene15: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: Math.max(0, frame - 30), fps, config: { damping: 20, stiffness: 100 } });
  const lS = interpolate(logoScale, [0, 1], [0.9, 1]); // Subtle float
  const blur = interpolate(logoScale, [0, 1], [40, 0]);

  const urlOp = interpolate(frame - 240, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      <AmbientGlow color={COLORS.green} xOffset={0} yOffset={0} delay={0} />

      {/* Light Sweep */}
      {frame >= 60 && frame < 120 && (
        <div style={{ position: "absolute", width: 200, height: 2000, background: "rgba(255,255,255,0.1)", transform: `rotate(45deg) translateX(${interpolate(frame, [60, 120], [-2000, 2000])}px)`, filter: "blur(20px)" }} />
      )}

      {frame >= 30 && (
        <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          
          <div style={{ display: "flex", alignItems: "center", transform: `scale(${lS})`, filter: `blur(${blur}px)` }}>
            <Logo3D style={{ width: 600, height: 600 }} />
          </div>

          <div style={{ position: "absolute", bottom: 150, textAlign: "center" }}>
            <TerminalText text="PREDICT FAST. SETTLE FASTER." style={{ fontSize: 24, letterSpacing: "8px", fontWeight: 300, color: COLORS.gray }} delay={150} />
            
            <div style={{ marginTop: 60, opacity: urlOp }}>
              <span style={{ fontFamily: FONTS.terminal, color: COLORS.white, fontSize: 32, letterSpacing: "4px", padding: "15px 40px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 40, background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" }}>15MARKET.ONLINE</span>
            </div>
          </div>

        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};
