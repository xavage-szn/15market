import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random, Easing, Img, staticFile } from "remotion";
import { COLORS, FONTS } from "../constants";
import { Logo3D, TerminalText, JitterScroll, AmbientGlow, AnimatedCursor } from "../components/GlobalComponents";
import type { CursorWaypoint } from "../components/GlobalComponents";

// ─── SCENE 6: THE GAP ────────────────────────────────────────────────────────
export const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  // Split line
  const { fps } = useVideoConfig();

  // The split animation
  const splitH = interpolate(frame, [0, 20], [0, 100], { extrapolateRight: "clamp" });
  
  // Pushing sides apart
  const pushS = spring({ frame: Math.max(0, frame - 40), fps, config: { damping: 15, stiffness: 100 } });
  const pushX = interpolate(pushS, [0, 1], [0, 400]); // Pushes each side by 400px
  const sideOp = interpolate(frame, [0, 15], [0, 1]);

  // Central solutions reveal
  const features = ["FAST MARKETS", "REAL ASSETS", "ZERO SCAM RISK"];

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      
      {/* LEFT SIDE - Pushes Left */}
      <div style={{ 
        position: "absolute", 
        left: `calc(0% - ${pushX}px)`, 
        top: 0, 
        width: "50%", 
        height: "100%", 
        padding: 100, 
        display: "flex", 
        flexDirection: "column", 
        justifyContent: "center", 
        opacity: sideOp 
      }}>
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: FONTS.headline, color: COLORS.gray, marginBottom: 10 }}>PREDICTION MARKETS</div>
        <div style={{ fontSize: 64, fontWeight: 900, fontFamily: FONTS.headline, color: COLORS.white }}>TRUSTED</div>
        <div style={{ fontSize: 32, fontWeight: 600, fontFamily: FONTS.body, color: COLORS.gray }}>But slow. Days to settle.</div>
      </div>

      {/* RIGHT SIDE - Pushes Right */}
      <div style={{ 
        position: "absolute", 
        right: `calc(0% - ${pushX}px)`, 
        top: 0, 
        width: "50%", 
        height: "100%", 
        padding: 100, 
        display: "flex", 
        flexDirection: "column", 
        justifyContent: "center", 
        opacity: sideOp 
      }}>
        <div style={{ position: "relative", height: 60, marginBottom: 10, width: "100%" }}>
          <JitterScroll items={["Futures", "Perps", "Memecoins"]} speed={8} itemHeight={60} align="flex-start" />
        </div>
        <div style={{ fontSize: 64, fontWeight: 900, fontFamily: FONTS.headline, color: COLORS.red }}>FAST</div>
        <div style={{ fontSize: 32, fontWeight: 600, fontFamily: FONTS.body, color: COLORS.gray }}>But dangerous. Rugs. Liquidations.</div>
      </div>

      {/* CENTER LINE divider */}
      <div style={{ width: 2, height: `${splitH}%`, background: COLORS.white, position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", opacity: 0.5 }} />

      {/* CENTRAL FEATURES LIST */}
      <div style={{ 
        position: "absolute", 
        left: "50%", 
        top: "50%", 
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        gap: 30,
        alignItems: "center",
        width: 800
      }}>
        {features.map((feat, i) => {
          const delay = 60 + i * 15;
          const s = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 12, stiffness: 200 } });
          const op = interpolate(frame - delay, [0, 10], [0, 1]);
          const x = interpolate(s, [0, 1], [50, 0]);
          const scale = interpolate(s, [0, 1], [0.8, 1]);

          return (
            <div key={feat} style={{ 
              opacity: op, 
              transform: `translateX(${x}px) scale(${scale})`,
              fontFamily: FONTS.headline,
              fontSize: 54,
              fontWeight: 900,
              color: COLORS.greenGlow,
              textShadow: `0 0 20px ${COLORS.greenGlow}44`,
              letterSpacing: "4px"
            }}>
              {feat}
            </div>
          );
        })}
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
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      
      {frame >= 60 && (

        <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent" }}>
          
          <div style={{ display: "flex", alignItems: "center", transform: `scale(${logoScaleVal})`, opacity: logoOp, filter: `blur(${logoBlur}px)` }}>
            {/* 3D 15 Logo */}
            <Logo3D style={{ width: 450, height: 450 }} />
          </div>

          <div style={{ position: "absolute", bottom: 200, opacity: taglineOp }}>
            <TerminalText text="PREDICT FAST. SETTLE FASTER." style={{ fontSize: 24, letterSpacing: "8px", fontWeight: 300, color: COLORS.gray }} delay={180} />
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

      {/* Persistent Logo */}
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) translate(${sX}px, ${sY}px) scale(${sScale})`, display: "flex", alignItems: "center", opacity: 0.5, overflow: "visible" }}>
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
              padding: "40px 60px", 
              transform: `translateY(${yOff}px) scale(${s})`, 
              opacity: s,
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

// ─── SCENE 9: 15 SECONDS (DESKTOP UI MOCKUP) ─────────────────────────────────

// Cursor waypoints in 1920x1080 space.
// Terminal panel is the rightmost 20% of the 1600px iMac, centered in frame.
// iMac content left edge ≈ 160px, terminal panel starts at ≈ x:1440.
const SCENE9_CURSOR: CursorWaypoint[] = [
  { frame: 55,  x: 1050, y: 530 },                        // appears near chart
  { frame: 80,  x: 1655, y: 315 },                        // glides to PUT button
  { frame: 102, x: 1655, y: 315, click: true },           // clicks PUT
  { frame: 126, x: 1600, y: 440 },                        // drifts to amount slider
  { frame: 146, x: 1600, y: 505 },                        // moves to CONFIRM
  { frame: 152, x: 1600, y: 505, click: true },           // clicks CONFIRM
  { frame: 175, x: 1350, y: 560 },                        // retreats to chart area
];

export const Scene9: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // iMac Slides in
  const uiY = spring({ frame, fps, config: { damping: 20 } });
  const translateY = interpolate(uiY, [0, 1], [1080, 0]);
  const scale = interpolate(uiY, [0, 1], [0.8, 1]);
  const entranceBlur = interpolate(uiY, [0, 0.8, 1], [20, 5, 0], { extrapolateRight: "clamp" });


  // Chart line drawing
  const pathLen = 1500;
  const draw = interpolate(frame - 30, [0, 90], [pathLen, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Interactions
  const putClickFrame = 102;
  const isPutSelected = frame > 100;
  const putScale = spring({ frame: Math.max(0, frame - putClickFrame), fps, config: { damping: 10, stiffness: 200 } });
  const putScaleVal = interpolate(putScale, [0, 0.5, 1], [1, 0.9, 1]);

  const amountScale = spring({ frame: Math.max(0, frame - 120), fps, config: { damping: 15 } });
  const amountStr = interpolate(amountScale, [0, 1], [0, 100]).toFixed(2);
  const sliderWidth = interpolate(amountScale, [0, 1], [0, 40]);
  
  const confirmClickFrame = 152;
  const isConfirmClicked = frame > confirmClickFrame && frame < confirmClickFrame + 10;
  const confirmSpring = spring({ frame: Math.max(0, frame - confirmClickFrame), fps, config: { damping: 10, stiffness: 200 } });
  const confirmScaleVal = interpolate(confirmSpring, [0, 0.5, 1], [1, 0.92, 1]);


  // Trade Execution Countdown
  const tradeStartFrame = 160;
  const tradeActive = frame > tradeStartFrame;
  const timeLeft = tradeActive ? Math.max(0, 15 - ((frame - tradeStartFrame) / 10)).toFixed(2) : "15.00";
  
  // Chart post-trade movement
  const tradeChartX = interpolate(frame - tradeStartFrame, [0, 140], [0, 200], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const tradeChartY = interpolate(frame - tradeStartFrame, [0, 140], [0, 50], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const isZero = tradeActive && parseFloat(timeLeft) === 0.00;

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", justifyContent: "center", alignItems: "center" }}>

      {/* iMac Stand */}
      <div style={{ position: "absolute", bottom: -200, width: 300, height: 250, background: "linear-gradient(to bottom, #dcdcdc, #b5b5b5)", transform: `translateY(${translateY}px) scale(${scale})`, borderTopLeftRadius: 20, borderTopRightRadius: 20, zIndex: 1 }} />
      <div style={{ position: "absolute", bottom: -200, width: 400, height: 20, background: "#a0a0a0", transform: `translateY(${translateY}px) scale(${scale})`, borderRadius: 10, zIndex: 1 }} />

      {/* iMac Screen Shell */}
      <div style={{ 
        width: 1600, height: 900, 
        background: "#0A0D0A", // Very dark green/black
        border: "24px solid #111", 
        borderBottom: "60px solid #111", // iMac Chin
        borderRadius: 40, 
        transform: `translateY(${translateY}px) scale(${scale})`, 
        filter: `blur(${entranceBlur}px)`,
        position: "relative", 
        overflow: "hidden",
        boxShadow: "0 40px 100px rgba(0,0,0,0.8)",
        zIndex: 2,
        fontFamily: FONTS.body
      }}>

        
        {/* iMac Apple Logo Fake */}
        <div style={{ position: "absolute", bottom: -45, left: "50%", transform: "translateX(-50%)", width: 30, height: 30, borderRadius: "50%", background: "#333" }} />

        {/* TOP NAV */}
        <div style={{ height: 70, borderBottom: "1px solid rgba(0,230,118,0.2)", display: "flex", alignItems: "center", padding: "0 30px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Img src={staticFile("15logo.png")} style={{ height: 54, width: "auto" }} />
          </div>
          
          {/* Classic / Rounds Toggle */}
          <div style={{ display: "flex", background: "#131613", borderRadius: 30, padding: 4 }}>
            <div style={{ padding: "8px 20px", background: COLORS.green, borderRadius: 20, color: "#000", fontWeight: "bold", fontSize: 14 }}>✦ CLASSIC</div>
            <div style={{ padding: "8px 20px", color: COLORS.gray, fontWeight: "bold", fontSize: 14 }}>ROUNDS</div>
          </div>

          {/* Right Nav Items */}
          <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
            <div style={{ padding: "10px 20px", background: "#131613", borderRadius: 20, color: COLORS.white, fontSize: 14, border: "1px solid #222" }}>
              <span style={{ color: COLORS.greenGlow, marginRight: 8 }}>●</span> 81.9422 USDC
            </div>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#131613", border: "1px solid #222" }} />
            <div style={{ padding: "10px 20px", background: "#131613", borderRadius: 20, color: COLORS.white, fontSize: 14, border: "1px solid #222" }}>
              <span style={{ color: COLORS.green, marginRight: 8 }}>0</span> 0x4c...C28C
            </div>
          </div>
        </div>

        {/* SUB NAV (Marquee) */}
        <div style={{ height: 50, borderBottom: "1px solid #222", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: "20%", background: "#111", height: "100%", padding: "0 20px", display: "flex", alignItems: "center", gap: 20, borderRight: "1px solid #222" }}>
            <span style={{ color: COLORS.gray }}>↑</span> <span style={{ color: COLORS.white, fontWeight: "bold" }}>ETH</span> <span style={{ color: COLORS.gray, fontSize: 12 }}>STAKE<br/>$2.95</span> <span style={{ color: COLORS.red }}>✖ LOST</span>
          </div>
          <div style={{ width: "20%", background: "rgba(0,230,118,0.1)", height: "100%", padding: "0 20px", display: "flex", alignItems: "center", gap: 20, borderRight: "1px solid #222" }}>
            <span style={{ color: COLORS.gray }}>↓</span> <span style={{ color: COLORS.white, fontWeight: "bold" }}>BTC</span> <span style={{ color: COLORS.gray, fontSize: 12 }}>STAKE<br/>$4.51</span> <span style={{ color: COLORS.green }}>✓ WON</span>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ display: "flex", height: "calc(100% - 120px)" }}>
          
          {/* LEFT: CHART (60%) */}
          <div style={{ flex: 6, position: "relative", borderRight: "1px solid #222", padding: 30 }}>
            <div style={{ fontSize: 32, color: COLORS.white, fontWeight: 900, fontFamily: FONTS.headline }}>ETH <span style={{ color: COLORS.gray, fontSize: 20 }}>▼</span></div>
            
            {/* Background Watermark */}
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 200, fontFamily: FONTS.headline, fontWeight: 900, color: "rgba(255,255,255,0.02)", whiteSpace: "nowrap" }}>
              15market
            </div>

            {/* Chart SVG */}
            <div style={{ position: "absolute", inset: "100px 30px 30px 30px" }}>
              <svg style={{ width: "100%", height: "100%" }} viewBox="0 0 1000 500" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradientDesktop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.green} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={COLORS.green} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path 
                  d={`M0,100 C50,100 80,400 150,380 S250,200 350,220 S500,250 650,240 S800,280 850,250`} 
                  stroke={COLORS.green} 
                  strokeWidth={6} 
                  fill="none" 
                  strokeDasharray={pathLen} 
                  strokeDashoffset={draw} 
                  style={{ filter: "drop-shadow(0 0 10px rgba(0,230,118,0.8))" }}
                />
                
                {/* Horizontal reference line */}
                <line x1="0" y1="250" x2="1000" y2="250" stroke="rgba(255,255,255,0.1)" strokeDasharray="5,5" strokeWidth={2} />

                {/* Animated trade continuation line */}
                {tradeActive && (
                  <path 
                    d={`M850,250 Q${850 + tradeChartX/2},${250 + tradeChartY/2} ${850 + tradeChartX},${250 + tradeChartY}`} 
                    stroke={COLORS.greenGlow} 
                    strokeWidth={6} 
                    fill="none" 
                  />
                )}
              </svg>
              
              {/* Chart current price dot and pill */}
              <div style={{ position: "absolute", left: tradeActive ? `${85 + tradeChartX/10}%` : "85%", top: tradeActive ? `calc(50% + ${tradeChartY/2}px)` : "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", opacity: frame > 90 ? 1 : 0 }}>
                <div style={{ width: 15, height: 15, background: COLORS.white, borderRadius: "50%", boxShadow: `0 0 10px ${COLORS.white}` }} />
                <div style={{ background: COLORS.green, padding: "5px 15px", borderRadius: 20, color: "#000", fontWeight: "bold", marginLeft: 10, fontFamily: FONTS.terminal }}>
                  2046.00
                </div>
              </div>
            </div>
          </div>

          {/* MIDDLE: ORDER BOOK (20%) */}
          <div style={{ flex: 2, borderRight: "1px solid #222", padding: 20, display: "flex", flexDirection: "column" }}>
            <div style={{ color: COLORS.gray, fontWeight: "bold", letterSpacing: "2px", marginBottom: 20, fontSize: 14 }}>ORDER BOOK</div>
            <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.gray, fontSize: 12, marginBottom: 20, paddingBottom: 10, borderBottom: "1px solid #222" }}>
              <span>PRICE (ETH)</span>
              <span>SIZE</span>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.terminal, fontSize: 14 }}>
              {[14.38, 12.09, 9.79, 7.49, 5.19].map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", color: COLORS.red }}>
                  <span>205{p}</span>
                  <span style={{ color: COLORS.gray }}>{(random(`s-${i}`)*500).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div style={{ margin: "20px 0", color: COLORS.greenGlow, fontSize: 24, fontWeight: "bold", fontFamily: FONTS.terminal, textAlign: "center", border: `1px solid rgba(0,230,118,0.2)`, padding: 10, borderRadius: 8, background: "rgba(0,230,118,0.05)" }}>
              2045.9600 ↑
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.terminal, fontSize: 14 }}>
              {[44.93, 43.91, 42.89, 41.86, 40.84].map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", color: COLORS.green }}>
                  <span>204{p}</span>
                  <span style={{ color: COLORS.gray }}>{(random(`b-${i}`)*500).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: TERMINAL (20%) */}
          <div style={{ flex: 2, padding: 20, display: "flex", flexDirection: "column", background: "#111" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
              <div style={{ color: COLORS.white, fontWeight: "bold", letterSpacing: "2px", fontSize: 16 }}>TERMINAL</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: COLORS.gray }}>
                <div style={{ width: 30, height: 16, borderRadius: 8, background: "#333", position: "relative" }}>
                  <div style={{ width: 12, height: 12, background: COLORS.white, borderRadius: "50%", position: "absolute", left: 2, top: 2 }} />
                </div>
                AUTO
              </div>
            </div>

            {/* Call / Put Buttons */}
            <div style={{ display: "flex", gap: 10, marginBottom: 30 }}>
              <div style={{ flex: 1, height: 60, background: "#1A1D1A", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.gray, fontWeight: "bold", fontSize: 18, border: "1px solid #333" }}>CALL</div>
              <div style={{ 
                flex: 1, height: 60, 
                background: isPutSelected ? COLORS.red : "#3A1010", 
                borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", 
                color: isPutSelected ? COLORS.white : COLORS.red, 
                fontWeight: "bold", fontSize: 18, 
                boxShadow: isPutSelected ? `0 0 25px rgba(255,59,59,0.6)` : "none",
                transform: `scale(${putScaleVal})`,
                transition: "background 0.1s ease"
              }}>PUT</div>
            </div>


            {/* Time Selection */}
            <div style={{ color: COLORS.gray, fontSize: 12, marginBottom: 10 }}>TIME</div>
            <div style={{ display: "flex", background: "#1A1D1A", borderRadius: 12, padding: 4, marginBottom: 30 }}>
              <div style={{ flex: 1, padding: "10px 0", textAlign: "center", background: COLORS.green, borderRadius: 8, color: "#000", fontWeight: "bold" }}>15s</div>
              <div style={{ flex: 1, padding: "10px 0", textAlign: "center", color: COLORS.gray }}>10s</div>
              <div style={{ flex: 1, padding: "10px 0", textAlign: "center", color: COLORS.gray }}>5s</div>
            </div>

            {/* Amount */}
            <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.gray, fontSize: 12, marginBottom: 10 }}>
              <span>AMOUNT</span>
              <span style={{ color: COLORS.green }}>81.94</span>
            </div>
            <div style={{ background: "#1A1D1A", border: "1px solid #333", borderRadius: 12, padding: "15px 20px", color: COLORS.white, fontSize: 24, fontFamily: FONTS.terminal, marginBottom: 10 }}>
              $ {amountStr}
            </div>
            <div style={{ height: 6, background: "#333", borderRadius: 3, marginBottom: 40, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${sliderWidth}%`, background: COLORS.green, borderRadius: 3 }} />
              <div style={{ position: "absolute", left: `${sliderWidth}%`, top: -4, width: 14, height: 14, background: COLORS.white, borderRadius: "50%", transform: "translateX(-50%)" }} />
            </div>

            {/* Confirm */}
            <div style={{ 
              height: 70, 
              background: isConfirmClicked ? COLORS.white : COLORS.green, 
              borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", 
              color: "#000", fontWeight: 900, fontSize: 24, letterSpacing: "2px", 
              transform: `scale(${confirmScaleVal})`, 
              cursor: "pointer", 
              boxShadow: isConfirmClicked ? `0 0 40px ${COLORS.white}` : `0 0 20px rgba(0,230,118,0.3)`,
              transition: "background 0.05s ease"
            }}>
              CONFIRM
            </div>


            {/* Active Trades */}
            <div style={{ marginTop: 20, flex: 1, border: "1px solid #333", borderRadius: 16, background: "#131613", padding: 20 }}>
              <div style={{ color: COLORS.gray, fontSize: 12, display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
                <span style={{ color: tradeActive ? COLORS.greenGlow : COLORS.gray }}>●</span> ACTIVE TRADES
              </div>
              <div style={{ textAlign: "center", color: tradeActive ? COLORS.white : COLORS.gray, fontFamily: tradeActive ? FONTS.terminal : FONTS.headline, fontSize: tradeActive ? 48 : 16, letterSpacing: tradeActive ? "2px" : "4px", fontWeight: tradeActive ? 300 : "bold" }}>
                {tradeActive ? `${timeLeft}s` : "AWAITING SIGNAL"}
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Green flash when countdown hits zero */}
      {isZero && (
        <AbsoluteFill style={{ backgroundColor: COLORS.greenGlow, opacity: interpolate(frame - (tradeStartFrame + 15 * fps / 10), [0, 8, 20], [0, 0.25, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />
      )}

      {/* Animated cursor overlay */}
      <AnimatedCursor waypoints={SCENE9_CURSOR} />
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

      {/* Win text */}
      <div style={{ transform: `scale(${wS})`, textAlign: "center" }}>
        <div style={{ fontFamily: FONTS.terminal, fontSize: 160, fontWeight: 300, color: COLORS.gold, textShadow: `0 0 80px ${COLORS.gold}44`, letterSpacing: "4px" }}>
          +$150<span style={{ fontSize: 80 }}>.00</span>
        </div>
      </div>

      {/* Top right balance */}
      <div style={{ position: "absolute", top: 60, right: 60, background: "rgba(0,230,118,0.1)", padding: "20px 40px", borderRadius: 20, border: `1px solid rgba(0,230,118,0.3)`, color: COLORS.white, fontFamily: FONTS.terminal, fontSize: 36, display: "flex", alignItems: "center" }}>

        <div style={{ color: COLORS.gray, fontSize: 16, marginRight: 20, letterSpacing: "2px", fontFamily: FONTS.headline }}>BALANCE</div>
        <span style={{ color: COLORS.greenGlow }}>${balance}.00</span>
      </div>

      <div style={{ position: "absolute", top: 200, right: 60 }}>
        <TerminalText text="CREDITED INSTANTLY" delay={60} style={{ fontSize: 24, letterSpacing: "4px" }} />
      </div>

    </AbsoluteFill>
  );
};
