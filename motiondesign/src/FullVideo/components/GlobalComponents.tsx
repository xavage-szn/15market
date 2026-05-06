import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, random, Img, staticFile } from "remotion";
import { COLORS, FONTS } from "../constants";

export const BackgroundGrid: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 0.08], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `
          linear-gradient(#0D1F0D 1px, transparent 1px),
          linear-gradient(90deg, #0D1F0D 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
        opacity,
      }}
    />
  );
};

export const GreenParticles: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const count = 100;
  
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {new Array(count).fill(0).map((_, i) => {
        const startX = random(`px-${i}`) * 100;
        const startY = height + random(`py-${i}`) * height;
        const speed = 0.5 + random(`ps-${i}`) * 2;
        const y = startY - frame * speed;
        const op = 0.2 + random(`po-${i}`) * 0.2;
        
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${startX}%`,
              top: y,
              width: 3,
              height: 3,
              borderRadius: "50%",
              backgroundColor: COLORS.green,
              opacity: op,
              boxShadow: `0 0 4px ${COLORS.green}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const GlowPulse: React.FC<{ color?: string }> = ({ color = COLORS.green }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const cycle = (frame % (fps * 2)) / (fps * 2);
  const pulse = Math.sin(cycle * Math.PI);
  
  return (
    <div
      style={{
        position: "absolute",
        width: 600,
        height: 600,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}33 0%, transparent 70%)`,
        opacity: 0.5 + pulse * 0.5,
        transform: `translate(-50%, -50%) scale(${1 + pulse * 0.2})`,
        left: "50%",
        top: "50%",
        pointerEvents: "none",
      }}
    />
  );
};

export const TerminalText: React.FC<{ text: string; style?: React.CSSProperties; delay?: number }> = ({ text, style, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const framesPerChar = (40 / 1000) * fps; // 40ms per char
  
  const localFrame = Math.max(0, frame - delay);
  const charsToShow = Math.floor(localFrame / framesPerChar);
  const displayedText = text.substring(0, charsToShow);
  
  const cursorBlink = Math.floor(frame / 15) % 2 === 0;
  const isDone = charsToShow >= text.length;

  return (
    <span style={{ fontFamily: FONTS.terminal, color: COLORS.green, ...style }}>
      {displayedText}
      <span style={{ opacity: isDone && !cursorBlink ? 0 : 1 }}>█</span>
    </span>
  );
};

export const Logo3D: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  return (
    <div style={{ position: "relative", ...style }}>
      <Img 
        src={staticFile("15logo.png")} 
        style={{ 
          width: "100%", 
          height: "100%", 
          objectFit: "contain",
          filter: `drop-shadow(0 0 40px ${COLORS.green}) drop-shadow(0 0 80px ${COLORS.green}) drop-shadow(0 0 120px #00A850)`,
        }} 
      />
    </div>
  );
};
