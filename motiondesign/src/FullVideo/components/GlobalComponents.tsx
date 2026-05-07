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
  // Official UPDATED paths from 15market.svg
  const path1 = "M0.104673,3.43344 1.08153,3.43344 1.08153,5.65311 0.508717,5.65311 0.508717,3.91931 0.104673,3.91931 Z";
  const path5 = "M1.45106 3.43963l1.42774 0.000523622 -0.000980315 0.502949 -0.919732 0.000862205 -0.000511811 0.268622c0.719299,-0.0261378 1.08785,0.38661 1.03852,0.798783 -0.031622,0.264217 -0.186457,0.537917 -0.690287,0.663701l-0.00210236 -0.312453 0.260339 0.00174803 -0.221232 -0.249315c0.380102,-0.533232 -0.697559,-0.353268 -0.979488,-0.414744l0.0877362 -1.26068z";
  const pathArrow = "M1.41909 4.978c0.104839,0.0958976 0.242929,0.153012 0.42961,0.153433l-0.197614 0.239921 0.256701 0.000716535 0.0022874 0.301492c-0.239953,-0.0174764 -0.474366,-0.084815 -0.700677,-0.225035l0.209693 -0.470528z";

  // Glyph paths for "market"
  const glyphs = {
    m: "M61.4996 518.499l126.502 0 0 -70.6653c45.1648,54.9997 99.1662,82.4996 161.664,82.4996 33.1689,0 62.0016,-6.83172 86.3337,-20.5008 24.5023,-13.6663 44.5012,-34.3316 60.1668,-61.9988 22.6675,27.6672 47.3342,48.3325 73.6685,61.9988 26.3315,13.6691 54.4978,20.5008 84.4989,20.5008 38.0012,0 70.3335,-7.83279 96.6678,-23.3339 26.3315,-15.331 45.9985,-38.1657 58.9984,-67.9995 9.50031,-22.1655 14.1682,-57.0001 14.1682,-107.498l0 -331.501 -137.167 0 0 296.333c0,51.5002 -4.66791,84.6662 -14.1654,99.6682 -12.668,19.4997 -32.1678,29.3319 -58.5021,29.3319 -19.3324,0 -37.332,-5.83348 -54.3333,-17.6677 -16.834,-11.6641 -29.0001,-28.8327 -36.4982,-51.5002 -7.50099,-22.6646 -11.3351,-58.3319 -11.3351,-107.166l0 -248.999 -137.165 0 0 284.167c0,50.4991 -2.50128,82.9987 -7.33367,97.666 -4.83523,14.6673 -12.5007,25.5005 -22.6675,32.6669 -10.3341,7.16635 -24.1677,10.8332 -41.8326,10.8332 -21.1673,0 -40.1679,-5.66616 -57.0019,-17.1658 -16.9985,-11.3351 -29.1645,-27.8345 -36.4982,-49.3336 -7.33367,-21.5019 -11.0005,-57.0019 -11.0005,-106.835l0 -251.999 -137.167 0 0 518.499z",
    a: "M174.332 360.334l-124.499 22.5001c14.0009,50.1645 38.0012,87.1647 72.1683,111.332 34.3316,24.0003 84.998,36.1664 152.331,36.1664 61.3351,0 106.835,-7.33367 136.836,-21.8337 29.831,-14.5 50.9982,-32.8314 63.1643,-55.167 12.1689,-22.3328 18.3342,-63.1643 18.3342,-122.832l-1.5002 -160.167c0,-45.4994 2.16664,-79.1674 6.66723,-100.834 4.33328,-21.4991 12.668,-44.833 24.6668,-69.4997l-135.835 0c-3.49952,9.16567 -8.00011,22.6675 -13.1643,40.4997 -2.16664,8.16743 -3.83416,13.499 -4.83523,16.1675 -23.4984,-22.8348 -48.4998,-39.8332 -75.1659,-51.3329 -26.6661,-11.3351 -55.167,-17.0013 -85.5,-17.0013 -53.3322,0 -95.4994,14.5 -126.167,43.3328 -30.8321,29.0001 -46.1658,65.6684 -46.1658,110.002 0,29.1645 6.99904,55.3315 20.9999,78.3308 13.9981,23.0021 33.6651,40.5025 58.8339,52.6686 25.1659,12.1661 61.667,22.8319 109.166,32.0005 64.0009,11.9988 108.499,23.3311 133.166,33.6651l0 13.6663c0,26.5016 -6.49991,45.1676 -19.4997,56.4999 -12.9998,11.1678 -37.4993,16.834 -73.6657,16.834 -24.4995,0 -43.5001,-4.8324 -57.1664,-14.5 -13.6663,-9.50031 -24.6668,-26.3343 -33.1689,-50.4991zm183.501 -111.335c-17.5004,-5.83348 -45.3321,-12.8325 -83.5007,-20.9999 -37.9984,-8.1646 -62.8325,-16.1647 -74.6668,-23.833 -17.8322,-12.8325 -26.8334,-28.8327 -26.8334,-48.3325 0,-19.3324 7.16919,-35.8346 21.5019,-49.8327 14.3327,-14.0009 32.4996,-20.9999 54.6651,-20.9999 24.8341,0 48.3353,8.1646 70.8355,24.3321 16.6667,12.3334 27.4999,27.4999 32.6669,45.4994 3.664,11.667 5.33152,33.9998 5.33152,66.834l0 27.3325z",
    r: "M203.168 0l-137.167 0 0 518.499 127.333 0 0 -73.6657c21.8337,34.8335 41.5008,57.8328 58.8339,68.8333 17.5004,11.0005 37.1675,16.6667 59.333,16.6667 31.334,0 61.3323,-8.66655 90.3324,-25.9997l-42.499 -119.5c-22.9993,14.8318 -44.4983,22.3328 -64.3327,22.3328 -19.3324,0 -35.5,-5.16704 -48.8344,-15.8329 -13.499,-10.5014 -23.833,-29.6665 -31.4985,-57.3337 -7.66831,-27.6672 -11.4996,-85.6673 -11.4996,-173.833l0 -160.167z",
    k: "M66.834 0l0 715.833 137.332 0 0 -379.834 160.501 182.5 169.001 0 -177.168 -189.331 189.833 -329.167 -147.833 0 -130.5 232.834 -63.8336 -66.834 0 -166 -137.332 0z",
    e: "M372.001 164.999l136.833 -22.8319c-17.6677,-50.1673 -45.3349,-88.333 -83.3333,-114.5 -37.8339,-26.3343 -85.3327,-39.3341 -142.335,-39.3341 -90.1651,0 -156.832,29.3347 -200.167,88.333 -34.1643,47.1669 -51.3329,106.835 -51.3329,178.668 0,85.9991 22.5001,153.332 67.5004,201.999 44.833,48.6671 101.668,72.9993 170.334,72.9993 77.1681,0 138.001,-25.5005 182.667,-76.4988 44.5012,-51.0011 65.8329,-129 64.0009,-234.167l-343.835 0c1.00108,-40.667 12.0016,-72.3328 33.166,-94.833 21.1673,-22.6675 47.6689,-33.9998 79.1674,-33.9998 21.4991,0 39.5014,5.83348 54.166,17.5004 14.6673,11.8314 25.8352,30.6647 33.1689,56.6644zm7.83279 138.668c-1.00108,39.8332 -11.1678,69.9989 -30.6676,90.667 -19.4997,20.6653 -43.3328,30.9994 -71.3317,30.9994 -30.0011,0 -54.6679,-11.0005 -74.1677,-32.8342 -19.4997,-21.6664 -29.1674,-51.3329 -28.8327,-88.8322l205 0z",
    t: "M309.5 518.499l0 -109.333 -93.6674 0 0 -208.998c0,-42.3345 0.833759,-67.0013 2.66576,-74.0003 1.83484,-6.99904 5.83348,-12.668 12.1689,-17.3331 6.3326,-4.5006 14.1654,-6.83455 23.1666,-6.83455 12.8325,0 31.1667,4.5006 55.3315,13.1671l11.667 -106.333c-32.0005,-13.6663 -67.9995,-20.5008 -108.499,-20.5008 -24.6668,0 -46.9996,4.16596 -66.834,12.3334 -19.8315,8.33475 -34.3316,19.1679 -43.6674,32.3324 -9.33299,13.1671 -15.6656,31.0022 -19.3324,53.5024 -2.83308,15.8329 -4.33328,48.1652 -4.33328,96.665l0 226 -62.9998 0 0 109.333 62.9998 0 0 103.168 137.667 80.0011 0 -183.169 93.6674 0z"
  };

  return (
    <svg width={size * 4} height={size} viewBox="0 0 5 3" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="id0" gradientUnits="userSpaceOnUse" x1="2.7831" y1="3.31722" x2="1.62564" y2="5.79749">
          <stop offset="0" style={{ stopColor: "#055F3B" }} />
          <stop offset="0.658824" style={{ stopColor: "#449030" }} />
          <stop offset="1" style={{ stopColor: "#84C225" }} />
        </linearGradient>
        <linearGradient id="id1" gradientUnits="userSpaceOnUse" x1="1.20939" y1="5.32578" x2="1.91007" y2="5.32578">
          <stop offset="0" style={{ stopColor: "#055F3B" }} />
          <stop offset="1" style={{ stopColor: "#84C225" }} />
        </linearGradient>
        <linearGradient id="id2" gradientUnits="userSpaceOnUse" x1="0.0241102" y1="5.61014" x2="1.1621" y2="3.47641">
          <stop offset="0" style={{ stopColor: "#005834" }} />
          <stop offset="1" style={{ stopColor: "#84C225" }} />
        </linearGradient>
        <filter id="logoShadow">
          <feDropShadow dx="0" dy="0.05" stdDeviation="0.05" floodOpacity="0.5" />
        </filter>
      </defs>
      
      <g transform="translate(0, -3.2)" style={{ filter: "url(#logoShadow)" }}>
        {/* "1" */}
        <path d={path1} fill="url(#id2)" />
        
        {/* "5" */}
        <path d={path5} fill="url(#id0)" />

        {/* Arrow Notch detail */}
        <path d={pathArrow} fill="url(#id1)" />

        {/* "market" */}
        <g transform="translate(1.4, 5.5) scale(0.002, -0.002) translateY(-500)">
          {["m", "a", "r", "k", "e", "t"].map((char, i) => {
            const charOffsets = [0, 889, 1445, 1834, 2390, 2946]; 
            const offset = charOffsets[i];
            return (
              <path
                key={i}
                d={glyphs[char as keyof typeof glyphs]}
                transform={`translate(${offset}, 0)`}
                fill={COLORS.white}
              />
            );
          })}
        </g>
      </g>
    </svg>
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
          width: "120%",
          height: "120%",
          background: `radial-gradient(circle, ${COLORS.greenGlow}22 0%, transparent 70%)`,
          filter: "blur(60px)",
        }}
      />

      <LogoVector size={ (style?.width as number || 400) / 4 } drawProgress={1} />
    </div>
  );
};