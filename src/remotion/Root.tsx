import "@fontsource/fredoka/700.css";
import React from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH, type EpisodeProps } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { Episode } from "./Episode";

/** Placeholder props so `npm run studio` opens without a generated episode. */
const PREVIEW: EpisodeProps = {
  title: "Preview",
  scene: "park",
  fps: FPS,
  hook: "POV: it's your first Short",
  gapSeconds: 0.2,
  outroSeconds: 0.5,
  beats: [
    {
      line: "Hi friends! It's me, Sunny!",
      expression: "happy",
      action: "wave",
      audioFile: "",
      duration: 2,
      words: [
        { text: "Hi", start: 0, end: 0.3 },
        { text: "friends!", start: 0.3, end: 0.9 },
        { text: "It's", start: 1.0, end: 1.2 },
        { text: "me,", start: 1.2, end: 1.4 },
        { text: "Sunny!", start: 1.4, end: 2 },
      ],
      mouthCues: [],
    },
  ],
};

export const Root: React.FC = () => (
  <Composition
    id="SunnyEpisode"
    component={Episode as unknown as React.FC<Record<string, unknown>>}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={90}
    defaultProps={PREVIEW as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const p = props as unknown as EpisodeProps;
      return { durationInFrames: computeTimeline(p).totalFrames, fps: p.fps };
    }}
  />
);
