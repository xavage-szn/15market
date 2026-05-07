import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../constants";
import { Logo3D, TerminalText, AmbientGlow, ArcGraphics } from "../components/GlobalComponents";

// ─── SCENE 11: THE CLASSIC MODEL ───────────────────────────────────────────────
export const Scene11: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const card = { title: "THE CLASSIC MODEL", color: COLORS.greenGlow, desc1: "PLAYER vs HOUSE", desc2: "INSTANT SETTLEMENT" };

  // Bouncy spring
  const s = spring({ 
    frame: Math.max(0, frame - 30), 
    fps, 
    config: { damping: 10, stiffness: 200 } // Bouncier
  });
  
  const scale = interpolate(s, [0, 1], [0.8, 1]);
  const blur = interpolate(s, [0, 1], [20, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>


      <div style={{ position: "absolute", top: 150 }}>
        <TerminalText text="SIMPLE. FAST. DIRECT." style={{ fontSize: 32, letterSpacing: "8px", fontWeight: 300, color: COLORS.white, fontFamily: FONTS.terminal }} delay={0} />
      </div>

      <div style={{ 
        width: 600, height: 400, 
        background: "rgba(255,255,255,0.02)", 
        border: "1px solid rgba(0,230,118,0.2)", 
        borderRadius: 30, 
        transform: `scale(${scale})`, 
        opacity: interpolate(frame - 30, [0, 10], [0, 1]), 
        padding: 60, 
        display: "flex", 
        flexDirection: "column", 
        justifyContent: "center",
        alignItems: "center",
        boxShadow: `0 40px 100px rgba(0,0,0,0.5)` 
      }}>


        <div style={{ textAlign: "center" }}>
          <div style={{ color: card.color, fontFamily: FONTS.headline, fontSize: 40, fontWeight: 800, letterSpacing: "4px", marginBottom: 40 }}>{card.title}</div>
        </div>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ color: COLORS.white, fontFamily: FONTS.headline, fontSize: 32, fontWeight: 300, letterSpacing: "4px" }}>{card.desc1}</div>
          <div style={{ color: COLORS.gray, fontFamily: FONTS.body, fontSize: 18, letterSpacing: "2px" }}>{card.desc2}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 12: FUTURE MODELS TEASE ───────────────────────────────────────────
export const Scene12: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const text1Op = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const text2Op = interpolate(frame, [120, 140], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const models = ["ROUNDS", "LADDER", "CLASH", "SURGE"];

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 60, opacity: text1Op }}>
        <div style={{ fontFamily: FONTS.headline, fontSize: 36, color: COLORS.gray, fontWeight: 300, letterSpacing: "8px" }}>AND WE'RE JUST GETTING STARTED</div>
        <div style={{ display: "flex", gap: 30, marginTop: 20 }}>
          {models.map((m, i) => {
            const b = spring({ 
              frame: Math.max(0, frame - (40 + i * 15)), 
              fps, 
              config: { damping: 12, stiffness: 200 } 
            });
            const y = interpolate(b, [0, 1], [100, 0]);
            const s = interpolate(b, [0, 1], [0.8, 1]);
            
            return (
              <div key={m} style={{ 
                padding: "20px 40px", 
                background: "rgba(255,255,255,0.02)",
                border: `1px solid rgba(0,230,118,0.3)`, 
                borderRadius: 16, 
                color: COLORS.white, 
                fontFamily: FONTS.headline, 
                fontWeight: 800,
                fontSize: 24, 
                letterSpacing: "4px",
                opacity: b, 
                transform: `translateY(${y}px) scale(${s})`,
              }}>
                {m}
              </div>

            );
          })}
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 150, opacity: text2Op, textAlign: "center" }}>
        <div style={{ fontFamily: FONTS.headline, fontSize: 36, color: COLORS.white, fontWeight: 300, letterSpacing: "8px" }}>MORE MODELS COMING SOON.</div>
        <div style={{ fontFamily: FONTS.terminal, fontSize: 20, color: COLORS.greenGlow, marginTop: 20, letterSpacing: "4px" }}>ALL BUILT AROUND THE 15-SECOND CORE.</div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 13: ARC ───────────────────────────────────────────────────────────
export const Scene13: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const arcScale = spring({ frame: Math.max(0, frame - 40), fps, config: { damping: 20 } });
  const aBlur = interpolate(arcScale, [0, 1], [20, 0]);

  const pills = [
    { text: "NOW LIVE ON ARC TESTNET", sub: "15MARKET.ONLINE", color: COLORS.white },
    { text: "PROGRAMMED MICRO-TRANSACTIONS", color: COLORS.white },
    { text: "ZERO FRICTION", color: COLORS.greenGlow, bold: true }
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      <div style={{ opacity: arcScale, filter: `blur(${aBlur}px)`, marginBottom: 40 }}>
        <ArcGraphics />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 30, alignItems: "center" }}>
        {pills.map((p, i) => {
          const b = spring({ 
            frame: Math.max(0, frame - (90 + i * 30)), 
            fps, 
            config: { damping: 10, stiffness: 200 } 
          });
          const x = interpolate(b, [0, 1], [-100, 0]);
          
          return (
            <div key={i} style={{ 
              background: "rgba(255,255,255,0.05)", 
              border: "1px solid rgba(0,230,118,0.2)", 
              padding: "20px 40px", 
              borderRadius: 30, 
              color: p.color, 
              fontFamily: FONTS.headline, 
              fontWeight: p.bold ? 800 : 300, 
              fontSize: 24, 
              opacity: b, 
              letterSpacing: "4px", 
              textAlign: "center",
              transform: `translateX(${x}px) scale(${b})`
            }}>

              {p.text}
              {p.sub && <><br/><span style={{ fontSize: 18, color: COLORS.greenGlow }}>{p.sub}</span></>}
            </div>
          );
        })}
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

  // "15MARKET IS LIVE" Animation
  const liveS = spring({ frame: Math.max(0, frame - 20), fps, config: { damping: 12, stiffness: 150 } });
  const liveOp = interpolate(frame - 20, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const liveScale = interpolate(liveS, [0, 1], [1.1, 1]);
  const liveTracking = interpolate(liveS, [0, 1], [40, 10]);

  // Subtext Animation
  const subOp = interpolate(frame - 50, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  
  // URL Animation
  const urlS = spring({ frame: Math.max(0, frame - 80), fps, config: { damping: 15, stiffness: 120 } });
  const urlOp = interpolate(frame - 80, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const urlY = interpolate(urlS, [0, 1], [30, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>


      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        
        {/* Official Logo */}
        <div style={{ opacity: liveOp, transform: `scale(${liveScale * 0.8})`, marginBottom: 40 }}>
          <Logo3D style={{ width: 600, height: 300 }} />
        </div>

        {/* Main Title */}
        <div style={{ 
          opacity: liveOp, 
          transform: `scale(${liveScale})`,
          fontFamily: FONTS.headline,
          fontSize: 100,
          fontWeight: 900,
          color: COLORS.white,
          letterSpacing: `${liveTracking}px`,
          textShadow: `0 0 30px ${COLORS.greenGlow}44`,
          marginBottom: 20
        }}>
          IS LIVE
        </div>


        {/* Powerful Subtitle */}
        <div style={{ 
          opacity: subOp, 
          fontFamily: FONTS.body,
          fontSize: 24,
          fontWeight: 300,
          color: COLORS.gray,
          letterSpacing: "8px",
          marginBottom: 100
        }}>
          PREDICT FAST. SETTLE FASTER.
        </div>

        {/* URL - Simple yet powerful */}
        <div style={{ 
          opacity: urlOp, 
          transform: `translateY(${urlY}px)`,
          padding: "20px 60px",
          border: `2px solid ${COLORS.greenGlow}`,
          borderRadius: 60,
          background: "rgba(0,230,118,0.05)",
          boxShadow: `0 0 40px ${COLORS.greenGlow}22`,
        }}>
          <span style={{ 
            fontFamily: FONTS.terminal, 
            color: COLORS.white, 
            fontSize: 48, 
            fontWeight: 800,
            letterSpacing: "4px" 
          }}>
            15MARKET.ONLINE
          </span>
        </div>

      </div>

    </AbsoluteFill>
  );
};

