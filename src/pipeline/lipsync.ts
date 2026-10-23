import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import type { MouthCue } from "../shared/episode";
import { ffmpeg } from "./audio";
import { config } from "./config";

const run = promisify(execFile);

/** Run Rhubarb Lip Sync on a voice clip and return mouth cues (A–H, X) in seconds. */
export async function mouthCues(wavPath: string, dialog: string): Promise<MouthCue[]> {
  const base = wavPath.replace(/\.wav$/, "");
  const pcm = `${base}.rhubarb.wav`;
  const dialogFile = `${base}.txt`;
  const out = `${base}.cues.json`;
  // Rhubarb wants 16-bit PCM WAV.
  await ffmpeg(["-i", wavPath, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", pcm]);
  await fs.writeFile(dialogFile, dialog);
  await run(config.rhubarbPath, ["-q", "-f", "json", "--extendedShapes", "GHX", "-d", dialogFile, "-o", out, pcm], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const json = JSON.parse(await fs.readFile(out, "utf8")) as { mouthCues: MouthCue[] };
  await Promise.all([pcm, dialogFile].map((f) => fs.rm(f, { force: true })));
  return json.mouthCues;
}
