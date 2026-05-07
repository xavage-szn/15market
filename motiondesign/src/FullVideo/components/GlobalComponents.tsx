import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random, Easing, Img, staticFile } from "remotion";
import { COLORS, FONTS } from "../constants";


// ─── AMBIENT GLOW ────────────────────────────────────────────────────────────
export const AmbientGlow: React.FC<{
  color: string;
  xOffset?: number;
  yOffset?: number;
  delay?: number;
}> = ({ color, xOffset = 0, yOffset = 0, delay = 0 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame - delay, [0, 60], [0, 0.4], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: `calc(50% + ${xOffset}px)`,
        top: `calc(50% + ${yOffset}px)`,
        width: 1200,
        height: 1200,
        background: `radial-gradient(circle, ${color}33 0%, transparent 70%)`,
        transform: "translate(-50%, -50%)",
        opacity,
        pointerEvents: "none",
        zIndex: -1,
      }}
    />
  );
};

// ─── FUTURISTIC BACKGROUND ──────────────────────────────────────────────────
export const FuturisticBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: "hidden" }}>
      {/* Animated Grid */}
      <div
        style={{
          position: "absolute",
          inset: -100,
          backgroundImage: `
            linear-gradient(to right, rgba(0, 230, 118, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 230, 118, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
          transform: `translateY(${ (frame * 0.4) % 80 }px)`,
        }}
      />




      {/* Moving Data Lines - Reduced for performance */}
      {new Array(8).fill(0).map((_, i) => {
        const x = random(`line-x-${i}`) * width;
        const startY = random(`line-y-${i}`) * height;
        const length = 100 + random(`line-l-${i}`) * 200;
        const speed = 1 + random(`line-s-${i}`) * 3;
        const y = (startY + frame * speed) % (height + length);
        
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y - length,
              width: 1,
              height: length,
              background: `linear-gradient(to bottom, transparent, ${COLORS.greenGlow}33)`,
            }}
          />
        );
      })}


    </AbsoluteFill>
  );
};


// ─── ARC GRAPHICS (TESTNET) ──────────────────────────────────────────────────
export const ArcGraphics: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nodes = [
    { x: 200, y: 100, label: "VAL" },
    { x: 100, y: 50,  label: "RPC" },
    { x: 300, y: 50,  label: "RPC" },
    { x: 350, y: 120, label: "API" },
    { x: 50,  y: 120, label: "API" },
    { x: 150, y: 170, label: "ARC" },
    { x: 250, y: 170, label: "15M" },
  ];

  const connections = [
    [0, 1], [0, 2], [1, 4], [2, 3], [4, 5], [3, 6], [5, 0], [6, 0]
  ];

  return (
    <div style={{ position: "relative", width: 400, height: 250, marginBottom: 40 }}>
      <svg width="400" height="250" viewBox="0 0 400 250">
        {connections.map(([a, b], i) => {
          const n1 = nodes[a];
          const n2 = nodes[b];
          const draw = interpolate(frame - (i * 5), [0, 30], [1, 0], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
            easing: Easing.bezier(0.4, 0, 0.2, 1)
          });
          const pathLen = Math.sqrt(Math.pow(n1.x - n2.x, 2) + Math.pow(n1.y - n2.y, 2));
          
          return (
            <line
              key={i}
              x1={n1.x} y1={n1.y}
              x2={n2.x} y2={n2.y}
              stroke={COLORS.green}
              strokeWidth={1}
              strokeOpacity={0.2}
              strokeDasharray={pathLen}
              strokeDashoffset={pathLen * draw}
            />
          );
        })}

        {nodes.map((node, i) => {
          const s = spring({ frame: Math.max(0, frame - (i * 3)), fps, config: { damping: 12 } });
          const pulse = 1 + Math.sin(frame * 0.1 + i) * 0.1;
          
          return (
            <g key={i} style={{ transform: `scale(${s})`, transformOrigin: `${node.x}px ${node.y}px` }}>
              <circle
                cx={node.x} cy={node.y}
                r={6 * pulse}
                fill={i === 0 ? COLORS.greenGlow : COLORS.white}
                style={{ filter: `drop-shadow(0 0 5px ${COLORS.greenGlow}aa)` }}
              />
              <text
                x={node.x} y={node.y + 20}
                textAnchor="middle"
                fill={COLORS.gray}
                style={{ fontSize: 10, fontFamily: FONTS.terminal, opacity: s }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>

      {new Array(20).fill(0).map((_, i) => {
        const x = random(`bit-x-${i}`) * 400;
        const y = random(`bit-y-${i}`) * 250;
        const op = interpolate(frame, [0, 30], [0, 0.5]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 2,
              height: 2,
              background: COLORS.greenGlow,
              opacity: op * (0.5 + Math.sin(frame * 0.2 + i) * 0.5),
              borderRadius: "50%",
            }}
          />
        );
      })}
    </div>
  );
};

// ─── LANDING SCROLL ──────────────────────────────────────────────────────────
// Spins through items and lands exactly on a target index with a spring bounce.
export const LandingScroll: React.FC<{
  items: string[];
  targetIndex: number;
  itemHeight?: number;
  duration?: number;
  style?: React.CSSProperties;
}> = ({ items = [], targetIndex, itemHeight = 100, duration = 60, style }) => {
  const frame = useCurrentFrame();
  
  if (!items || items.length === 0) return null;

  // The spin: fast at first, then settles on the target.
  const laps = 3;
  const totalItems = items.length;
  const targetPos = laps * totalItems + targetIndex;

  // Use interpolation for perfectly controlled duration
  const progress = interpolate(frame, [0, duration], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 1, 0.3, 1), // Fast start, very smooth settle
  });

  const scrollY = progress * targetPos * itemHeight;


  return (
    <div
      style={{
        height: itemHeight,
        overflow: "hidden",
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          transform: `translateY(-${scrollY}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Render many copies to allow for multiple laps */}
        {new Array(laps + 2).fill(0).map((_, lap) => (
          <React.Fragment key={lap}>
            {items.map((item, i) => {
              const globalIndex = lap * totalItems + i;
              const dist = Math.abs(scrollY / itemHeight - globalIndex);
              const opacity = interpolate(dist, [0, 1], [1, 0.2], { extrapolateRight: "clamp" });
              const scale = interpolate(dist, [0, 1], [1, 0.8], { extrapolateRight: "clamp" });

              return (
                <div
                  key={`${lap}-${i}`}
                  style={{
                    height: itemHeight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: FONTS.headline,
                    fontSize: itemHeight * 0.7,
                    fontWeight: 900,
                    color: dist < 0.5 ? COLORS.white : COLORS.gray,
                    opacity,
                    transform: `scale(${scale})`,
                    whiteSpace: "nowrap",
                    letterSpacing: "4px",
                  }}
                >
                  {item.toUpperCase()}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ─── JITTER SCROLL ───────────────────────────────────────────────────────────
export const JitterScroll: React.FC<{
  items: string[];
  speed?: number;
  itemHeight?: number;
  delay?: number;
  align?: "center" | "flex-start" | "flex-end";
  style?: React.CSSProperties;
}> = ({ items, speed = 10, itemHeight = 100, delay = 0, align = "center", style }) => {
  const frame = useCurrentFrame();
  const t = Math.max(0, frame - delay);
  
  const totalHeight = items.length * itemHeight;
  const scrollY = (t * speed) % totalHeight;

  return (
    <div
      style={{
        height: itemHeight,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: align,
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          transform: `translateY(-${scrollY}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: align,
        }}
      >
        {[...items, ...items, ...items].map((item, i) => {
          const isTarget = Math.floor(scrollY / itemHeight) === i % items.length;
          return (
            <div
              key={i}
              style={{
                height: itemHeight,
                display: "flex",
                alignItems: "center",
                justifyContent: align,
                fontFamily: FONTS.headline,
                fontSize: itemHeight * 0.6,
                fontWeight: 900,
                color: isTarget ? COLORS.white : COLORS.gray,
                opacity: isTarget ? 1 : 0.3,
                whiteSpace: "nowrap",
                letterSpacing: "2px",
              }}
            >
              {item.toUpperCase()}
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ─── TERMINAL TEXT ───────────────────────────────────────────────────────────
export const TerminalText: React.FC<{
  text: string;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const charsShown = Math.floor(interpolate(frame - delay, [0, 20], [0, text.length], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  }));

  const cursorVisible = Math.floor(frame / 10) % 2 === 0;

  return (
    <div
      style={{
        fontFamily: FONTS.terminal,
        color: COLORS.greenGlow,
        ...style,
      }}
    >
      {text.slice(0, charsShown)}
      <span style={{ opacity: cursorVisible ? 1 : 0 }}>_</span>
    </div>
  );
};

// ─── LOGO VECTOR ─────────────────────────────────────────────────────────────
export const LogoVector: React.FC<{ size?: number; drawProgress?: number }> = ({ size = 120 }) => {
  return (
    <Img 
      src={staticFile("15market.SVG")} 
      style={{ 
        width: size * 3, // Wider to accommodate full branding
        height: size,
        objectFit: "contain" 
      }} 
    />
  );
};


// ─── LOGO 3D ─────────────────────────────────────────────────────────────────
export const Logo3D: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const frame = useCurrentFrame();
  
  const floatY = Math.sin(frame * 0.05) * 15;
  const rotateY = Math.sin(frame * 0.03) * 10;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        transform: `translateY(${floatY}px) rotateY(${rotateY}deg)`,
        perspective: "1000px",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          background: `radial-gradient(circle, ${COLORS.greenGlow}11 0%, transparent 70%)`,
          transform: "translate(-50%, -50%)",
          left: "50%",
          top: "50%",
        }}
      />



      <LogoVector size={ (style?.width as number || 400) / 4 } drawProgress={1} />
    </div>
  );
};

// ─── SCENE ZOOM TRANSITION ───────────────────────────────────────────────────
// A seamless "zoom-through" camera move. It pulls the scene from a massive 
// scale down to focus, then zooms "past" the camera on exit.
export const SceneZoomTransition: React.FC<{
  children: React.ReactNode;
  entryFrames?: number;
  exitFrames?: number;
  entryScale?: number;
  exitScale?: number;
}> = ({
  children,
  entryFrames = 25,
  exitFrames = 18,
  entryScale = 2.5, // Start from way outside
  exitScale = 4.0,  // Zoom past the camera
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // ── Entry: Fast settle from massive → 1
  const entryProgress = interpolate(frame, [0, entryFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const inScale = interpolate(entryProgress, [0, 1], [entryScale, 1]);
  const inOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const inBlur = interpolate(entryProgress, [0, 0.6], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Exit: Rapid zoom into the camera
  const exitStart = durationInFrames - exitFrames;
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.7, 0, 0.84, 0),
  });
  const outScale = interpolate(exitProgress, [0, 1], [1, exitScale]);
  const outOpacity = interpolate(exitProgress, [0.4, 0.9], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outBlur = interpolate(exitProgress, [0.2, 1], [0, 15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });


  const scale = inScale * outScale;
  const opacity = Math.min(inOpacity, outOpacity);
  const blur = inBlur + outBlur;

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        opacity,
        transformOrigin: "center center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};


// ─── ANIMATED CURSOR ─────────────────────────────────────────────────────────
// A smooth spring-tracked cursor with click-ripple effect, for mockup scenes.
export type CursorWaypoint = {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
};

export const AnimatedCursor: React.FC<{ waypoints: CursorWaypoint[] }> = ({ waypoints }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (waypoints.length === 0) return null;
  const sorted = [...waypoints].sort((a, b) => a.frame - b.frame);
  if (frame < sorted[0].frame) return null;

  // Function to get position at a specific frame
  const getPos = (f: number) => {
    let x = sorted[sorted.length - 1].x;
    let y = sorted[sorted.length - 1].y;
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      if (f >= from.frame && f <= to.frame) {
        const t = Math.min(
          1,
          spring({
            frame: f - from.frame,
            fps,
            config: { damping: 26, stiffness: 220, mass: 0.6 },
          })
        );
        x = from.x + (to.x - from.x) * t;
        y = from.y + (to.y - from.y) * t;
        break;
      }
    }
    return { x, y };
  };

  const currentPos = getPos(frame);

  // ── Click detection
  const clickWp = sorted.find(
    (wp) => wp.click && frame >= wp.frame && frame < wp.frame + 18
  );
  const clickAge = clickWp ? frame - clickWp.frame : -1;
  const clickRingScale = clickAge >= 0
    ? interpolate(clickAge, [0, 18], [0.2, 3], { extrapolateRight: "clamp" })
    : 0;
  const clickRingOpacity = clickAge >= 0
    ? interpolate(clickAge, [0, 4, 18], [1, 0.8, 0], { extrapolateRight: "clamp" })
    : 0;
  const cursorPressScale = clickWp && clickAge >= 0 && clickAge < 6 ? 0.8 : 1;

  return (
    <>
      {/* Mouse Trail */}
      {[2, 4, 6].map((offset, i) => {
        const trailPos = getPos(frame - offset);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: trailPos.x,
              top: trailPos.y,
              width: 8 - i * 2,
              height: 8 - i * 2,
              background: COLORS.greenGlow,
              borderRadius: "50%",
              opacity: 0.3 - i * 0.1,
              filter: "blur(2px)",
              pointerEvents: "none",
              zIndex: 9998,
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: currentPos.x,
          top: currentPos.y,
          pointerEvents: "none",
          zIndex: 9999,
          transform: "translate(-3px, -2px)",
        }}
      >
        {/* Click ripple rings */}
        {clickRingOpacity > 0 && (
          <div style={{ position: "absolute" }}>
            <div
              style={{
                position: "absolute",
                left: -24,
                top: -24,
                width: 48,
                height: 48,
                border: `3px solid ${COLORS.greenGlow}`,
                borderRadius: "50%",
                transform: `scale(${clickRingScale})`,
                opacity: clickRingOpacity,
                boxShadow: `0 0 20px ${COLORS.greenGlow}`,
              }}
            />
          </div>
        )}

        {/* Ambient glow dot */}
        <div
          style={{
            position: "absolute",
            left: -25,
            top: -25,
            width: 50,
            height: 50,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${COLORS.greenGlow}44 0%, transparent 70%)`,
            filter: "blur(6px)",
          }}
        />

        {/* Cursor arrow */}
        <svg
          width={32}
          height={40}
          viewBox="0 0 30 38"
          style={{
            transform: `scale(${cursorPressScale})`,
            transformOrigin: "0 0",
            filter:
              "drop-shadow(0 3px 10px rgba(0,0,0,0.8)) drop-shadow(0 0 12px rgba(0,255,136,0.4))",
          }}
        >
          <path
            d="M 3 2 L 3 28 L 9 21 L 15.5 35 L 19.5 33 L 13 20 L 21 20 Z"
            fill="white"
            stroke="black"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>
  );
};