import React from "react";
import "./index.css";
import { Composition } from "remotion";
import { LogoAnimation } from "./LogoAnimation";
import { FullVideo } from "./FullVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LogoAnimation"
        component={LogoAnimation}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="FullVideo16x9"
        component={FullVideo}
        durationInFrames={1950} // Half of 3900 because 30fps
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="FullVideo1x1"
        component={FullVideo}
        durationInFrames={1950}
        fps={30}
        width={1080}
        height={1080}
      />

    </>
  );
};
