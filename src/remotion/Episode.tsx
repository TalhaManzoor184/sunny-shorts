import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { EpisodeProps, MouthShape, RenderedBeat } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { Captions } from "./Captions";
import { blendedPose } from "./pose";
import { MusicNotes, SceneBackground } from "./scenes/Scenes";
import { COLORS, Sunny, SunnyDefs } from "./sunny/Sunny";

const FONT = "Fredoka, 'Arial Rounded MT Bold', sans-serif";

function mouthAt(beat: RenderedBeat, t: number): MouthShape | null {
  if (t < 0 || t > beat.duration) return null;
  const cue = beat.mouthCues.find((c) => t >= c.start && t < c.end);
  return cue ? cue.value : "X";
}

/** One line if it fits, otherwise two lines split at the word break closest to the middle. */
function balance(text: string, fits: number): string[] {
  const t = text.trim();
  if (t.length <= fits) return [t];
  const words = t.split(/\s+/);
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    const diff = Math.max(a, b);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * The hook: a big text card at the top, fully visible from frame 0 (that first frame is
 * what people see before they decide to swipe). It stays for the whole Short.
 */
const HookBanner: React.FC<{ text: string; frame: number }> = ({ text, frame }) => {
  const lines = balance(text, 17);
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(40, Math.floor(400 / (longest * 0.56))); // shrink only if a line is very long
  const lineH = size * 1.2;
  const h = lines.length * lineH + 26;
  const wobble = Math.sin(frame / 18) * 0.6;
  return (
    <g transform={`translate(255 ${74 + h / 2}) rotate(${(-1.5 + wobble).toFixed(2)})`}>
      <rect x={-215} y={-h / 2} width={430} height={h} rx={18} fill="#FFFFFF" stroke={COLORS.outline} strokeWidth={5} />
      <text textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={size} fill={COLORS.outline}>
        {lines.map((l, i) => (
          <tspan key={i} x={0} y={-h / 2 + 13 + lineH * (i + 0.78)}>
            {l}
          </tspan>
        ))}
      </text>
    </g>
  );
};

/** Comic "impact" lines behind Sunny when the punchline lands. */
const ImpactBurst: React.FC<{ f: number }> = ({ f }) => {
  const o = interpolate(f, [0, 3, 14], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (o <= 0) return null;
  const grow = interpolate(f, [0, 14], [0.7, 1.15], { extrapolateRight: "clamp" });
  return (
    <g transform={`translate(270 560) scale(${grow})`} opacity={o}>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const r1 = 190;
        const r2 = i % 2 ? 260 : 300;
        return (
          <line
            key={i}
            x1={Math.cos(a) * r1}
            y1={Math.sin(a) * r1}
            x2={Math.cos(a) * r2}
            y2={Math.sin(a) * r2}
            stroke="#FFFFFF"
            strokeWidth={9}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
};

export const Episode: React.FC<EpisodeProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const tl = computeTimeline(props);

  // Which beat are we in (or after)? After the last line we hold its pose so the Short loops cleanly.
  let idx = 0;
  for (let i = 0; i < tl.beatStarts.length; i++) if (sec >= tl.beatStarts[i]) idx = i;
  const beat = props.beats[idx];
  const local = sec - tl.beatStarts[idx];
  const inOutro = sec >= tl.outroStart;

  const pose = blendedPose(beat.action, Math.min(local, beat.duration + 0.4));
  const mouth = inOutro ? null : mouthAt(beat, local);
  const blink = frame % 96 < 4;
  const scene = beat.scene ?? props.scene;

  // Camera: small punch-in on every new line; on the punchline, zoom towards the face with a shake.
  const beatFrame = Math.round(local * fps);
  let zoom = interpolate(beatFrame, [0, 8], [1.04, 1], { extrapolateRight: "clamp" });
  let shakeX = 0;
  let shakeY = 0;
  if (beat.punchline) {
    zoom = interpolate(beatFrame, [0, 6], [1, 1.24], { extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });
    const s = interpolate(beatFrame, [0, 10], [7, 0], { extrapolateRight: "clamp" });
    shakeX = Math.sin(beatFrame * 2.7) * s;
    shakeY = Math.cos(beatFrame * 3.1) * s * 0.6;
  }
  const focusY = beat.punchline ? 560 : 480;
  const capAppear = 1; // captions fully visible from the first frame of each line

  return (
    <AbsoluteFill style={{ backgroundColor: "#7FD3FF" }}>
      <svg viewBox="0 0 540 960" width="100%" height="100%">
        <SunnyDefs />
        <g transform={`translate(${270 + shakeX} ${focusY + shakeY}) scale(${zoom.toFixed(4)}) translate(-270 -${focusY})`}>
          <SceneBackground scene={scene} f={frame} />
          <MusicNotes f={frame} />
          {beat.punchline && <ImpactBurst f={beatFrame} />}
          <ellipse cx={270} cy={782} rx={112 * (1 + pose.y / 300)} ry={13} fill="#000" opacity={0.16} />
          <g transform={`translate(270 ${(590 + pose.y).toFixed(1)}) rotate(${pose.tilt.toFixed(2)}) scale(${(1.05 * pose.scaleX).toFixed(3)} 1.05)`}>
            <Sunny
              expression={beat.expression}
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
        {props.hook && <HookBanner text={props.hook} frame={frame} />}
        <g transform="translate(0 85)">
          <Captions words={beat.words} t={inOutro ? beat.duration : local} appear={capAppear} />
        </g>
      </svg>

      {props.beats.map(
        (b, i) =>
          b.audioFile && (
            <Sequence key={`v${i}`} from={Math.round(tl.beatStarts[i] * fps)} durationInFrames={Math.ceil((b.duration + 0.1) * fps)}>
              <Audio src={staticFile(b.audioFile)} />
            </Sequence>
          ),
      )}

      {props.sfxDir &&
        props.beats.map((b, i) => {
          const from = Math.round(tl.beatStarts[i] * fps);
          const prevScene = i > 0 ? (props.beats[i - 1].scene ?? props.scene) : null;
          const sceneChanged = i > 0 && (b.scene ?? props.scene) !== prevScene;
          const sounds: [string, number, number][] = []; // [file, volume, offsetFrames]
          if (b.punchline) sounds.push(["boom.wav", 0.55, 0]);
          else if (sceneChanged) sounds.push(["whoosh.wav", 0.45, -4]);
          else if (i > 0) sounds.push(["pop.wav", 0.3, 0]);
          if (b.action === "jump" || b.action === "spin") sounds.push(["boing.wav", 0.3, 3]);
          return sounds.map(([file, volume, off], k) => (
            <Sequence key={`s${i}-${k}`} from={Math.max(0, from + off)} durationInFrames={fps}>
              <Audio src={staticFile(`${props.sfxDir}/${file}`)} volume={volume} />
            </Sequence>
          ));
        })}

      {props.musicFile && <Audio src={staticFile(props.musicFile)} volume={0.1} loop />}
    </AbsoluteFill>
  );
};
