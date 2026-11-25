import fs from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { config, ROOT } from "./config";
import { ffmpeg, fontFile, plainText, probe, timestamp, wrap, type Probe } from "./ffmpeg";
import { loadHistory } from "./history";
import { publishAtIso, youtubeClient } from "./upload";

/**
 * Long-form compilation: joins archived Shorts into one 16:9 video with an intro, an end card,
 * chapters and a thumbnail, then uploads it. Watch time on long videos counts toward the
 * 4,000 public watch hours; Shorts views don't.
 *
 *   npm run compile                          build the next volume from archive/ and upload it
 *   npm run compile -- --no-upload           build only (out/compilation-vol-N/compilation.mp4)
 *   npm run compile -- --if-enough           do nothing if there isn't --min-minutes of new episodes yet
 *   npm run compile -- --dir=path            folder of archived episodes (default: archive)
 *   npm run compile -- --min-minutes=8 --max-minutes=12 --outro=10
 *   npm run compile -- --allow-reuse         top up with episodes used in earlier volumes
 *
 * Archived files are named <date>_<youtubeVideoId>.mp4 (see src/scripts/archive-collect.ts);
 * titles come from data/history.json. Which episodes went into which volume is kept in
 * data/compilations.json so each volume has new episodes.
 */

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const num = (k: string, d: number) => (args.has(k) ? Number(args.get(k)) : d);

const W = 1920;
const H = 1080;
const FPS = 30;
const INTRO_SECONDS = 4;
const MIN_CHAPTER_SECONDS = 10; // YouTube ignores chapters shorter than this
const STATE = path.join(ROOT, "data/compilations.json");
const MUSIC = path.join(config.paths.music, "sunny-bounce.wav");

const ENCODE = [
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS),
  "-video_track_timescale", "15360",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
];

type Volume = { volume: number; date: string; videoId?: string; publishAt?: string; title: string; episodes: string[]; seconds: number };
type State = { exclude: string[]; volumes: Volume[] };
type Clip = { file: string; date: string; videoId: string; title: string; info: Probe };

async function loadState(): Promise<State> {
  try {
    const s = JSON.parse(await fs.readFile(STATE, "utf8")) as Partial<State>;
    return { exclude: s.exclude ?? [], volumes: s.volumes ?? [] };
  } catch {
    return { exclude: [], volumes: [] };
  }
}

/** Escape a value for use inside an ffmpeg filtergraph option. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");

/** Blurred, darkened full-frame copy of [in] behind a sharp copy scaled to fgHeight. */
function backdrop(input: string, fgHeight: number, fgX: string, out: string) {
  return [
    `${input}split=2[bgsrc][fgsrc]`,
    `[bgsrc]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=luma_radius=40:luma_power=2:chroma_radius=20,eq=brightness=-0.14:saturation=1.15[bg]`,
    `[fgsrc]scale=-2:${fgHeight}[fg]`,
    `[bg][fg]overlay=${fgX}:(H-h)/2${out}`,
  ];
}

async function text(dir: string, name: string, body: string) {
  const f = path.join(dir, `${name}.txt`);
  await fs.writeFile(f, body);
  return f;
}

function drawtext(font: string, file: string, size: number, x: string, y: string, color = "white") {
  return `drawtext=fontfile='${esc(font)}':textfile='${esc(file)}':fontsize=${size}:fontcolor=${color}:line_spacing=${Math.round(size * 0.25)}:borderw=${Math.max(3, Math.round(size / 14))}:bordercolor=black@0.7:x=${x}:y=${y}`;
}

async function stillFrom(clip: Clip, at: number, out: string) {
  await ffmpeg(["-ss", String(Math.min(at, Math.max(0, clip.info.duration - 0.5))), "-i", clip.file, "-frames:v", "1", out]);
}

/** One episode, letterboxed to 16:9 with its title in the side panel, loudness-matched. */
async function episodeSegment(clip: Clip, n: number, total: number, dir: string, font: string, out: string) {
  const d = clip.info.duration;
  const fgW = Math.round((clip.info.width * H) / clip.info.height / 2) * 2;
  const side = Math.max(0, (W - fgW) / 2);
  const filters = [...backdrop("[0:v]fps=" + FPS + ",", H, "(W-w)/2", "[base]")];
  let v = "[base]";
  if (side >= 300) {
    const title = await text(dir, `title-${n}`, wrap(plainText(clip.title), 15, 5));
    const count = await text(dir, `count-${n}`, `${n} / ${total}`);
    const brand = await text(dir, `brand-${n}`, "SUNNY");
    const tag = await text(dir, `tag-${n}`, "a new short\nevery day");
    filters.push(
      `${v}${drawtext(font, title, 52, `(${side}-text_w)/2`, "(h-text_h)/2")},` +
        `${drawtext(font, count, 34, `(${side}-text_w)/2`, "h-110", "white@0.75")},` +
        `${drawtext(font, brand, 84, `${W - side}+(${side}-text_w)/2`, "(h/2)-120", "0xFFD43B")},` +
        `${drawtext(font, tag, 38, `${W - side}+(${side}-text_w)/2`, "(h/2)+10", "white@0.85")}[txt]`,
    );
    v = "[txt]";
  }
  filters.push(
    `${v}fade=t=in:st=0:d=0.2,fade=t=out:st=${(d - 0.3).toFixed(2)}:d=0.3,format=yuv420p,setsar=1[v]`,
    `[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,` +
      `afade=t=in:d=0.15,afade=t=out:st=${(d - 0.3).toFixed(2)}:d=0.3,atrim=0:${d.toFixed(3)}[a]`,
  );
  const audioIn = clip.info.hasAudio
    ? ["-i", clip.file]
    : ["-f", "lavfi", "-t", d.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo"];
  await ffmpeg([
    "-i", clip.file, ...audioIn,
    "-filter_complex", filters.join(";"),
    "-map", "[v]", "-map", "[a]", "-t", d.toFixed(3), ...ENCODE, out,
  ]);
}

/** Title card or end card: blurred still, sharp still on the right, text on the left, music under it. */
async function card(opts: { still: string; seconds: number; heading: string; sub: string; dir: string; name: string; font: string; out: string }) {
  const { still, seconds, dir, name, font, out } = opts;
  const heading = await text(dir, `${name}-h`, wrap(opts.heading, 14, 3));
  const sub = await text(dir, `${name}-s`, wrap(opts.sub, 36, 3));
  const filters = [
    ...backdrop("[0:v]", 900, "W-w-170", "[base]"),
    `[base]${drawtext(font, heading, 104, "130", "(h/2)-text_h-10", "0xFFD43B")},` +
      `${drawtext(font, sub, 50, "134", "(h/2)+40")},` +
      `fade=t=in:st=0:d=0.4,fade=t=out:st=${seconds - 0.5}:d=0.5,format=yuv420p,setsar=1[v]`,
    `[1:a]atrim=0:${seconds},asetpts=N/SR/TB,volume=0.55,aresample=48000,aformat=channel_layouts=stereo,` +
      `afade=t=in:d=0.4,afade=t=out:st=${seconds - 0.8}:d=0.8[a]`,
  ];
  const audioIn = existsSync(MUSIC)
    ? ["-stream_loop", "-1", "-i", MUSIC]
    : ["-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=48000:cl=stereo"];
  await ffmpeg([
    "-loop", "1", "-framerate", String(FPS), "-t", String(seconds), "-i", still, ...audioIn,
    "-filter_complex", filters.join(";"),
    "-map", "[v]", "-map", "[a]", "-t", String(seconds), ...ENCODE, out,
  ]);
}

async function thumbnail(still: string, volume: number, font: string, dir: string, out: string) {
  const big = await text(dir, "thumb-h", "FUNNIEST\nMOMENTS");
  const vol = await text(dir, "thumb-v", `VOL. ${volume}`);
  await ffmpeg([
    "-i", still,
    "-filter_complex",
    [
      ...backdrop("[0:v]", 1000, "W-w-120", "[base]"),
      `[base]${drawtext(font, big, 150, "90", "(h/2)-text_h", "0xFFD43B")},` +
        `${drawtext(font, vol, 120, "96", "(h/2)+80")},scale=1280:720[v]`,
    ].join(";"),
    "-map", "[v]", "-frames:v", "1", "-q:v", "3", out,
  ]);
}

/** Chapter list: first one at 00:00 (covers the intro), none shorter than 10 s. */
function chapters(starts: { at: number; title: string }[], end: number): string[] {
  const kept: { at: number; title: string }[] = [];
  for (const [i, c] of starts.entries()) {
    const at = i === 0 ? 0 : Math.floor(c.at);
    // Starting this chapter would leave the previous one too short: fold it into the previous one.
    if (kept.length && at - kept[kept.length - 1].at < MIN_CHAPTER_SECONDS) continue;
    kept.push({ at, title: c.title });
  }
  if (kept.length > 1 && end - kept[kept.length - 1].at < MIN_CHAPTER_SECONDS) kept.pop();
  return kept.length >= 3 ? kept.map((c) => `${timestamp(c.at)} ${c.title}`) : [];
}

async function main() {
  const dir = path.resolve(args.get("dir") ?? path.join(ROOT, "archive"));
  const minSeconds = num("min-minutes", 8) * 60;
  const maxSeconds = num("max-minutes", 12) * 60;
  const outroSeconds = num("outro", 10);

  const [history, state] = await Promise.all([loadHistory(), loadState()]);
  const titles = new Map(history.filter((h) => h.videoId).map((h) => [h.videoId!, h.title]));
  const used = new Set(state.volumes.flatMap((v) => v.episodes));
  const excluded = new Set(state.exclude);

  const files = existsSync(dir) ? (await fs.readdir(dir)).filter((f) => f.endsWith(".mp4")).sort() : [];
  const available: Clip[] = [];
  for (const f of files) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})_(.+)\.mp4$/);
    if (!m) continue;
    const [, date, videoId] = m;
    if (excluded.has(videoId)) continue;
    const file = path.join(dir, f);
    available.push({ file, date, videoId, title: titles.get(videoId) ?? "Sunny", info: await probe(file) });
  }

  const pick = (pool: Clip[], chosen: Clip[]) => {
    for (const c of pool) {
      const total = chosen.reduce((s, x) => s + x.info.duration, 0);
      if (total + c.info.duration > maxSeconds) break;
      chosen.push(c);
    }
    return chosen;
  };
  const chosen = pick(available.filter((c) => !used.has(c.videoId)), []);
  if (args.has("allow-reuse")) pick(available.filter((c) => used.has(c.videoId)), chosen);

  const episodeSeconds = chosen.reduce((s, c) => s + c.info.duration, 0);
  const summary = `${chosen.length} new episodes, ${(episodeSeconds / 60).toFixed(1)} min (target ${minSeconds / 60} min)`;
  console.log(`Compilation: ${summary} from ${available.length} archived in ${path.relative(process.cwd(), dir) || "."}`);
  if (episodeSeconds < minSeconds) {
    if (args.has("if-enough") || chosen.length < 3) {
      const msg = `Not enough yet: ${summary}. Nothing to do.`;
      console.log(msg);
      if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Compilation skipped::${msg}`);
      return;
    }
    console.warn(`  Warning: shorter than ${minSeconds / 60} min. Building anyway for a test.`);
  }

  const volume = (state.volumes.at(-1)?.volume ?? 0) + 1;
  const workDir = path.join(config.paths.out, `compilation-vol-${volume}`);
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  const font = fontFile();

  // Segments
  const segs: string[] = [];
  const introStill = path.join(workDir, "intro.png");
  await stillFrom(chosen[0], 1, introStill);
  const intro = path.join(workDir, "seg-000-intro.mp4");
  await card({
    still: introStill, seconds: INTRO_SECONDS, dir: workDir, name: "intro", font, out: intro,
    heading: "Sunny's Funniest Moments", sub: `Vol. ${volume}  ·  ${chosen.length} shorts back to back`,
  });
  segs.push(intro);

  const starts: { at: number; title: string }[] = [];
  let at = INTRO_SECONDS;
  for (const [i, clip] of chosen.entries()) {
    const out = path.join(workDir, `seg-${String(i + 1).padStart(3, "0")}.mp4`);
    console.log(`  ${i + 1}/${chosen.length} ${clip.date} ${clip.info.duration.toFixed(1)}s ${plainText(clip.title)}`);
    await episodeSegment(clip, i + 1, chosen.length, workDir, font, out);
    starts.push({ at, title: clip.title });
    at += (await probe(out)).duration;
    segs.push(out);
  }

  if (outroSeconds > 0) {
    const outroStill = path.join(workDir, "outro.png");
    await stillFrom(chosen.at(-1)!, 1, outroStill);
    const outro = path.join(workDir, "seg-999-outro.mp4");
    await card({
      still: outroStill, seconds: outroSeconds, dir: workDir, name: "outro", font, out: outro,
      heading: "Thanks for watching!", sub: "Subscribe for a new Sunny short every day",
    });
    segs.push(outro);
  }

  // Join (all segments share one encoding, so no re-encode) and move the index to the front.
  const list = path.join(workDir, "segments.txt");
  await fs.writeFile(list, segs.map((s) => `file '${path.basename(s)}'`).join("\n") + "\n");
  const mp4 = path.join(workDir, "compilation.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", mp4]);
  const total = (await probe(mp4)).duration;

  const thumbStill = path.join(workDir, "thumb.png");
  const middle = chosen[Math.floor(chosen.length / 2)];
  await stillFrom(middle, middle.info.duration / 2, thumbStill);
  const thumb = path.join(workDir, "thumbnail.jpg");
  await thumbnail(thumbStill, volume, font, workDir, thumb);

  // Metadata
  const chapterLines = chapters(starts, total);
  const first = chosen[0].date;
  const last = chosen.at(-1)!.date;
  const title = `Sunny's Funniest Moments Vol. ${volume} | ${chosen.length} Relatable Cartoon Comedy Shorts`.slice(0, 100);
  const description = [
    `Every Sunny short from ${first} to ${last}, back to back in one video. Sunny the star vs. everyday life: phones at 1%, gym plans, group chats and weekend plans that never happen.`,
    chapterLines.length ? `\nChapters\n${chapterLines.join("\n")}` : "",
    `\nNew Sunny short every day on this channel. Subscribe so you don't miss one.`,
    `\n#Sunny #CartoonComedy #Relatable #Animation #Compilation`,
  ].join("\n");
  const meta = {
    volume, title, description, seconds: Math.round(total),
    tags: ["Sunny", "cartoon comedy", "relatable", "funny animation", "cartoon compilation", "everyday life comedy"],
    episodes: chosen.map((c) => ({ date: c.date, videoId: c.videoId, title: c.title })),
  };
  await fs.writeFile(path.join(workDir, "meta.json"), JSON.stringify(meta, null, 2));
  console.log(`Built ${path.relative(process.cwd(), mp4)}: ${timestamp(total)}, ${chapterLines.length} chapters`);

  if (args.has("no-upload")) {
    console.log("Upload: skipped (--no-upload)");
    return;
  }

  // Upload. COMPILATION_UPLOAD_MODE: private (default; you check it and publish), schedule, or public.
  const mode = (process.env.COMPILATION_UPLOAD_MODE?.trim() || "private") as "private" | "schedule" | "public";
  const publishAt = mode === "schedule" ? publishAtIso() : undefined;
  const yt = youtubeClient();
  const res = await yt.videos.insert({
    part: ["snippet", "status"],
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title, description: description.slice(0, 4900), tags: meta.tags, categoryId: "1",
        defaultLanguage: "en", defaultAudioLanguage: "en",
      },
      status: {
        privacyStatus: mode === "public" ? "public" : "private",
        publishAt,
        selfDeclaredMadeForKids: config.madeForKids,
        embeddable: true,
      },
    },
    media: { mimeType: "video/mp4", body: createReadStream(mp4) },
  });
  const videoId = res.data.id;
  if (!videoId) throw new Error("YouTube did not return a video id.");
  console.log(`Upload: https://youtu.be/${videoId} (${mode}${publishAt ? `, public ${publishAt}` : ""})`);

  try {
    await yt.thumbnails.set({ videoId, media: { mimeType: "image/jpeg", body: createReadStream(thumb) } });
    console.log("  thumbnail set");
  } catch (err) {
    // Custom thumbnails need a phone-verified channel; the video is still fine without one.
    console.warn(`  thumbnail not set: ${(err as Error).message}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Thumbnail not set::Verify the channel at youtube.com/verify, then upload out/compilation-vol-${volume}/thumbnail.jpg by hand.`);
  }

  state.volumes.push({
    volume, date: new Date().toISOString().slice(0, 10), videoId, publishAt, title,
    episodes: chosen.map((c) => c.videoId), seconds: Math.round(total),
  });
  await fs.writeFile(STATE, JSON.stringify(state, null, 2) + "\n");
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Compilation Vol. ${volume} uploaded (${mode})::https://youtu.be/${videoId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
