import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, interpolate } from "remotion";
import { Scene1, Scene2, Scene3, Scene4, Scene5 } from "./scenes/Scene1_5";
import { Scene6, Scene7, Scene8, Scene9, Scene10 } from "./scenes/Scene6_10";
import { Scene11, Scene12, Scene13, Scene14, Scene15 } from "./scenes/Scene11_15";
import { BackgroundGrid, GreenParticles } from "./components/GlobalComponents";

export const FullVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [3870, 3900], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#050A05" }}>
      {/* Global persistent background across all scenes */}
      <BackgroundGrid />
      <GreenParticles />
      {/* Placeholder for Voice Over */}
      {/* <Audio src={staticFile("voiceover.mp3")} /> */}
      
      <Series>
        <Series.Sequence durationInFrames={180}>
          <Scene1 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={270}>
          <Scene2 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <Scene3 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <Scene4 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={330}>
          <Scene5 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <Scene6 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <Scene7 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <Scene8 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <Scene9 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={180}>
          <Scene10 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <Scene11 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <Scene12 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={180}>
          <Scene13 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={180}>
          <Scene14 />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <Scene15 />
        </Series.Sequence>
      </Series>
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeOut, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
