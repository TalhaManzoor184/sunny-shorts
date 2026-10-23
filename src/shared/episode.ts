import { z } from "zod";

/** Things Sunny can show on his face. Matches the rig's expression set. */
export const Expression = z.enum(["happy", "wink", "surprised", "laughing"]);
export type Expression = z.infer<typeof Expression>;

/** Body animation for a beat. */
export const Action = z.enum(["idle", "dance", "wave", "jump", "spin"]);
export type Action = z.infer<typeof Action>;

/** Background sets available to the renderer. */
export const Scene = z.enum(["park", "bedroom", "rainbow"]);
export type Scene = z.infer<typeof Scene>;

/** One spoken line of the episode. */
export const Beat = z.object({
  line: z.string().min(1).max(140),
  expression: Expression,
  action: Action,
  scene: Scene.optional(),
});
export type Beat = z.infer<typeof Beat>;

/** What the script writer (Claude) produces. */
export const EpisodeScript = z.object({
  title: z.string().min(5).max(90),
  description: z.string().min(20).max(900),
  tags: z.array(z.string()).min(3).max(15),
  theme: z.string().min(2).max(60),
  scene: Scene,
  beats: z.array(Beat).min(4).max(12),
});
export type EpisodeScript = z.infer<typeof EpisodeScript>;

/** Rhubarb mouth shapes. */
export const MouthShape = z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "X"]);
export type MouthShape = z.infer<typeof MouthShape>;

export type MouthCue = { start: number; end: number; value: MouthShape };
export type WordTiming = { text: string; start: number; end: number };

/** A beat after voice + lip sync, with timing in seconds relative to the beat start. */
export type RenderedBeat = Beat & {
  audioFile: string; // path relative to Remotion's public dir
  duration: number;
  words: WordTiming[];
  mouthCues: MouthCue[];
};

/** Everything the Remotion composition needs. Passed as inputProps. */
export type EpisodeProps = {
  title: string;
  scene: Scene;
  beats: RenderedBeat[];
  musicFile?: string; // relative to public dir
  fps: number;
  gapSeconds: number; // pause between beats
  outroSeconds: number; // "Shine, Shine, Sunny!" end card
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
