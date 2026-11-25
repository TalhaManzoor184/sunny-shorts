import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { EpisodeProps, Expression, MouthShape, RenderedBeat, Speaker } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { Captions } from "./Captions";
import { blendedPose } from "./pose";
import { MusicNotes, SceneBackground } from "./scenes/Scenes";
import { Moon, MoonDefs } from "./moon/Moon";
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

  const t = Math.min(local, beat.duration + 0.4);
  const mouth = inOutro ? null : mouthAt(beat, local);
  const scene = beat.scene ?? props.scene;
  const duo = props.beats.some((b) => b.speaker === "moon");
  const speaker: Speaker = duo ? beat.speaker : "sunny";

  // The listener keeps the face from their own last line (or their default).
  const lastFace = (who: Speaker): Expression => {
    for (let i = idx; i >= 0; i--) if (props.beats[i].speaker === who) return props.beats[i].expression;
    return who === "moon" ? "deadpan" : "happy";
  };
  const sunnyFace = speaker === "sunny" ? beat.expression : lastFace("sunny");
  const moonFace = speaker === "moon" ? beat.expression : lastFace("moon");

  const talking = blendedPose(beat.action, t);
  const idle = blendedPose("idle", sec);
  const sunnyPose = speaker === "sunny" ? talking : idle;
  const moonPose = speaker === "moon" ? talking : idle;

  // Moon floats low on the left, Sunny stands on the right; both stay below the caption area.
  const SUN = duo ? { x: 380, y: 612, s: 0.82 } : { x: 270, y: 590, s: 1.05 };
  const MOON = { x: 138, y: 556, s: 0.74 };
  const moonBob = Math.sin(frame / 22) * 7 + moonPose.y * 0.6;

  // Camera: lean towards whoever is talking; small punch-in on every new line;
  // on the punchline, zoom into the speaker's face with a shake.
  const beatFrame = Math.round(local * fps);
  const panFor = (who: Speaker) => (!duo ? 0 : who === "moon" ? 24 : -22);
  const prevSpeaker: Speaker = idx > 0 && duo ? props.beats[idx - 1].speaker : speaker;
  const camX = interpolate(beatFrame, [0, 8], [panFor(prevSpeaker), panFor(speaker)], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  let zoom = interpolate(beatFrame, [0, 8], [1.04, 1], { extrapolateRight: "clamp" });
  let shakeX = 0;
  let shakeY = 0;
  if (beat.punchline) {
    zoom = interpolate(beatFrame, [0, 6], [1, 1.24], { extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });
    const sh = interpolate(beatFrame, [0, 10], [7, 0], { extrapolateRight: "clamp" });
    shakeX = Math.sin(beatFrame * 2.7) * sh;
    shakeY = Math.cos(beatFrame * 3.1) * sh * 0.6;
  }
  const focus = beat.punchline
    ? speaker === "moon"
      ? { x: MOON.x, y: MOON.y + moonBob }
      : { x: SUN.x, y: SUN.y - 30 }
    : { x: 270, y: 480 };
  const tone = speaker === "moon" ? { color: "#CDBBFF", name: (props.moonName ?? "Moon").toUpperCase() } : { color: COLORS.yellow, name: "SUNNY" };

  return (
    <AbsoluteFill style={{ backgroundColor: "#7FD3FF" }}>
      <svg viewBox="0 0 540 960" width="100%" height="100%">
        <SunnyDefs />
        <MoonDefs />
        <g transform={`translate(${camX.toFixed(2)} 0)`}>
          <g transform={`translate(${focus.x + shakeX} ${focus.y + shakeY}) scale(${zoom.toFixed(4)}) translate(${-focus.x} ${-focus.y})`}>
            <g transform={`translate(${-camX.toFixed(2)} 0)`}>
              <SceneBackground scene={scene} f={frame} />
            </g>
            <MusicNotes f={frame} />
            {beat.punchline && (
              <g transform={`translate(${(speaker === "moon" ? MOON.x : SUN.x) - 270} ${(speaker === "moon" ? MOON.y : SUN.y) - 590})`}>
                <ImpactBurst f={beatFrame} />
              </g>
            )}
            {duo && (
              <>
                <ellipse cx={MOON.x} cy={782} rx={70 - moonBob * 0.6} ry={9} fill="#000" opacity={0.1} />
                <g
                  transform={`translate(${MOON.x} ${(MOON.y + moonBob).toFixed(1)}) rotate(${(moonPose.tilt * 0.7).toFixed(2)}) scale(${(MOON.s * moonPose.scaleX).toFixed(3)} ${MOON.s})`}
                >
                  <Moon
                    expression={moonFace}
                    mouth={speaker === "moon" ? mouth : null}
                    blink={(frame + 40) % 110 < 5}
                    armL={28 + (moonPose.armL + 8)}
                    armR={28 + (moonPose.armR + 8)}
                    lookX={speaker === "moon" ? Math.sin(frame / 45) * 2 : 4}
                  />
                </g>
              </>
            )}
            <ellipse cx={SUN.x} cy={782} rx={(SUN.s / 1.05) * 112 * (1 + sunnyPose.y / 300)} ry={13} fill="#000" opacity={0.16} />
            <g
              transform={`translate(${SUN.x} ${(SUN.y + sunnyPose.y).toFixed(1)}) rotate(${sunnyPose.tilt.toFixed(2)}) scale(${(SUN.s * sunnyPose.scaleX).toFixed(3)} ${SUN.s})`}
            >
              <Sunny
                expression={sunnyFace}
                mouth={speaker === "sunny" ? mouth : null}
                blink={frame % 96 < 4}
                armL={sunnyPose.armL}
                armR={sunnyPose.armR}
                legL={sunnyPose.legL}
                legR={sunnyPose.legR}
                lookX={speaker === "sunny" || !duo ? Math.sin(frame / 45) * 2 : -4}
              />
            </g>
          </g>
        </g>
        {props.hook && <HookBanner text={props.hook} frame={frame} />}
        <g transform="translate(0 85)">
          <Captions
            words={beat.words}
            t={inOutro ? beat.duration : local}
            appear={1}
            activeColor={tone.color}
            label={duo ? { text: tone.name, fill: tone.color } : undefined}
          />
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
