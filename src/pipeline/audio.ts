import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function ffmpeg(args: string[]): Promise<void> {
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
}

export async function durationOf(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return Number(stdout.trim());
}

/**
 * Normalise any TTS output to 44.1 kHz mono WAV, optionally pitch-shifted (tempo kept),
 * trimmed of leading/trailing silence, with loudness levelled for Shorts.
 */
export async function toEpisodeWav(input: string, output: string, pitch = 1): Promise<void> {
  const filters: string[] = [];
  if (pitch && Math.abs(pitch - 1) > 0.001) {
    filters.push(`asetrate=44100*${pitch}`, "aresample=44100", `atempo=${(1 / pitch).toFixed(4)}`);
  }
  filters.push(
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05",
    "areverse",
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08",
    "areverse",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
  );
  await ffmpeg(["-i", input, "-af", filters.join(","), "-ar", "44100", "-ac", "1", output]);
}
