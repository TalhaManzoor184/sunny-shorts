import type { EpisodeProps } from "./episode";

export const LEAD_IN_SECONDS = 0.25;

export type Timeline = {
  /** Start of each beat in seconds. */
  beatStarts: number[];
  /** Start of the outro card in seconds. */
  outroStart: number;
  totalSeconds: number;
  totalFrames: number;
};

export function computeTimeline(p: Pick<EpisodeProps, "beats" | "gapSeconds" | "outroSeconds" | "fps">): Timeline {
  const beatStarts: number[] = [];
  let t = LEAD_IN_SECONDS;
  p.beats.forEach((b, i) => {
    beatStarts.push(t);
    t += b.duration + (i < p.beats.length - 1 ? p.gapSeconds : 0.15);
  });
  const outroStart = t;
  const totalSeconds = t + p.outroSeconds;
  return { beatStarts, outroStart, totalSeconds, totalFrames: Math.ceil(totalSeconds * p.fps) };
}
