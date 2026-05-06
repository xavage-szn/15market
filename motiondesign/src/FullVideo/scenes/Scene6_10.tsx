import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random, Easing } from "remotion";
import { COLORS, FONTS } from "../constants";
import { Logo3D, TerminalText } from "../components/GlobalComponents";

// ─── SCENE 6: THE GAP ────────────────────────────────────────────────────────
export const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  // Split line
  const splitH = interpolate(frame, [0, 30], [0, 100], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  // Left/Right fade
  const sideOp = interpolate(frame, [15, 45], [0, 0.5], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Center void expand
  const centerW = interpolate(frame - 60, [0, 30], [2, width * 0.4], { easing: Easing.bezier(0.2, 0, 0, 1), extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const line1Op = interpolate(frame - 80, [0, 10], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const line2Op = interpolate(frame - 110, [0, 10], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const line3Op = interpolate(frame - 130, [0, 10], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const linesFade = interpolate(frame - 150, [0, 10], [1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  const questionRotate = interpolate(frame, [0, 100], [0, 360], { extrapolateRight: "wrap" });

  const explosionFrame = 150; // question mark shatters
  const isExploded = frame > explosionFrame;

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", display: "flex", flexDirection: "row" }}>
      
      {/* LEFT SIDE */}
      <div style={{ flex: 1, height: "100%", padding: 100, display: "flex", flexDirection: "column", justifyContent: "center", opacity: sideOp, filter: "grayscale(1)" }}>
        <div style={{ fontSize: 48, fontWeight: "bold", fontFamily: FONTS.headline, color: COLORS.white }}>TRUSTED</div>
        <div style={{ fontSize: 24, fontFamily: FONTS.body, color: COLORS.gray }}>But slow. Days to settle.</div>
      </div>

      {/* CENTER LINE / VOID */}
      <div style={{ width: centerW, height: `${splitH}%`, background: centerW > 2 ? "#000" : COLORS.white, alignSelf: "center", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        
        {frame < explosionFrame && (
          <div style={{ position: "absolute", opacity: linesFade, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontFamily: FONTS.terminal, fontSize: 28, color: COLORS.green, opacity: line1Op }}>FAST MARKETS</div>
            <div style={{ fontFamily: FONTS.terminal, fontSize: 28, color: COLORS.green, opacity: line2Op }}>REAL ASSETS</div>
            <div style={{ fontFamily: FONTS.terminal, fontSize: 28, color: COLORS.green, opacity: line3Op }}>ZERO SCAM RISK</div>
          </div>
        )}

        {frame >= explosionFrame - 20 && !isExploded && (
          <div style={{ position: "absolute", fontFamily: FONTS.headline, fontWeight: 900, fontSize: 96, color: COLORS.green }}>
            <div style={{ transform: `rotate(${questionRotate}deg)` }}>?</div>
          </div>
        )}

        {isExploded && (
          <div style={{ position: "absolute" }}>
            {new Array(100).fill(0).map((_, i) => {
              const dx = (random(`ex-${i}`) - 0.5) * 1000;
              const dy = (random(`ey-${i}`) - 0.5) * 1000;
              const f = frame - explosionFrame;
              const x = interpolate(f, [0, 60], [0, dx], { easing: Easing.out(Easing.cubic) });
              const y = interpolate(f, [0, 60], [0, dy], { easing: Easing.out(Easing.cubic) });
              const op = interpolate(f, [0, 60], [1, 0]);
              return (
                <div key={i} style={{ position: "absolute", width: 4, height: 4, background: COLORS.white, transform: `translate(${x}px, ${y}px)`, opacity: op }} />
              );
            })}
          </div>
        )}

      </div>

      {/* RIGHT SIDE */}
      <div style={{ flex: 1, height: "100%", padding: 100, display: "flex", flexDirection: "column", justifyContent: "center", opacity: sideOp, backgroundColor: "rgba(255,59,59,0.05)" }}>
        <div style={{ fontSize: 48, fontWeight: "bold", fontFamily: FONTS.headline, color: COLORS.red }}>FAST</div>
        <div style={{ fontSize: 24, fontFamily: FONTS.body, color: COLORS.gray }}>But dangerous. Rugs. Liquidations.</div>
      </div>

    </AbsoluteFill>
  );
};

// ─── SCENE 7: 15MARKET ARRIVES (HERO MOMENT) ─────────────────────────────────
export const Scene7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 0-30: Pure black
  // 30-60: Impact flash
  const impactOp = interpolate(frame - 30, [0, 4, 8], [0, 1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const shakeX = frame >= 30 && frame < 45 ? Math.sin(frame * Math.PI) * 10 * interpolate(frame - 30, [0, 15], [1, 0]) : 0;

  // Logo Reveal
  const logoScale = spring({ frame: Math.max(0, frame - 60), fps, config: { damping: 10, stiffness: 100 } });
  const logoScaleVal = interpolate(logoScale, [0, 1], [0, 1]); // Spring goes 0 -> 1.2 -> 1
  const logoRotateY = Math.sin((frame - 60) * 0.05) * 5;

  const marketTextX = interpolate(frame - 120, [0, 30], [60, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const marketTextOp = interpolate(frame - 120, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const taglineOp = interpolate(frame - 180, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const conicRotate = frame * 2;

  // Coins
  const coins = ["BTC", "ETH", "SOL", "LINK", "XRP"];

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", transform: `translateX(${shakeX}px)` }}>
      
      {impactOp > 0 && <AbsoluteFill style={{ backgroundColor: COLORS.white, opacity: impactOp, zIndex: 100 }} />}

      {frame >= 60 && (
        <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent" }}>
          {/* Conic Burst */}
          <div style={{ position: "absolute", width: 1000, height: 1000, borderRadius: "50%", opacity: 0.3, background: `conic-gradient(from ${conicRotate}deg, transparent, rgba(0,230,118,0.5), transparent)` }} />
          
          <div style={{ display: "flex", alignItems: "center", transform: `scale(${logoScaleVal}) rotateY(${logoRotateY}deg)` }}>
            {/* 3D 15 Logo */}
            <Logo3D style={{ width: 400, height: 400 }} />
          </div>

          {/* Orbits */}
          {frame >= 120 && coins.map((c, i) => {
            const f = frame - 120 - i * 20;
            if (f < 0) return null;
            const angle = (f * 1) % 360;
            const rad = (angle * Math.PI) / 180;
            const rx = 400;
            const ry = 150;
            const x = Math.cos(rad) * rx;
            const y = Math.sin(rad) * ry;
            
            return (
              <div key={i} style={{ position: "absolute", width: 60, height: 60, borderRadius: "50%", background: "#111", border: `2px solid ${COLORS.green}`, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.white, fontWeight: "bold", transform: `translate(${x}px, ${y}px)`, zIndex: Math.sin(rad) > 0 ? 10 : -1 }}>
                {c}
              </div>
            );
          })}

          <div style={{ position: "absolute", bottom: 200, opacity: taglineOp }}>
            <TerminalText text="THE MARKET MOVES. SO DO YOU." style={{ fontSize: 28 }} delay={180} />
          </div>
        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};

// ─── SCENE 8: REAL ASSETS. ZERO SCAM RISK. ───────────────────────────────────
export const Scene8: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo transitions to corner
  const logoScale = spring({ frame, fps, config: { damping: 15, stiffness: 100 } });
  const sScale = interpolate(logoScale, [0, 1], [1, 0.3]);
  const sX = interpolate(logoScale, [0, 1], [0, -700]);
  const sY = interpolate(logoScale, [0, 1], [0, -400]);

  const assets = ["BTC", "ETH", "SOL"];

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      
      {/* Persistent Logo */}
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) translate(${sX}px, ${sY}px) scale(${sScale})`, display: "flex", alignItems: "center" }}>
        <Logo3D style={{ width: 300, height: 300 }} />
      </div>

      {/* Grid */}
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -40%)", display: "flex", justifyContent: "center", gap: 30, width: 1200 }}>
        {assets.map((a, i) => {
          const delay = 60 + i * 20;
          const s = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 15 } });
          const price = 100 + Math.sin(frame * 0.1 + i) * 10;
          
          return (
            <div key={i} style={{ background: "#0A1A0A", border: `1px solid ${COLORS.green}66`, borderRadius: 16, padding: 30, transform: `scale(${s})`, opacity: s }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: COLORS.white, fontSize: 24, fontWeight: "bold" }}>{a}</div>
                <div style={{ background: COLORS.greenDim, color: COLORS.green, padding: "4px 8px", borderRadius: 4, fontSize: 12 }}>✓ VERIFIED</div>
              </div>
              <div style={{ fontFamily: FONTS.terminal, color: COLORS.green, fontSize: 32, marginTop: 20 }}>
                ${price.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {frame > 120 && (
        <div style={{ position: "absolute", top: "70%", width: "100%", textAlign: "center", opacity: interpolate(frame, [120, 150], [0, 1]) }}>
           <div style={{ color: COLORS.gray, fontFamily: FONTS.body, fontSize: 24 }}>More assets coming soon...</div>
           <div style={{ color: COLORS.white, fontFamily: FONTS.headline, fontSize: 28, marginTop: 10 }}>FOREX • METALS • STOCKS</div>
        </div>
      )}

      {/* Comparisons */}
      {frame > 180 && (
        <AbsoluteFill style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "flex-end", paddingBottom: 100, gap: 100 }}>
          <div style={{ opacity: interpolate(frame, [180, 200], [0, 1]) }}>
            <div style={{ color: COLORS.red, fontSize: 24, marginBottom: 10 }}>❌ Unknown smart contracts</div>
            <div style={{ color: COLORS.red, fontSize: 24, marginBottom: 10 }}>❌ Rug pull possible</div>
          </div>
          <div style={{ opacity: interpolate(frame, [200, 220], [0, 1]) }}>
            <div style={{ color: COLORS.green, fontSize: 24, marginBottom: 10 }}>✓ Bitcoin's price — public data</div>
            <div style={{ color: COLORS.green, fontSize: 24, marginBottom: 10 }}>✓ Outcome verified by anyone</div>
          </div>
        </AbsoluteFill>
      )}

      {frame > 240 && (
        <div style={{ position: "absolute", bottom: 40, width: "100%", textAlign: "center" }}>
          <TerminalText text="THE PRICE EITHER WENT UP OR DOWN." delay={240} style={{ fontSize: 28, color: COLORS.white }} />
        </div>
      )}

    </AbsoluteFill>
  );
};

// ─── SCENE 9: 15 SECONDS ─────────────────────────────────────────────────────
export const Scene9: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // UI Slides in
  const uiY = spring({ frame, fps, config: { damping: 15 } });
  const translateY = interpolate(uiY, [0, 1], [1000, 0]);

  // Chart line drawing
  const pathLen = 800;
  const draw = interpolate(frame - 30, [0, 60], [pathLen, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Countdown
  const countdownStart = 120;
  const t = Math.max(0, frame - countdownStart);
  const secondsLeft = Math.max(0, 15 - Math.floor(t / fps));
  
  // Countdown pop
  const pop = spring({ frame: t % fps, fps, config: { damping: 20, stiffness: 400 } });
  const popScale = secondsLeft > 0 ? interpolate(pop, [0, 1], [1.2, 1.0]) : 1;

  // Ring Explosion
  const isZero = secondsLeft === 0 && t > 0;
  const explode = spring({ frame: isZero ? frame - (countdownStart + 15 * fps) : 0, fps });
  const exScale = interpolate(explode, [0, 1], [1, 3]);
  const exOp = interpolate(explode, [0, 1], [1, 0]);

  // Chart win movement
  const winY = isZero ? interpolate(frame - (countdownStart + 15 * fps), [0, 20], [200, 150], { easing: Easing.out(Easing.cubic) }) : 200;

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", justifyContent: "center", alignItems: "center" }}>
      
      {/* Mobile App UI Mock */}
      <div style={{ width: 600, height: 900, background: "#111", border: "1px solid #333", borderRadius: 40, transform: `translateY(${translateY}px)`, position: "relative", overflow: "hidden" }}>
        
        <div style={{ height: 400, borderBottom: "1px solid #333", position: "relative" }}>
          {/* Chart SVG */}
          <svg style={{ width: "100%", height: "100%" }}>
            <path 
              d={`M0,300 Q100,280 200,${winY} T400,${winY - 20} T600,${winY}`} 
              stroke={COLORS.green} 
              strokeWidth={4} 
              fill="none" 
              strokeDasharray={pathLen} 
              strokeDashoffset={draw} 
            />
            {frame > countdownStart && <line x1="0" y1="200" x2="600" y2="200" stroke="#FFF" strokeDasharray="5,5" strokeWidth={2} />}
          </svg>
        </div>

        <div style={{ padding: 40 }}>
          <div style={{ display: "flex", gap: 20, marginBottom: 40 }}>
            <div style={{ flex: 1, height: 60, background: COLORS.green, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: "bold", fontSize: 20 }}>CALL</div>
            <div style={{ flex: 1, height: 60, background: "#222", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.white, fontWeight: "bold", fontSize: 20 }}>PUT</div>
          </div>

          <div style={{ fontSize: 40, color: COLORS.white, textAlign: "center", fontFamily: FONTS.terminal }}>
            $100.00
          </div>
          
          <div style={{ marginTop: 40, height: 80, background: COLORS.green, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: "bold", fontSize: 24 }}>
            CONFIRM
          </div>
        </div>

        {/* Countdown Overlay */}
        {frame >= countdownStart && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
            <div style={{ width: 200, height: 200, borderRadius: "50%", border: `8px solid ${COLORS.green}`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${isZero ? exScale : popScale})`, opacity: isZero ? exOp : 1, boxShadow: `0 0 30px ${COLORS.green}` }}>
              {!isZero && <div style={{ fontSize: 80, color: COLORS.white, fontWeight: "bold", fontFamily: FONTS.terminal }}>{secondsLeft}</div>}
            </div>
          </div>
        )}

      </div>

      {isZero && <div style={{ position: "absolute", inset: 0, backgroundColor: COLORS.green, opacity: interpolate(frame - (countdownStart + 15 * fps), [0, 10, 20], [0, 0.5, 0]) }} />}
    </AbsoluteFill>
  );
};

// ─── SCENE 10: INSTANT WIN ───────────────────────────────────────────────────
export const Scene10: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isFlash = frame < 4;
  if (isFlash) return <AbsoluteFill style={{ backgroundColor: COLORS.white }} />;

  const winScale = spring({ frame: frame - 4, fps, config: { damping: 8, stiffness: 200 } });
  const wS = interpolate(winScale, [0, 1], [0, 1]); // Spring bounce

  const balance = Math.floor(interpolate(frame, [60, 120], [200, 350], { extrapolateRight: "clamp" }));

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", justifyContent: "center", alignItems: "center" }}>
      {/* Win text */}
      <div style={{ transform: `scale(${wS})`, textAlign: "center" }}>
        <div style={{ fontFamily: FONTS.headline, fontSize: 120, fontWeight: 900, color: COLORS.gold, textShadow: `0 0 40px ${COLORS.gold}66` }}>
          +$150 USDC
        </div>
      </div>

      {/* Top right balance */}
      <div style={{ position: "absolute", top: 40, right: 40, background: "#111", padding: "10px 20px", borderRadius: 12, border: `1px solid ${COLORS.green}`, color: COLORS.white, fontFamily: FONTS.headline, fontSize: 32, display: "flex", alignItems: "center" }}>
        <div style={{ color: COLORS.gray, fontSize: 16, marginRight: 10 }}>BALANCE</div>
        ${balance}.00
      </div>

      <div style={{ position: "absolute", top: 120, right: 40 }}>
        <TerminalText text="CREDITED INSTANTLY" delay={60} style={{ fontSize: 20 }} />
      </div>

    </AbsoluteFill>
  );
};
