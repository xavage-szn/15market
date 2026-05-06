import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig, Img, staticFile } from "remotion";
import { COLORS, FONTS } from "../constants";

export const GlowPulse: React.FC<{ color?: string }> = ({ color = COLORS.green }) => {
  return (
    <div
      style={{
        position: "absolute",
        width: 600,
        height: 600,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
    />
  );
};

export const TerminalText: React.FC<{ text: string; style?: React.CSSProperties; delay?: number }> = ({ text, style, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const framesPerChar = (40 / 1000) * fps;
  
  const localFrame = Math.max(0, frame - delay);
  const charsToShow = Math.floor(localFrame / framesPerChar);
  const displayedText = text.substring(0, charsToShow);

  return (
    <span style={{ fontFamily: FONTS.terminal, color: COLORS.green, ...style }}>
      {displayedText}
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
        }} 
      />
    </div>
  );
};

// ─── JITTER SCROLL COMPONENT ──────────────────────────────────────────────────
export interface JitterScrollProps {
  items: string[];
  delay?: number;
  itemHeight?: number;
  speed?: number; // pixels per frame
  style?: React.CSSProperties;
}

export const JitterScroll: React.FC<JitterScrollProps> = ({ 
  items, 
  delay = 0, 
  itemHeight = 80,
  speed = 15,
  style
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  
  const localFrame = Math.max(0, frame - delay);
  
  // Total distance scrolled
  const scrolledY = localFrame * speed;
  
  // We offset by half the screen so the first item starts in the middle
  const startY = height / 2;

  return (
    <div style={{ position: "absolute", width: "100%", height: "100%", overflow: "hidden", display: "flex", justifyContent: "center", ...style }}>
      <div style={{ position: "absolute", top: startY, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {items.map((item, i) => {
          // Position of this item relative to the container
          const itemY = i * itemHeight;
          // Current absolute Y position on screen (from center = 0)
          const currentY = itemY - scrolledY;
          
          // Calculate distance from center
          const distFromCenter = Math.abs(currentY);
          
          // Blur and opacity based on distance from center
          const blur = interpolate(distFromCenter, [0, itemHeight, itemHeight * 3], [0, 2, 8], { extrapolateRight: "clamp" });
          const opacity = interpolate(distFromCenter, [0, itemHeight, itemHeight * 4], [1, 0.5, 0], { extrapolateRight: "clamp" });
          const scale = interpolate(distFromCenter, [0, itemHeight], [1, 0.9], { extrapolateRight: "clamp" });

          const isCenter = distFromCenter < itemHeight / 2;

          return (
            <div 
              key={i}
              style={{
                position: "absolute",
                top: itemY - scrolledY - itemHeight/2, // Center the item vertically
                height: itemHeight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity,
                filter: `blur(${blur}px)`,
                transform: `scale(${scale})`,
                fontFamily: FONTS.headline,
                fontSize: 64,
                fontWeight: isCenter ? 800 : 600,
                color: isCenter ? COLORS.white : COLORS.gray,
                whiteSpace: "nowrap"
              }}
            >
              {isCenter && (
                <span style={{ position: "absolute", left: -60, color: COLORS.white }}>→</span>
              )}
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
};
