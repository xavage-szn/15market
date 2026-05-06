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

  // Orbs parameters
  const orbs = [
    { x: 0.15, y: 0.2,  r: 400, color: COLORS.green,  speed: 0.015, amp: 50 },
    { x: 0.85, y: 0.15, r: 350, color: COLORS.greenGlow, speed: 0.02,  amp: 40 },
    { x: 0.55, y: 0.75, r: 450, color: COLORS.greenDim,  speed: 0.012, amp: 60 },
    { x: 0.9,  y: 0.6,  r: 300, color: COLORS.green,  speed: 0.025, amp: 30 },
    { x: 0.2,  y: 0.85, r: 320, color: COLORS.greenGlow, speed: 0.018, amp: 45 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: "hidden" }}>
      {/* Dynamic Orbs */}
      {orbs.map((orb, i) => {
        const x = orb.x * width + Math.sin(frame * orb.speed) * orb.amp;
        const y = orb.y * height + Math.cos(frame * orb.speed * 0.8) * orb.amp;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: orb.r * 2,
              height: orb.r * 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${orb.color}22 0%, transparent 70%)`,
              transform: "translate(-50%, -50%)",
              filter: "blur(40px)",
            }}
          />
        );
      })}

      {/* Animated Grid */}
      <div
        style={{
          position: "absolute",
          inset: -100,
          backgroundImage: `
            linear-gradient(to right, rgba(0, 230, 118, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 230, 118, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
          transform: `perspective(1000px) rotateX(60deg) translateY(${ (frame * 0.5) % 80 }px)`,
          maskImage: "radial-gradient(circle at center, black, transparent 90%)",
        }}
      />

      {/* Moving Data Lines */}
      {new Array(15).fill(0).map((_, i) => {
        const x = random(`line-x-${i}`) * width;
        const startY = random(`line-y-${i}`) * height;
        const length = 100 + random(`line-l-${i}`) * 200;
        const speed = 2 + random(`line-s-${i}`) * 4;
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
              background: `linear-gradient(to bottom, transparent, ${COLORS.greenGlow}44)`,
              boxShadow: `0 0 10px ${COLORS.greenGlow}22`,
            }}
          />
        );
      })}

      {/* Vignette Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at center, transparent 20%, rgba(0,0,0,0.9) 100%)",
        }}
      />
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
        {[...items, ...items].map((item, i) => {
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
                transition: "color 0.1s ease",
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
export const LogoVector: React.FC<{ size?: number; drawProgress?: number }> = ({ size = 120, drawProgress = 1 }) => {
  return (
    <svg width={size * 4} height={size} viewBox="0 0 400 120" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#166534" />
        </linearGradient>
        <filter id="logoShadow">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.5" />
        </filter>
      </defs>
      
      <g style={{ filter: "url(#logoShadow)" }}>
        {/* "1" */}
        <path
          d="M10,20 L40,20 L40,100 L25,100 L25,35 L10,35 Z"
          fill="url(#logoGrad)"
          stroke={COLORS.greenGlow}
          strokeWidth="1"
          strokeDasharray="400"
          strokeDashoffset={400 * (1 - drawProgress)}
        />
        
        {/* "5" with the special arrow notch */}
        <path
          d="M55,20 L110,20 L110,35 L70,35 L70,55 L100,55 C115,55 115,100 100,100 L55,100 L55,85 L95,85 C100,85 100,70 95,70 L70,70 L55,70 Z"
          fill="url(#logoGrad)"
          stroke={COLORS.greenGlow}
          strokeWidth="1"
          strokeDasharray="600"
          strokeDashoffset={600 * (1 - drawProgress)}
        />

        {/* The Arrow Notch detail in the 5 */}
        <path 
          d="M75,90 L85,100 L65,100 Z" 
          fill={COLORS.bg} 
          opacity={drawProgress > 0.9 ? 1 : 0}
        />

        {/* "market" */}
        <text
          x="130" y="85"
          fontFamily={FONTS.headline}
          fontSize="70"
          fontWeight="400"
          fill={COLORS.white}
          fillOpacity={drawProgress > 0.5 ? (drawProgress - 0.5) * 2 : 0}
          style={{ letterSpacing: "-2px" }}
        >
          market
        </text>
      </g>
    </svg>
  );
};

// ─── LOGO 3D ─────────────────────────────────────────────────────────────────
export const Logo3D: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const intro = spring({ frame, fps, config: { damping: 12 } });
  const draw = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: "clamp" });

  const floatY = Math.sin(frame * 0.05) * 15;
  const rotateY = Math.sin(frame * 0.03) * 10;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        transform: `translateY(${floatY}px) rotateY(${rotateY}deg) scale(${intro})`,
        perspective: "1000px",
        ...style,
      }}
    >
      <div style={{ position: "absolute", width: "160%", height: "160%", opacity: 0.1 }}>
        <svg viewBox="0 0 100 100" style={{ transform: `rotate(${frame * 0.1}deg)` }}>
          <circle cx="50" cy="50" r="48" fill="none" stroke={COLORS.green} strokeWidth="0.5" strokeDasharray="2,4" />
          <polygon points="50,2 92,25 92,75 50,98 8,75 8,25" fill="none" stroke={COLORS.green} strokeWidth="0.2" />
        </svg>
      </div>

      {[0, 45, 90].map((rot, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: `${120 + i * 20}%`,
            height: `${120 + i * 20}%`,
            border: `1px solid ${COLORS.green}22`,
            borderRadius: "50%",
            transform: `rotateX(70deg) rotateZ(${frame * (0.5 + i * 0.2) + rot}deg)`,
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          width: "200%",
          height: 2,
          background: `linear-gradient(to right, transparent, ${COLORS.greenGlow}, transparent)`,
          top: `${ (frame * 2) % 200 - 50 }%`,
          opacity: 0.1,
          filter: "blur(5px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: "120%",
          height: "120%",
          background: `radial-gradient(circle, ${COLORS.green}33 0%, transparent 70%)`,
          filter: "blur(60px)",
        }}
      />

      <LogoVector size={ (style?.width as number || 400) / 4 } drawProgress={draw} />

      {new Array(8).fill(0).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2 + (frame * 0.02);
        const dist = 150 + Math.sin(frame * 0.05 + i) * 20;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 4, height: 4,
              background: COLORS.greenGlow,
              borderRadius: "50%",
              transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`,
              boxShadow: `0 0 10px ${COLORS.greenGlow}`,
              opacity: 0.5,
            }}
          />
        );
      })}
    </div>
  );
};