import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random, Easing } from "remotion";
import { COLORS, FONTS } from "../constants";
import { GlowPulse } from "../components/GlobalComponents";

// ─── SCENE 1: THE PREDICTION MARKET ERA ─────────────────────────────────────
export const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Frame 0-20: Dot expansion
  const dotScale = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
  
  // Frame 20-60: Network expansion
  const nodeProgress = interpolate(frame - 20, [0, 40], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  // Nodes setup
  const nodes = new Array(12).fill(0).map((_, i) => ({
    x: width / 2 + (random(`nx-${i}`) - 0.5) * 800 * nodeProgress,
    y: height / 2 + (random(`ny-${i}`) - 0.5) * 600 * nodeProgress,
  }));

  // Dollar amounts
  const amounts = ["$2.4B", "$847M", "$1.1B", "$340M"];

  // Headline
  const headlineOpacity = interpolate(frame - 120, [0, 30], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const headlineTracking = interpolate(frame - 120, [0, 30], [8, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      
      {/* Network Lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {nodes.map((n, i) => (
          i > 0 && (
            <line
              key={`line-${i}`}
              x1={nodes[0].x}
              y1={nodes[0].y}
              x2={n.x}
              y2={n.y}
              stroke={COLORS.greenDim}
              strokeWidth={2}
              opacity={nodeProgress}
            />
          )
        ))}
      </svg>

      {/* Nodes */}
      {nodes.map((n, i) => (
        <div
          key={`node-${i}`}
          style={{
            position: "absolute",
            left: n.x,
            top: n.y,
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: COLORS.green,
            transform: `translate(-50%, -50%) scale(${i === 0 ? dotScale : nodeProgress})`,
            boxShadow: `0 0 10px ${COLORS.green}`,
          }}
        >
          {i % 3 === 0 && <GlowPulse color={COLORS.green} />}
        </div>
      ))}

      {/* Amounts */}
      {amounts.map((amt, i) => {
        const startFrame = 60 + i * 15;
        const op = interpolate(frame - startFrame, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
        const yOffset = interpolate(frame - startFrame, [0, 15], [-10, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
        
        return (
          <div
            key={amt}
            style={{
              position: "absolute",
              left: nodes[i + 1].x + 20,
              top: nodes[i + 1].y + yOffset,
              color: COLORS.white,
              fontFamily: FONTS.terminal,
              fontSize: 24,
              opacity: op,
            }}
          >
            {amt}
          </div>
        );
      })}

      {/* Headline */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          width: "100%",
          textAlign: "center",
          color: COLORS.white,
          fontFamily: FONTS.headline,
          fontSize: 48,
          fontWeight: 700,
          opacity: headlineOpacity,
          letterSpacing: `${headlineTracking}px`,
        }}
      >
        PREDICTION MARKETS CHANGED EVERYTHING
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 2: THE GIANTS ─────────────────────────────────────────────────────
export const Scene2: React.FC = () => {
  const frame = useCurrentFrame();


  // Background
  const bgOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });

  // Pillar 1 (Polymarket)
  const p1Height = interpolate(frame, [0, 60], [0, 400], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateRight: "clamp" });
  const p1LogoOp = interpolate(frame - 40, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const p1Vol = Math.floor(interpolate(frame - 80, [0, 40], [0, 2.7], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }) * 10) / 10;

  // Pillar 2 (Kalshi)
  const p2Height = interpolate(frame - 30, [0, 60], [0, 400], { easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const p2LogoOp = interpolate(frame - 70, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const p2BadgeOp = interpolate(frame - 110, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });



  // Scene transition out
  const containerScale = interpolate(frame, [180, 240], [1.0, 1.05], { extrapolateRight: "clamp" });
  const containerOp = interpolate(frame - 240, [0, 30], [1, 0.6], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const titleOp = interpolate(frame - 180, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 100%, #0A2A0A, transparent)",
          opacity: bgOpacity,
        }}
      />
      
      <div style={{ position: "absolute", inset: 0, transform: `scale(${containerScale})`, opacity: containerOp }}>
        
        {/* Title */}
        <div style={{ position: "absolute", top: 200, width: "100%", textAlign: "center", color: COLORS.white, fontFamily: FONTS.headline, fontSize: 36, opacity: titleOp }}>
          THE MARKETS THAT BUILT TRUST
        </div>

        {/* Pillars container */}
        <div style={{ position: "absolute", bottom: 0, width: "100%", height: 500, display: "flex", justifyContent: "space-around", padding: "0 15%" }}>
          
          {/* Pillar 1 */}
          <div style={{ width: 340, height: p1Height, background: "rgba(0,230,118,0.15)", border: `1px solid ${COLORS.green}`, borderBottom: "none", position: "relative", alignSelf: "flex-end" }}>
            <div style={{ position: "absolute", top: -120, width: "100%", textAlign: "center", opacity: p1LogoOp }}>
              {/* Polymarket Placeholder */}
              <div style={{ color: "#7B3FE4", fontSize: 48, fontWeight: "bold", fontFamily: FONTS.headline }}>Polymarket</div>
              <div style={{ color: COLORS.gray, fontFamily: FONTS.terminal, marginTop: 20, opacity: p1Vol > 0 ? 1 : 0 }}>${p1Vol}B Total Volume</div>
            </div>
          </div>

          {/* Pillar 2 */}
          <div style={{ width: 340, height: p2Height, background: "rgba(0,230,118,0.15)", border: `1px solid ${COLORS.green}`, borderBottom: "none", position: "relative", alignSelf: "flex-end" }}>
            <div style={{ position: "absolute", top: -120, width: "100%", textAlign: "center", opacity: p2LogoOp }}>
              {/* Kalshi Placeholder */}
              <div style={{ color: "#FFFFFF", fontSize: 48, fontWeight: "bold", fontFamily: FONTS.headline }}>Kalshi</div>
              <div style={{ background: COLORS.greenDim, color: COLORS.green, padding: "5px 10px", borderRadius: 20, border: `1px solid ${COLORS.green}`, display: "inline-block", marginTop: 20, opacity: p2BadgeOp, fontFamily: FONTS.body }}>✓ US Regulated</div>
            </div>
          </div>

        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 3: BUT THEY TAKE TOO LONG ─────────────────────────────────────────
export const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardTranslateX = spring({ frame, fps, config: { damping: 15, stiffness: 100 } });
  const cardX = interpolate(cardTranslateX, [0, 1], [-500, 200]);

  // Particle sand
  const sand = new Array(200).fill(0).map((_, i) => ({
    delay: 60 + random(`sand-d-${i}`) * 100,
    x: random(`sand-x-${i}`) * 40 - 20,
  }));

  const text1Op = interpolate(frame - 80, [0, 20, 40, 60], [0, 1, 1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const text2Op = interpolate(frame - 110, [0, 20, 40, 60], [0, 1, 1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const text3Op = interpolate(frame - 140, [0, 20, 40, 60], [0, 1, 1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const hoursOp = interpolate(frame - 210, [0, 10], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const hoursY = spring({ frame: Math.max(0, frame - 210), fps, config: { damping: 15, stiffness: 300 } });
  const hoursYVal = interpolate(hoursY, [0, 1], [-200, 0]);

  const daysOp = interpolate(frame - 240, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const flashOp = interpolate(frame - 270, [0, 15, 30], [0, 0.15, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      
      {/* Prediction Card */}
      <div style={{ position: "absolute", left: cardX, top: 300, width: 400, background: "#0A1A0A", border: `2px solid ${COLORS.green}`, borderRadius: 16, padding: 30 }}>
        <div style={{ color: COLORS.white, fontFamily: FONTS.body, fontSize: 24, marginBottom: 20 }}>Will Bitcoin exceed $100k?</div>
        <div style={{ color: COLORS.gray, fontFamily: FONTS.terminal, fontSize: 16, marginBottom: 20 }}>Resolution: In 72 hours</div>
        <div style={{ width: "100%", height: 8, background: "#333", borderRadius: 4 }}>
          <div style={{ width: "0%", height: "100%", background: COLORS.green, borderRadius: 4 }} />
        </div>
      </div>

      {/* Hourglass/Time section */}
      <div style={{ position: "absolute", right: 300, top: 250, width: 300, height: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        
        {/* Timestamps */}
        <div style={{ position: "absolute", right: 350, fontFamily: FONTS.headline, fontSize: 48, color: COLORS.white, opacity: text1Op }}>1 HOUR...</div>
        <div style={{ position: "absolute", right: 350, fontFamily: FONTS.headline, fontSize: 48, color: COLORS.white, opacity: text2Op }}>12 HOURS...</div>
        <div style={{ position: "absolute", right: 350, fontFamily: FONTS.headline, fontSize: 48, color: COLORS.white, opacity: text3Op }}>24 HOURS...</div>

        {/* Sand particles */}
        {sand.map((s, i) => {
          const sy = interpolate(frame - s.delay, [0, 30], [100, 300], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
          const sop = interpolate(frame - s.delay, [0, 5, 25, 30], [0, 1, 1, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
          return (
            <div key={i} style={{ position: "absolute", left: 150 + s.x, top: sy, width: 4, height: 4, background: "#C8A96E", opacity: sop, borderRadius: "50%" }} />
          );
        })}
      </div>

      {/* Slam Text */}
      <div style={{ position: "absolute", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: FONTS.headline, fontWeight: 900, fontSize: 96, color: COLORS.white, opacity: hoursOp, transform: `translateY(${hoursYVal}px)` }}>HOURS.</div>
        <div style={{ fontFamily: FONTS.headline, fontWeight: 700, fontSize: 48, color: COLORS.gray, opacity: daysOp }}>SOMETIMES DAYS.</div>
      </div>

      {/* Red Flash */}
      <div style={{ position: "absolute", inset: 0, backgroundColor: COLORS.red, opacity: flashOp }} />

    </AbsoluteFill>
  );
};

// ─── SCENE 4: THE CRYPTO ALTERNATIVE ─────────────────────────────────────────
export const Scene4: React.FC = () => {
  const frame = useCurrentFrame();

  const isBlackFlash = frame < 3;
  if (isBlackFlash) return <AbsoluteFill style={{ backgroundColor: "#000" }} />;

  const candles = new Array(30).fill(0).map((_, i) => ({
    h: 20 + random(`ch-${i}`) * 60,
    isGreen: random(`cg-${i}`) > 0.5,
    delay: 30 + i * 3,
  }));

  const chartOp = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  
  const longOp = interpolate(frame, [90, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  
  const wipeFrame = 150;
  const wipeY = interpolate(frame, [wipeFrame, wipeFrame + 8], [-300, 0], { easing: Easing.bezier(0.4, 0, 1, 1), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const isWipeImpact = frame >= wipeFrame && frame < wipeFrame + 2;

  const liqOp = interpolate(frame, [wipeFrame + 10, wipeFrame + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glitchX = (frame % 5 === 0) ? -3 : (frame % 5 === 1) ? 3 : (frame % 5 === 2) ? -2 : (frame % 5 === 3) ? 2 : 0;

  const label1Op = interpolate(frame, [wipeFrame + 20, wipeFrame + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const label2Op = interpolate(frame, [wipeFrame + 30, wipeFrame + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const label3Op = interpolate(frame, [wipeFrame + 40, wipeFrame + 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const finalDesat = interpolate(frame, [270, 300], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", filter: `grayscale(${1 - finalDesat})` }}>
      
      {/* Chart */}
      <div style={{ position: "absolute", left: 100, top: 200, width: 1720, height: 600, display: "flex", alignItems: "center", opacity: chartOp }}>
        {candles.map((c, i) => {
          const cop = interpolate(frame, [c.delay, c.delay + 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ width: 40, margin: "0 5px", height: c.h, background: c.isGreen ? COLORS.green : COLORS.red, opacity: cop }} />
          );
        })}
        {/* Massive red candle */}
        {frame >= wipeFrame && (
          <div style={{ width: 60, height: 300, background: COLORS.red, transform: `translateY(${wipeY}px)` }} />
        )}
      </div>

      {/* Long Position */}
      <div style={{ position: "absolute", left: 800, top: 400, opacity: frame < wipeFrame ? longOp : 0 }}>
        <GlowPulse color={COLORS.green} />
        <div style={{ color: COLORS.green, fontFamily: FONTS.terminal, fontSize: 24 }}>ENTERED LONG 10x ↗</div>
      </div>

      {isWipeImpact && <div style={{ position: "absolute", inset: 0, backgroundColor: "#FFF" }} />}

      {/* Liquidation text */}
      <div style={{ position: "absolute", width: "100%", top: 500, textAlign: "center", opacity: liqOp, transform: `translateX(${glitchX}px)` }}>
        <span style={{ fontFamily: FONTS.headline, fontWeight: 900, fontSize: 120, color: COLORS.red }}>LIQUIDATED</span>
      </div>

      {/* Labels */}
      <div style={{ position: "absolute", left: 300, top: 200, color: COLORS.red, fontFamily: FONTS.headline, fontSize: 32, opacity: label1Op }}>STOP HUNT ↓</div>
      <div style={{ position: "absolute", right: 400, top: 300, color: COLORS.red, fontFamily: FONTS.headline, fontSize: 32, opacity: label2Op }}>LIQUIDATION 💥</div>
      <div style={{ position: "absolute", left: 500, top: 700, color: COLORS.red, fontFamily: FONTS.headline, fontSize: 32, opacity: label3Op }}>MARGIN CALL ⚠</div>

    </AbsoluteFill>
  );
};

// ─── SCENE 5: THE MEMECOIN NIGHTMARE ─────────────────────────────────────────
export const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Glitch transition
  const isTransitioning = frame < 15;
  // Cemetery

  // Cemetery
  const tombstones = [
    { name: "$SAFEMOON_INU", desc: "Rugged at launch", icon: "💀" },
    { name: "$FAST_GAINS", desc: "Honeypot contract", icon: "⚠" },
    { name: "$MOONSHOT_2024", desc: "Dev wallet dumped", icon: "💥" },
    { name: "$YOUR_SAVINGS", desc: "Wrong place.", icon: "", isHero: true },
    { name: "$DEFI_ALPHA", desc: "Exit scammed", icon: "📉" },
    { name: "$100x_GUARANTEED", desc: "Never existed", icon: "👻" },
  ];

  const textCycle = (frame % 30) / 30;
  const textColor = textCycle < 0.5 ? COLORS.red : "#FF6B6B";

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {isTransitioning && (
        <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)`, zIndex: 10 }} />
      )}

      {/* Ground */}
      <div style={{ position: "absolute", bottom: 0, width: "100%", height: "30%", background: "#050505", borderTop: "2px solid #111" }} />

      {/* Tombstones */}
      <div style={{ position: "absolute", width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: "25%", gap: 40 }}>
        {tombstones.map((t, i) => {
          const delay = 110 + i * 25;
          const y = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 20, stiffness: 150 } });
          const yVal = interpolate(y, [0, 1], [200, 0]);
          
          return (
            <div key={i} style={{ 
              width: t.isHero ? 280 : 220, 
              height: t.isHero ? 350 : 280, 
              background: "#1A1A1A", 
              border: `2px solid ${t.isHero ? COLORS.gold : "#333"}`, 
              borderRadius: "100px 100px 0 0", 
              transform: `translateY(${yVal}px)`,
              display: "flex", flexDirection: "column", alignItems: "center", padding: 30,
              boxShadow: t.isHero ? `0 0 30px ${COLORS.gold}33` : "none"
            }}>
              <div style={{ fontSize: 40 }}>{t.icon}</div>
              <div style={{ color: t.isHero ? COLORS.gold : COLORS.white, fontFamily: FONTS.terminal, fontWeight: "bold", fontSize: t.isHero ? 24 : 18, marginTop: 20, textAlign: "center" }}>{t.name}</div>
              <div style={{ color: COLORS.gray, fontFamily: FONTS.body, fontSize: 16, marginTop: 10, textAlign: "center" }}>{t.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom Text */}
      <div style={{ position: "absolute", bottom: 50, width: "100%", textAlign: "center", opacity: interpolate(frame, [260, 290], [0, 1], { extrapolateLeft: "clamp" }) }}>
        <span style={{ fontFamily: FONTS.headline, fontWeight: 900, fontSize: 56, color: textColor, textShadow: `0 0 20px ${COLORS.red}` }}>RUGS. HONEYPOTS. SCAMS.</span>
      </div>
      
    </AbsoluteFill>
  );
};
