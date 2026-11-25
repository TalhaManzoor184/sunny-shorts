import { spawn } from "node:child_process";
import fs from "node:fs";

/** Run a command, fail with the last part of stderr if it exits non-zero. */
export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-3000)}`)),
    );
  });
}

export const ffmpeg = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export type Probe = { duration: number; hasAudio: boolean; width: number; height: number };

export async function probe(file: string): Promise<Probe> {
  const json = JSON.parse(
    await run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]),
  ) as { format: { duration?: string }; streams: { codec_type: string; width?: number; height?: number }[] };
  const v = json.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`${file} has no video stream.`);
  return {
    duration: Number(json.format.duration ?? 0),
    hasAudio: json.streams.some((s) => s.codec_type === "audio"),
    width: v.width ?? 0,
    height: v.height ?? 0,
  };
}

/** A bold font drawtext can use. FONT_FILE overrides. */
export function fontFile(): string {
  const candidates = [
    process.env.FONT_FILE,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
  ].filter(Boolean) as string[];
  const f = candidates.find((c) => fs.existsSync(c));
  if (!f) throw new Error("No bold font found for on-screen text. Install fonts-dejavu-core or set FONT_FILE.");
  return f;
}

/** drawtext can't draw emoji; drop them and tidy the spaces they leave. */
export function plainText(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Greedy word wrap for drawtext (which has no wrapping of its own). */
export function wrap(s: string, width: number, maxLines = 4): string {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines.join("\n");
}

/** mm:ss or h:mm:ss, the format YouTube turns into chapters. */
export function timestamp(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}
