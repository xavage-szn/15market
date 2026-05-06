import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { COLORS, FONTS } from "../constants";
import { Logo3D, TerminalText } from "../components/GlobalComponents";

// ─── SCENE 11: THE CLASSIC MODEL ───────────────────────────────────────────────
export const Scene11: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const card = { title: "THE CLASSIC MODEL", icon: "👤 vs 🏛", color: COLORS.green, desc1: "Player vs House", desc2: "Instant Settlement" };

  const s = spring({ frame: Math.max(0, frame - 30), fps, config: { damping: 15, stiffness: 200 } });
  const scale = interpolate(s, [0, 1], [0.8, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: 150 }}>
        <TerminalText text="SIMPLE. FAST. DIRECT." style={{ fontSize: 42, color: COLORS.white, fontFamily: FONTS.headline }} delay={0} />
      </div>

      <div style={{ width: 400, height: 500, background: "#111", border: `2px solid ${card.color}`, borderRadius: 24, transform: `scale(${scale})`, opacity: s, padding: 40, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: `0 0 50px ${COLORS.green}33` }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 80, marginBottom: 30 }}>{card.icon}</div>
          <div style={{ color: card.color, fontFamily: FONTS.headline, fontSize: 32, fontWeight: "bold" }}>{card.title}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: COLORS.white, fontFamily: FONTS.body, fontSize: 24, marginBottom: 10 }}>{card.desc1}</div>
          <div style={{ color: COLORS.gray, fontFamily: FONTS.terminal, fontSize: 20 }}>{card.desc2}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 12: FUTURE MODELS TEASE ───────────────────────────────────────────
export const Scene12: React.FC = () => {
  const frame = useCurrentFrame();

  const text1Op = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const text2Op = interpolate(frame, [120, 140], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const models = ["ROUNDS", "LADDER", "CLASH", "SURGE"];

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, opacity: text1Op }}>
        <div style={{ fontFamily: FONTS.headline, fontSize: 48, color: COLORS.gray }}>And we're just getting started.</div>
        <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
          {models.map((m, i) => {
            const op = interpolate(frame - (40 + i * 15), [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
            const y = interpolate(frame - (40 + i * 15), [0, 20], [20, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
            return (
              <div key={m} style={{ padding: "10px 20px", border: `1px solid ${COLORS.green}66`, borderRadius: 8, color: COLORS.green, fontFamily: FONTS.terminal, fontSize: 24, opacity: op, transform: `translateY(${y}px)` }}>
                {m}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 150, opacity: text2Op, textAlign: "center" }}>
        <div style={{ fontFamily: FONTS.headline, fontSize: 36, color: COLORS.white }}>More models coming soon.</div>
        <div style={{ fontFamily: FONTS.body, fontSize: 24, color: COLORS.green, marginTop: 10 }}>All built around the 15-second core.</div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 13: BUILT ON ARC ──────────────────────────────────────────────────
export const Scene13: React.FC = () => {
  const frame = useCurrentFrame();

  const arcLen = 1000;
  const draw = interpolate(frame, [0, 60], [arcLen, 0], { extrapolateRight: "clamp" });

  const textOp = interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const pillOp1 = interpolate(frame, [120, 135], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pillOp2 = interpolate(frame, [135, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pillOp3 = interpolate(frame, [150, 165], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
      
      {/* ARC Logo simple SVG representation */}
      <svg width="400" height="200" viewBox="0 0 400 200" style={{ marginBottom: 40 }}>
        <path d="M50,150 Q200,0 350,150" fill="none" stroke={COLORS.green} strokeWidth="10" strokeDasharray={arcLen} strokeDashoffset={draw} />
        <circle cx="200" cy="75" r="20" fill={COLORS.green} opacity={interpolate(frame, [30, 45], [0, 1], { extrapolateLeft: "clamp" })} />
      </svg>

      <div style={{ opacity: textOp, textAlign: "center", fontFamily: FONTS.terminal, color: COLORS.white, fontSize: 24, marginBottom: 60 }}>
        Every stake. Every payout.<br />
        Programmed into the chain.
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ padding: "10px 20px", border: `2px solid ${COLORS.green}`, borderRadius: 30, color: COLORS.green, opacity: pillOp1, fontFamily: FONTS.body }}>EVM Compatible</div>
        <div style={{ padding: "10px 20px", border: `2px solid ${COLORS.green}`, borderRadius: 30, color: COLORS.green, opacity: pillOp2, fontFamily: FONTS.body }}>Micro-transactions</div>
        <div style={{ padding: "10px 20px", border: `2px solid ${COLORS.green}`, borderRadius: 30, color: COLORS.green, opacity: pillOp3, fontFamily: FONTS.body }}>Programmable</div>
      </div>

    </AbsoluteFill>
  );
};

// ─── SCENE 14: THE GAP — FILLED ──────────────────────────────────────────────
export const Scene14: React.FC = () => {
  const frame = useCurrentFrame();

  const fillCenterW = interpolate(frame, [0, 40], [2, 600], { easing: Easing.bezier(0.2, 0, 0, 1), extrapolateRight: "clamp" });
  
  const lineOp = interpolate(frame, [140, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", display: "flex", flexDirection: "row" }}>
      
      {/* LEFT */}
      <div style={{ flex: 1, height: "100%", padding: 100, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 40, fontWeight: "bold", fontFamily: FONTS.headline, color: COLORS.white }}>THE TRUSTED PREDICTION MARKETS</div>
        <div style={{ fontSize: 24, fontFamily: FONTS.body, color: COLORS.gray, marginTop: 10 }}>✓ Great for event markets</div>
      </div>

      {/* CENTER */}
      <div style={{ width: fillCenterW, height: "100%", background: COLORS.greenDim, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {fillCenterW > 300 && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <Logo3D style={{ width: 150, height: 150 }} />
          </div>
        )}
      </div>

      {/* RIGHT */}
      <div style={{ flex: 1, height: "100%", padding: 100, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", textAlign: "right" }}>
        <div style={{ fontSize: 40, fontWeight: "bold", fontFamily: FONTS.headline, color: COLORS.green }}>THE HF LAYER</div>
        <div style={{ fontSize: 24, fontFamily: FONTS.body, color: COLORS.gray, marginTop: 10 }}>15 seconds or less</div>
      </div>

      {/* Text Overlay */}
      {frame > 140 && (
        <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
          <div style={{ textAlign: "center", opacity: lineOp }}>
            <div style={{ fontFamily: FONTS.headline, fontSize: 48, fontWeight: "bold", color: COLORS.white, marginBottom: 20 }}>15MARKET DOESN'T REPLACE POLYMARKET.</div>
            <div style={{ fontFamily: FONTS.headline, fontSize: 48, fontWeight: "bold", color: COLORS.green }}>IT FILLS THE GAP THEY LEFT.</div>
          </div>
        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};

// ─── SCENE 15: CLOSING ───────────────────────────────────────────────────────
export const Scene15: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo spring
  const logoScale = spring({ frame: Math.max(0, frame - 60), fps, config: { damping: 10, stiffness: 80 } });
  const lS = interpolate(logoScale, [0, 1], [0.3, 1]);
  const lX = interpolate(logoScale, [0, 1], [-700, 0]);
  const lY = interpolate(logoScale, [0, 1], [-400, 0]);

  // Sweep
  const sweepX = interpolate(frame, [60, 120], [-2000, 2000]);

  const text1Op = interpolate(frame - 150, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const text1Y = interpolate(frame - 150, [0, 20], [20, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  const text2Op = interpolate(frame - 190, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const text2Y = interpolate(frame - 190, [0, 20], [20, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const urlLen = interpolate(frame - 240, [0, 20], [0, 300], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });



  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      
      {/* Light Sweep */}
      {frame >= 60 && frame < 120 && (
        <div style={{ position: "absolute", width: 4, height: "100%", background: COLORS.green, boxShadow: `0 0 50px ${COLORS.green}`, transform: `translateX(${sweepX}px)`, zIndex: 10 }} />
      )}

      {frame >= 60 && (
        <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          
          <div style={{ display: "flex", alignItems: "center", transform: `translate(${lX}px, ${lY}px) scale(${lS})` }}>
            <Logo3D style={{ width: 400, height: 400 }} />
          </div>

          <div style={{ position: "absolute", bottom: 200, textAlign: "center" }}>
            <div style={{ fontFamily: FONTS.headline, fontWeight: 900, fontSize: 64, color: COLORS.white, opacity: text1Op, transform: `translateY(${text1Y}px)` }}>THE MARKET MOVES.</div>
            <div style={{ fontFamily: FONTS.headline, fontWeight: 900, fontSize: 64, color: COLORS.green, opacity: text2Op, transform: `translateY(${text2Y}px)`, textShadow: `0 0 30px ${COLORS.green}` }}>SO DO YOU.</div>
          </div>

          <div style={{ position: "absolute", bottom: 100, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: FONTS.terminal, fontSize: 28, color: COLORS.green, opacity: frame > 240 ? 1 : 0 }}>15market.online</div>
            <div style={{ width: urlLen, height: 2, background: COLORS.green, marginTop: 5 }} />
          </div>

        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};
