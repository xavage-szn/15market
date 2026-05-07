import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, interpolate, Audio, staticFile } from "remotion";
import { Scene1, Scene2, Scene3, Scene4, Scene5 } from "./scenes/Scene1_5";
import { Scene6, Scene7, Scene8, Scene9, Scene10 } from "./scenes/Scene6_10";
import { Scene11, Scene12, Scene13, Scene14, Scene15 } from "./scenes/Scene11_15";
import { FuturisticBackground, SceneZoomTransition } from "./components/GlobalComponents";

export const FullVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [1920, 1950], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });


  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>

      {/* Static Background */}
      <FuturisticBackground />

      {/* Audio Tracks - Place 'voiceover.mp3' and 'music.mp3' in your public/ folder! */}
      {/* <Audio src={staticFile("voiceover.mp3")} /> */}
      {/* <Audio src={staticFile("music.mp3")} volume={0.15} /> */}

      <Series>
        <Series.Sequence durationInFrames={90}>
          <SceneZoomTransition exitFrames={30} exitScale={12.0}><Scene1 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={135}>
          <SceneZoomTransition entryFrames={20} entryScale={3.0}><Scene2 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <SceneZoomTransition><Scene3 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <SceneZoomTransition><Scene4 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={165}>
          <SceneZoomTransition><Scene5 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <SceneZoomTransition><Scene6 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          {/* Scene 7 hero moment: slower entry to let logo breathe */}
          <SceneZoomTransition entryFrames={15} exitFrames={5} entryScale={1.08} exitScale={1.2}>
            <Scene7 />
          </SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <SceneZoomTransition><Scene8 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          {/* Scene 9 desktop UI: gentler zoom so the mockup reads clearly */}
          <SceneZoomTransition entryFrames={11} exitFrames={6} entryScale={1.06} exitScale={1.1}>
            <Scene9 />
          </SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          {/* Scene 10 WIN: explosive punch in */}
          <SceneZoomTransition entryFrames={4} exitFrames={5} entryScale={1.25} exitScale={1.12}>
            <Scene10 />
          </SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <SceneZoomTransition><Scene11 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <SceneZoomTransition><Scene12 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <SceneZoomTransition><Scene13 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <SceneZoomTransition><Scene14 /></SceneZoomTransition>
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          {/* Final scene: dramatic slow settle */}
          <SceneZoomTransition entryFrames={20} exitFrames={10} entryScale={1.1} exitScale={1.05}>
            <Scene15 />
          </SceneZoomTransition>
        </Series.Sequence>
      </Series>
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeOut, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
