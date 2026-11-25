import { z } from "zod";

/** Things Sunny can show on his face. Matches the rig's expression set. */
/** Both characters understand all of these; each draws them its own way. */
export const Expression = z.enum(["happy", "wink", "surprised", "laughing", "deadpan", "annoyed", "smirk"]);
export type Expression = z.infer<typeof Expression>;

/** Body animation for a beat. */
export const Action = z.enum(["idle", "dance", "wave", "jump", "spin"]);
export type Action = z.infer<typeof Action>;

/** Background sets available to the renderer. */
export const Scene = z.enum(["park", "bedroom", "rainbow"]);
export type Scene = z.infer<typeof Scene>;

/** Who says a line. Older scripts without it are all Sunny. */
export const Speaker = z.enum(["sunny", "moon"]);
export type Speaker = z.infer<typeof Speaker>;

/** One spoken line of the episode. */
export const Beat = z.object({
  speaker: Speaker.default("sunny"),
  line: z.string().min(1).max(140),
  expression: Expression,
  action: Action,
  scene: Scene.optional(),
  /** The joke lands on this line: the camera punches in, with an impact sound. */
  punchline: z.boolean().optional(),
});
export type Beat = z.infer<typeof Beat>;

/** What the script writer (Claude) produces. */
export const EpisodeScript = z.object({
  title: z.string().min(5).max(90),
  description: z.string().min(20).max(900),
  tags: z.array(z.string()).min(3).max(15),
  theme: z.string().min(2).max(60),
  /** Big on-screen text shown from the first frame, e.g. "POV: your phone hits 1%". */
  hook: z.string().min(3).max(60),
  scene: Scene,
  beats: z.array(Beat).min(3).max(8),
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
  hook?: string;
  /** Display name of the second character in the name tag. */
  moonName?: string;
  musicFile?: string; // relative to public dir
  /** Folder (relative to public dir) holding pop.wav, whoosh.wav, boom.wav, boing.wav. Empty = no SFX. */
  sfxDir?: string;
  fps: number;
  gapSeconds: number; // pause between beats
  outroSeconds: number; // short hold after the last line so the Short loops cleanly
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
