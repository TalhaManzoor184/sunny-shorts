import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { EpisodeProps, MouthShape, RenderedBeat } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { Captions } from "./Captions";
import { blendedPose, poseFor } from "./pose";
import { MusicNotes, SceneBackground } from "./scenes/Scenes";
import { COLORS, Sunny, SunnyDefs, starPath } from "./sunny/Sunny";

function mouthAt(beat: RenderedBeat, t: number): MouthShape | null {
  if (t < 0 || t > beat.duration) return null;
  const cue = beat.mouthCues.find((c) => t >= c.start && t < c.end);
  return cue ? cue.value : "X";
}

const EndCard: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const pop = spring({ frame, fps, config: { damping: 9, stiffness: 140 } });
  return (
    <g transform={`translate(255 250) rotate(-5) scale(${pop})`}>
      {[...Array(6)].map((_, i) => {
        const a = (i / 6) * Math.PI * 2 + frame / 20;
        return <path key={i} d={starPath(16, 7, Math.cos(a) * 210, Math.sin(a) * 90)} fill="#fff" stroke={COLORS.outline} strokeWidth={3} />;
      })}
      <text
        textAnchor="middle"
        fontFamily="Fredoka, 'Arial Rounded MT Bold', sans-serif"
        fontWeight={700}
        fontSize={64}
        paintOrder="stroke"
        stroke={COLORS.outline}
        strokeWidth={14}
        strokeLinejoin="round"
      >
        <tspan x={0} y={-10} fill={COLORS.yellow}>
          Shine, Shine,
        </tspan>
        <tspan x={0} y={62} fill="#fff">
          Sunny!
        </tspan>
      </text>
    </g>
  );
};

export const Episode: React.FC<EpisodeProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const tl = computeTimeline(props);

  // Which beat are we in (or after)?
  let idx = 0;
  for (let i = 0; i < tl.beatStarts.length; i++) if (sec >= tl.beatStarts[i]) idx = i;
  const beat = props.beats[idx];
  const local = sec - tl.beatStarts[idx];
  const inOutro = sec >= tl.outroStart;

  const expression = inOutro ? "laughing" : beat.expression;
  const pose = inOutro ? poseFor("jump", sec - tl.outroStart) : blendedPose(beat.action, local);
  const mouth = inOutro ? null : mouthAt(beat, local);
  const blink = !inOutro && frame % 96 < 4;
  const scene = beat.scene ?? props.scene;

  // Small camera punch-in at each beat start.
  const beatFrame = Math.round(local * fps);
  const punch = inOutro ? 1 : interpolate(beatFrame, [0, 8], [1.035, 1], { extrapolateRight: "clamp" });
  const capAppear = interpolate(beatFrame, [0, 5], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#7FD3FF" }}>
      <svg viewBox="0 0 540 960" width="100%" height="100%">
        <SunnyDefs />
        <g transform={`translate(270 480) scale(${punch}) translate(-270 -480)`}>
          <SceneBackground scene={scene} f={frame} />
          <MusicNotes f={frame} />
          <ellipse cx={270} cy={782} rx={112 * (1 + pose.y / 300)} ry={13} fill="#000" opacity={0.16} />
          <g transform={`translate(270 ${(590 + pose.y).toFixed(1)}) rotate(${pose.tilt.toFixed(2)}) scale(${(1.05 * pose.scaleX).toFixed(3)} 1.05)`}>
            <Sunny
              expression={expression}
              mouth={mouth}
              blink={blink}
              armL={pose.armL}
              armR={pose.armR}
              legL={pose.legL}
              legR={pose.legR}
              lookX={Math.sin(frame / 45) * 2}
            />
          </g>
        </g>
        {!inOutro && local <= beat.duration + 0.25 && <Captions words={beat.words} t={local} appear={capAppear} />}
        {inOutro && <EndCard frame={frame - Math.round(tl.outroStart * fps)} fps={fps} />}
      </svg>

      {props.beats.map((b, i) => b.audioFile && (
        <Sequence key={i} from={Math.round(tl.beatStarts[i] * fps)} durationInFrames={Math.ceil((b.duration + 0.1) * fps)}>
          <Audio src={staticFile(b.audioFile)} />
        </Sequence>
      ))}
      {props.musicFile && <Audio src={staticFile(props.musicFile)} volume={0.12} loop />}
    </AbsoluteFill>
  );
};
