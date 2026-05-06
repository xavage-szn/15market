import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
  Easing,
  random,
} from "remotion";

// ─── Helpers ────────────────────────────────────────────────────────────────

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

// ─── Particle ───────────────────────────────────────────────────────────────

interface ParticleProps {
  angle: number;  // degrees
  delay: number;  // frames
  distance: number;
  size: number;
  color: string;
}

const Particle: React.FC<ParticleProps> = ({
  angle,
  delay,
  distance,
  size,
  color,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = Math.max(0, frame - delay);

  const travel = spring({
    frame: localFrame,
    fps,
    config: { damping: 200, stiffness: 80, mass: 0.5 },
    durationInFrames: 40,
  });

  const opacity = interpolate(localFrame, [0, 5, 35, 50], [0, 1, 0.7, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * distance * travel;
  const y = Math.sin(rad) * distance * travel;

  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        opacity,
        transform: `translate(${x}px, ${y}px)`,
        boxShadow: `0 0 ${size * 2}px ${color}`,
      }}
    />
  );
};

// ─── Ring ────────────────────────────────────────────────────────────────────

const Ring: React.FC<{ delay: number; maxRadius: number; color: string }> = ({
  delay,
  maxRadius,
  color,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = Math.max(0, frame - delay);

  const progress = spring({
    frame: localFrame,
    fps,
    config: { damping: 150, stiffness: 60 },
    durationInFrames: 50,
  });

  const radius = progress * maxRadius;
  const opacity = interpolate(progress, [0, 0.2, 1], [0, 0.8, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        width: radius * 2,
        height: radius * 2,
        borderRadius: "50%",
        border: `2px solid ${color}`,
        opacity,
        transform: "translate(-50%, -50%)",
        left: "50%",
        top: "50%",
        marginLeft: -radius,
        marginTop: -radius,
      }}
    />
  );
};

// ─── Main Composition ────────────────────────────────────────────────────────

export const LogoAnimation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // ── Phase timings (all in frames @ 30fps) ──
  const BURST_START = 0;
  const LOGO_IN_START = 8;
  const SHINE_START = 50;
  const SHINE_END = 90;
  const HOLD_END = durationInFrames - 25;
  const FADE_START = HOLD_END;

  // ── Logo scale-in (spring bounce) ──
  const scaleSpring = spring({
    frame: Math.max(0, frame - LOGO_IN_START),
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
    durationInFrames: 45,
  });

  // ── Logo opacity ──
  const logoOpacity = interpolate(
    frame,
    [LOGO_IN_START, LOGO_IN_START + 10, FADE_START, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ── Shine sweep: a bright glint moving across the logo ──
  const shineProgress = interpolate(frame, [SHINE_START, SHINE_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const shineX = interpolate(shineProgress, [0, 1], [-300, 700]);
  const shineOpacity = interpolate(
    frame,
    [SHINE_START, SHINE_START + 5, SHINE_END - 5, SHINE_END],
    [0, 0.7, 0.7, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ── Glow pulse ──
  const glowCycle = (frame - LOGO_IN_START) / fps;
  const glowPulse =
    0.5 + 0.5 * Math.sin(glowCycle * Math.PI * 2 * 0.8); // 0.8 Hz
  const glowIntensity = interpolate(
    frame,
    [LOGO_IN_START + 20, LOGO_IN_START + 40, FADE_START],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const glowRadius = 20 + glowPulse * 30 * glowIntensity;

  // ── Subtle float ──
  const floatY =
    Math.sin((frame / fps) * Math.PI * 2 * 0.4) * 6 *
    clamp(
      interpolate(frame, [LOGO_IN_START + 30, LOGO_IN_START + 50], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
      0,
      1
    );

  // ── Background gradient animation ──
  const bgShift = interpolate(frame, [0, durationInFrames], [0, 360], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Particle burst parameters ──
  const particles: ParticleProps[] = [];
  const PARTICLE_COUNT = 18;
  const colors = ["#3ecf5e", "#22c55e", "#86efac", "#ffffff", "#a3e635"];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      angle: (360 / PARTICLE_COUNT) * i,
      delay: BURST_START + Math.floor(random(`delay-${i}`) * 6),
      distance: 80 + random(`dist-${i}`) * 120,
      size: 4 + random(`size-${i}`) * 8,
      color: colors[i % colors.length],
    });
  }

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at ${50 + Math.sin(bgShift * 0.017) * 20}% ${50 + Math.cos(bgShift * 0.017) * 15}%, #0d1f12 0%, #040d07 60%, #000000 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* ── Background grid lines ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(34,197,94,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,197,94,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          opacity: interpolate(frame, [0, 30, FADE_START, durationInFrames], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />

      {/* ── Ambient glow orb ── */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)",
          opacity: glowIntensity,
          transform: `scale(${1 + glowPulse * 0.05 * glowIntensity})`,
        }}
      />

      {/* ── Expanding rings ── */}
      <Ring delay={BURST_START} maxRadius={200} color="rgba(34,197,94,0.6)" />
      <Ring delay={BURST_START + 8} maxRadius={280} color="rgba(134,239,172,0.4)" />
      <Ring delay={BURST_START + 16} maxRadius={360} color="rgba(34,197,94,0.2)" />

      {/* ── Particle burst (centered) ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        {particles.map((p, i) => (
          <Particle key={i} {...p} />
        ))}
      </div>

      {/* ── Logo container ── */}
      <div
        style={{
          position: "relative",
          opacity: logoOpacity,
          transform: `scale(${scaleSpring}) translateY(${floatY}px)`,
          filter: `drop-shadow(0 0 ${glowRadius}px rgba(34,197,94,${0.4 + glowPulse * 0.4 * glowIntensity}))`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Img
          src={staticFile("15logo.png")}
          style={{
            width: 480,
            height: "auto",
            objectFit: "contain",
          }}
        />

        {/* ── Shine sweep overlay ── */}
        <div
          style={{
            position: "absolute",
            top: -20,
            left: shineX,
            width: 80,
            height: "calc(100% + 40px)",
            background:
              "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)",
            opacity: shineOpacity,
            pointerEvents: "none",
          }}
        />
      </div>

      {/* ── Tagline text ── */}
      <div
        style={{
          position: "absolute",
          bottom: "18%",
          opacity: interpolate(
            frame,
            [LOGO_IN_START + 25, LOGO_IN_START + 45, FADE_START, durationInFrames],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          ),
          transform: `translateY(${interpolate(
            frame,
            [LOGO_IN_START + 25, LOGO_IN_START + 45],
            [20, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )}px)`,
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          fontSize: 18,
          letterSpacing: "0.35em",
          textTransform: "uppercase",
          color: "rgba(134,239,172,0.85)",
          textShadow: "0 0 20px rgba(34,197,94,0.5)",
        }}
      >
        Trade. Earn. Grow.
      </div>
    </AbsoluteFill>
  );
};
