import fs from "node:fs/promises";
import path from "node:path";
import { EpisodeScript, FPS, type EpisodeProps, type RenderedBeat } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { config } from "./config";
import { appendHistory, loadHistory } from "./history";
import { mouthCues } from "./lipsync";
import { renderEpisode } from "./render";
import { writeScript } from "./script";
import { voiceLine } from "./tts";
import { uploadShort } from "./upload";

/**
 * One full episode: script → voice → lip sync → render → upload.
 *
 *   npm run episode                       full daily run
 *   npm run episode -- --no-upload        everything except YouTube
 *   npm run episode -- --sample           skip Claude, use data/sample-episode.json
 *   npm run episode -- --tts=espeak       offline robot voice (testing only)
 *   npm run episode -- --script=path.json use a hand-written script
 */

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
if (args.has("tts")) config.ttsProvider = args.get("tts") as typeof config.ttsProvider;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

async function pickMusic(publicDir: string): Promise<string | undefined> {
  try {
    const files = (await fs.readdir(config.paths.music)).filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f));
    if (!files.length) return undefined;
    const f = files[Math.floor(Math.random() * files.length)];
    await fs.copyFile(path.join(config.paths.music, f), path.join(publicDir, `music${path.extname(f)}`));
    return `music${path.extname(f)}`;
  } catch {
    return undefined;
  }
}

async function main() {
  const t0 = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const history = await loadHistory();

  // 1. Script
  let script: EpisodeScript;
  const scriptPath = args.get("script") ?? (args.has("sample") ? config.paths.sample : undefined);
  if (scriptPath) {
    script = EpisodeScript.parse(JSON.parse(await fs.readFile(scriptPath, "utf8")));
    console.log(`Script: loaded ${path.relative(process.cwd(), scriptPath)}`);
  } else {
    console.log(`Script: asking ${config.scriptProvider === "claude" ? config.anthropicModel : config.geminiTextModel}…`);
    script = await writeScript(history);
  }
  console.log(`  "${script.title}" — ${script.theme} — ${script.beats.length} lines`);

  const runDir = path.join(config.paths.out, `${date}-${slug(script.title)}`);
  const publicDir = path.join(runDir, "public");
  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "script.json"), JSON.stringify(script, null, 2));

  // 2 + 3. Voice and lip sync, one line at a time
  const beats: RenderedBeat[] = [];
  for (const [i, beat] of script.beats.entries()) {
    const file = `line-${String(i + 1).padStart(2, "0")}.wav`;
    const voiced = await voiceLine(beat.line, path.join(publicDir, file));
    const cues = await mouthCues(voiced.wavPath, beat.line);
    beats.push({ ...beat, audioFile: file, duration: voiced.duration, words: voiced.words, mouthCues: cues });
    console.log(`  line ${i + 1}: ${voiced.duration.toFixed(2)}s, ${cues.length} mouth cues — "${beat.line}"`);
  }

  // 4. Render
  const props: EpisodeProps = {
    title: script.title,
    scene: script.scene,
    beats,
    musicFile: await pickMusic(publicDir),
    fps: FPS,
    gapSeconds: 0.35,
    outroSeconds: 1.8,
  };
  await fs.writeFile(path.join(runDir, "props.json"), JSON.stringify(props, null, 2));
  const seconds = computeTimeline(props).totalSeconds;
  if (seconds > 59) console.warn(`  Warning: ${seconds.toFixed(1)}s is long for a Short.`);
  console.log(`Render: ${seconds.toFixed(1)}s video${props.musicFile ? " with music" : ""}`);
  const mp4 = path.join(runDir, "episode.mp4");
  await renderEpisode(props, publicDir, mp4);
  console.log(`  saved ${path.relative(process.cwd(), mp4)}`);

  // 5. Upload
  if (args.has("no-upload")) {
    console.log("Upload: skipped (--no-upload)");
  } else {
    const { videoId, publishAt } = await uploadShort(mp4, script);
    console.log(`Upload: https://youtube.com/shorts/${videoId}${publishAt ? ` (goes public ${publishAt})` : ""}`);
    await appendHistory({ date, title: script.title, theme: script.theme, videoId, publishAt });
  }

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

/** Short, readable error text. Google API errors carry the useful part in response.data. */
function describe(err: unknown): string {
  const e = err as { message?: string; response?: { status?: number; data?: unknown } };
  const data = e?.response?.data ? ` | ${e.response.status} ${JSON.stringify(e.response.data)}` : "";
  return `${e?.message ?? String(err)}${data}`.slice(0, 1500);
}

main().catch((err) => {
  console.error(err);
  // On GitHub Actions, also raise an annotation so the error shows on the run's summary page.
  if (process.env.GITHUB_ACTIONS) {
    const msg = describe(err).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    console.log(`::error title=Episode failed::${msg}`);
  }
  process.exit(1);
});
