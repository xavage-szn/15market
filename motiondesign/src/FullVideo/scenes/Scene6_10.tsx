import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random, Easing } from "remotion";
import { COLORS, FONTS } from "../constants";
import { Logo3D, TerminalText, JitterScroll, AmbientGlow } from "../components/GlobalComponents";

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
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: FONTS.headline, color: COLORS.gray, marginBottom: 10 }}>PREDICTION MARKETS</div>
        <div style={{ fontSize: 64, fontWeight: 900, fontFamily: FONTS.headline, color: COLORS.white }}>TRUSTED</div>
        <div style={{ fontSize: 32, fontWeight: 600, fontFamily: FONTS.body, color: COLORS.gray }}>But slow. Days to settle.</div>
      </div>

      {/* CENTER LINE / VOID */}
      <div style={{ width: centerW, height: `${splitH}%`, background: centerW > 2 ? "#000" : COLORS.white, alignSelf: "center", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        
        {frame < explosionFrame && (
          <div style={{ position: "absolute", opacity: linesFade, display: "flex", flexDirection: "column", gap: 20, textAlign: "center" }}>
            <div style={{ fontFamily: FONTS.headline, fontWeight: 800, fontSize: 36, color: COLORS.green, opacity: line1Op }}>FAST MARKETS</div>
            <div style={{ fontFamily: FONTS.headline, fontWeight: 800, fontSize: 36, color: COLORS.green, opacity: line2Op }}>REAL ASSETS</div>
            <div style={{ fontFamily: FONTS.headline, fontWeight: 800, fontSize: 36, color: COLORS.green, opacity: line3Op }}>ZERO SCAM RISK</div>
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
      <div style={{ flex: 1, height: "100%", padding: 100, display: "flex", flexDirection: "column", justifyContent: "center", opacity: sideOp, backgroundColor: "rgba(255,59,59,0.05)", position: "relative" }}>
        
        <div style={{ position: "relative", height: 60, marginBottom: 10, width: "100%" }}>
          <JitterScroll items={["Futures", "Perps", "Memecoins"]} speed={8} itemHeight={60} align="flex-start" style={{ position: "absolute", width: "100%", left: 0 }} />
        </div>

        <div style={{ fontSize: 64, fontWeight: 900, fontFamily: FONTS.headline, color: COLORS.red }}>FAST</div>
        <div style={{ fontSize: 32, fontWeight: 600, fontFamily: FONTS.body, color: COLORS.gray }}>But dangerous. Rugs. Liquidations.</div>
      </div>

    </AbsoluteFill>
  );
};

// ─── SCENE 7: 15MARKET ARRIVES (HERO MOMENT) ─────────────────────────────────
export const Scene7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const impactOp = interpolate(frame - 30, [0, 4, 8], [0, 1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  // Elegant abstract logo reveal
  const logoScale = spring({ frame: Math.max(0, frame - 60), fps, config: { damping: 12, stiffness: 80 } });
  const logoScaleVal = interpolate(logoScale, [0, 1], [0.8, 1]); // Subtle scale in
  const logoBlur = interpolate(logoScale, [0, 1], [20, 0]);
  const logoOp = interpolate(logoScale, [0, 1], [0, 1]);

  const taglineOp = interpolate(frame - 180, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#020402" }}>
      
      {impactOp > 0 && <AbsoluteFill style={{ backgroundColor: COLORS.white, opacity: impactOp, zIndex: 100 }} />}

      {frame >= 60 && (
        <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent" }}>
          
          <AmbientGlow color={COLORS.green} xOffset={-300} yOffset={-100} delay={60} />
          <AmbientGlow color={COLORS.greenGlow} xOffset={300} yOffset={200} delay={80} />

          {/* Abstract Data Streams (Vertical lines) */}
          {new Array(5).fill(0).map((_, i) => {
            const h = interpolate((frame + i * 20) % 100, [0, 100], [0, 1000]);
            const y = interpolate((frame + i * 20) % 100, [0, 100], [1080, -1000]);
            return (
              <div key={i} style={{ position: "absolute", left: `${20 + i * 15}%`, top: y, width: 1, height: h, background: `linear-gradient(to bottom, transparent, ${COLORS.green}33, transparent)` }} />
            );
          })}
          
          <div style={{ display: "flex", alignItems: "center", transform: `scale(${logoScaleVal})`, opacity: logoOp, filter: `blur(${logoBlur}px)` }}>
            {/* 3D 15 Logo */}
            <Logo3D style={{ width: 450, height: 450 }} />
          </div>

          <div style={{ position: "absolute", bottom: 200, opacity: taglineOp }}>
            <TerminalText text="THE MARKET MOVES. SO DO YOU." style={{ fontSize: 24, letterSpacing: "8px", fontWeight: 300, color: COLORS.gray }} delay={180} />
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

  // Logo gracefully drifts to the corner
  const logoScale = spring({ frame, fps, config: { damping: 20, stiffness: 60 } });
  const sScale = interpolate(logoScale, [0, 1], [1, 0.25]);
  const sX = interpolate(logoScale, [0, 1], [0, -750]);
  const sY = interpolate(logoScale, [0, 1], [0, -420]);

  const assets = ["BTC", "ETH", "SOL"];

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      
      <AmbientGlow color={COLORS.green} xOffset={0} yOffset={0} />

      {/* Persistent Logo */}
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) translate(${sX}px, ${sY}px) scale(${sScale})`, display: "flex", alignItems: "center", opacity: 0.5 }}>
        <Logo3D style={{ width: 450, height: 450 }} />
      </div>

      {/* Futuristic Floating Assets */}
      <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%, -50%)", display: "flex", justifyContent: "center", gap: 60, width: 1200 }}>
        {assets.map((a, i) => {
          const delay = 60 + i * 15;
          const s = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 15 } });
          const price = 100 + Math.sin(frame * 0.05 + i) * 10;
          const blur = interpolate(s, [0, 1], [20, 0]);
          const yOff = interpolate(s, [0, 1], [100, 0]);
          
          return (
            <div key={i} style={{ 
              background: "rgba(255,255,255,0.02)", 
              border: "1px solid rgba(0,230,118,0.1)", 
              borderRadius: 30, 
              padding: "40px 60px", 
              transform: `translateY(${yOff}px) scale(${s})`, 
              opacity: s,
              filter: `blur(${blur}px)`,
              backdropFilter: "blur(20px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}>
              <div style={{ color: COLORS.white, fontSize: 32, fontWeight: 800, fontFamily: FONTS.headline, letterSpacing: "2px" }}>{a}</div>
              <div style={{ fontFamily: FONTS.body, color: COLORS.gray, fontSize: 16, marginTop: 10, letterSpacing: "1px" }}>VERIFIED</div>
              <div style={{ fontFamily: FONTS.terminal, color: COLORS.greenGlow, fontSize: 40, marginTop: 30, fontWeight: 300 }}>
                ${price.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {frame > 120 && (
        <div style={{ position: "absolute", top: "70%", width: "100%", textAlign: "center", opacity: interpolate(frame, [120, 150], [0, 1]) }}>
           <div style={{ color: COLORS.gray, fontFamily: FONTS.body, fontSize: 18, letterSpacing: "4px" }}>MORE ASSETS COMING SOON</div>
           <div style={{ color: COLORS.white, fontFamily: FONTS.headline, fontSize: 24, marginTop: 20, letterSpacing: "8px", fontWeight: 300 }}>FOREX  •  METALS  •  STOCKS</div>
        </div>
      )}

      {frame > 240 && (
        <div style={{ position: "absolute", bottom: 60, width: "100%", textAlign: "center" }}>
          <TerminalText text="THE PRICE EITHER WENT UP OR DOWN." delay={240} style={{ fontSize: 24, letterSpacing: "4px", color: COLORS.gray }} />
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
  const uiY = spring({ frame, fps, config: { damping: 20 } });
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
  const popScale = secondsLeft > 0 ? interpolate(pop, [0, 1], [1.1, 1.0]) : 1;

  // Ring Explosion
  const isZero = secondsLeft === 0 && t > 0;
  const explode = spring({ frame: isZero ? frame - (countdownStart + 15 * fps) : 0, fps });
  const exScale = interpolate(explode, [0, 1], [1, 5]);
  const exOp = interpolate(explode, [0, 1], [0.5, 0]);

  // Chart win movement
  const winY = isZero ? interpolate(frame - (countdownStart + 15 * fps), [0, 20], [200, 150], { easing: Easing.out(Easing.cubic) }) : 200;

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", justifyContent: "center", alignItems: "center" }}>
      
      <AmbientGlow color={COLORS.greenGlow} xOffset={0} yOffset={200} delay={0} />

      {/* Futuristic Mobile App UI Mock */}
      <div style={{ 
        width: 600, height: 900, 
        background: "rgba(10,15,10,0.6)", 
        border: "1px solid rgba(0,230,118,0.2)", 
        borderRadius: 40, 
        transform: `translateY(${translateY}px)`, 
        position: "relative", 
        overflow: "hidden",
        backdropFilter: "blur(40px)",
        boxShadow: "0 40px 100px rgba(0,0,0,0.8)"
      }}>
        
        <div style={{ height: 400, position: "relative" }}>
          {/* Chart SVG */}
          <svg style={{ width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.green} stopOpacity="0.3" />
                <stop offset="100%" stopColor={COLORS.green} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path 
              d={`M0,300 Q100,280 200,${winY} T400,${winY - 20} T600,${winY}`} 
              stroke={COLORS.green} 
              strokeWidth={4} 
              fill="none" 
              strokeDasharray={pathLen} 
              strokeDashoffset={draw} 
              style={{ filter: "drop-shadow(0 0 10px rgba(0,230,118,0.8))" }}
            />
            {frame > countdownStart && <line x1="0" y1="200" x2="600" y2="200" stroke="rgba(255,255,255,0.2)" strokeDasharray="5,5" strokeWidth={2} />}
          </svg>
        </div>

        <div style={{ padding: 40 }}>
          <div style={{ display: "flex", gap: 20, marginBottom: 40 }}>
            <div style={{ flex: 1, height: 70, background: "linear-gradient(135deg, rgba(0,230,118,0.8), rgba(0,255,136,0.4))", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 800, fontSize: 24, letterSpacing: "2px", fontFamily: FONTS.headline }}>CALL</div>
            <div style={{ flex: 1, height: 70, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.white, fontWeight: 800, fontSize: 24, letterSpacing: "2px", fontFamily: FONTS.headline }}>PUT</div>
          </div>

          <div style={{ fontSize: 56, color: COLORS.white, textAlign: "center", fontFamily: FONTS.terminal, fontWeight: 300, letterSpacing: "2px" }}>
            $100.00
          </div>
          
          <div style={{ marginTop: 40, height: 80, background: "rgba(0,230,118,0.1)", border: `1px solid ${COLORS.green}`, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.green, fontWeight: 800, fontSize: 24, letterSpacing: "4px", fontFamily: FONTS.headline }}>
            CONFIRM
          </div>
        </div>

        {/* Countdown Overlay */}
        {frame >= countdownStart && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)" }}>
            <div style={{ width: 250, height: 250, borderRadius: "50%", border: `2px solid rgba(0,230,118,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${isZero ? exScale : popScale})`, opacity: isZero ? exOp : 1, boxShadow: `inset 0 0 50px rgba(0,230,118,0.2)` }}>
              {!isZero && <div style={{ fontSize: 100, color: COLORS.white, fontWeight: 300, fontFamily: FONTS.terminal }}>{secondsLeft}</div>}
            </div>
          </div>
        )}

      </div>

      {isZero && <div style={{ position: "absolute", inset: 0, backgroundColor: COLORS.greenGlow, opacity: interpolate(frame - (countdownStart + 15 * fps), [0, 10, 20], [0, 0.2, 0]) }} />}
    </AbsoluteFill>
  );
};

// ─── SCENE 10: INSTANT WIN ───────────────────────────────────────────────────
export const Scene10: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isFlash = frame < 4;
  if (isFlash) return <AbsoluteFill style={{ backgroundColor: COLORS.white }} />;

  const winScale = spring({ frame: frame - 4, fps, config: { damping: 10, stiffness: 150 } });
  const wS = interpolate(winScale, [0, 1], [0.5, 1]); 

  const balance = Math.floor(interpolate(frame, [60, 120], [200, 350], { extrapolateRight: "clamp" }));

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", justifyContent: "center", alignItems: "center" }}>
      
      <AmbientGlow color={COLORS.gold} xOffset={0} yOffset={0} delay={0} />

      {/* Win text */}
      <div style={{ transform: `scale(${wS})`, textAlign: "center" }}>
        <div style={{ fontFamily: FONTS.terminal, fontSize: 160, fontWeight: 300, color: COLORS.gold, textShadow: `0 0 80px ${COLORS.gold}44`, letterSpacing: "4px" }}>
          +$150<span style={{ fontSize: 80 }}>.00</span>
        </div>
      </div>

      {/* Top right balance */}
      <div style={{ position: "absolute", top: 60, right: 60, background: "rgba(255,255,255,0.05)", padding: "20px 40px", borderRadius: 20, border: `1px solid rgba(0,230,118,0.2)`, color: COLORS.white, fontFamily: FONTS.terminal, fontSize: 36, display: "flex", alignItems: "center", backdropFilter: "blur(20px)" }}>
        <div style={{ color: COLORS.gray, fontSize: 16, marginRight: 20, letterSpacing: "2px", fontFamily: FONTS.headline }}>BALANCE</div>
        <span style={{ color: COLORS.greenGlow }}>${balance}.00</span>
      </div>

      <div style={{ position: "absolute", top: 200, right: 60 }}>
        <TerminalText text="CREDITED INSTANTLY" delay={60} style={{ fontSize: 24, letterSpacing: "4px" }} />
      </div>

    </AbsoluteFill>
  );
};
