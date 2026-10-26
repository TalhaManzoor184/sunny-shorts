import fs from "node:fs/promises";
import path from "node:path";
import { EpisodeScript, FPS, type EpisodeProps, type RenderedBeat } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { config } from "./config";
import { appendHistory, loadHistory } from "./history";
import { mouthCues } from "./lipsync";
import { renderEpisode } from "./render";
import { writeScript } from "./script";
import { voiceEpisode } from "./tts";
import { facebookConfigured, uploadFacebookReel } from "./facebook";
import { tiktokConfigured, uploadTikTok } from "./tiktok";
import { publishAtIso, uploadShort } from "./upload";

/**
 * One full episode: script → voice → lip sync → render → upload.
 *
 *   npm run episode                       full daily run
 *   npm run episode -- --no-upload        everything except uploading (YouTube and TikTok)
 *   npm run episode -- --no-tiktok        skip TikTok
 *   npm run episode -- --no-facebook      skip Facebook
 *   npm run episode -- --if-slot-free     do nothing if the next publish slot already has an episode
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

  // Scheduled runs fire several times a day because GitHub often starts cron jobs late or not at all.
  // Only the first one that finds the next publish slot empty makes an episode.
  if (args.has("if-slot-free")) {
    const slot = publishAtIso();
    const taken = history.find((h) => h.publishAt === slot);
    if (taken) {
      console.log(`Slot ${slot} already has "${taken.title}". Nothing to do.`);
      if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Already scheduled::${slot} has ${taken.title.replace(/[:,\r\n%]/g, " ")}`);
      return;
    }
    console.log(`Slot ${slot} is free; making an episode for it.`);
  }

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
  if (process.env.GITHUB_ACTIONS) {
    // Show the script on the run's summary page.
    const body = script.beats.map((b) => b.line).join(" / ").replace(/[\r\n%]/g, " ");
    console.log(`::notice title=${script.title.replace(/[:,\r\n%]/g, " ")}::${body}`);
  }

  const runDir = path.join(config.paths.out, `${date}-${slug(script.title)}`);
  const publicDir = path.join(runDir, "public");
  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "script.json"), JSON.stringify(script, null, 2));

  // 2 + 3. Voice (one request for the whole episode where possible), then lip sync per line
  const files = script.beats.map((_, i) => `line-${String(i + 1).padStart(2, "0")}.wav`);
  const voices = await voiceEpisode(
    script.beats.map((b) => b.line),
    files.map((f) => path.join(publicDir, f)),
  );
  const beats: RenderedBeat[] = [];
  for (const [i, beat] of script.beats.entries()) {
    const file = files[i];
    const voiced = voices[i];
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
  } else if (args.has("facebook-only")) {
    // Test path: Facebook only, nothing recorded in history.
    if (!facebookConfigured()) throw new Error("Facebook test needs FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN secrets.");
    const fb = await uploadFacebookReel(mp4, script);
    console.log(`Facebook: Reel ${fb.videoId} ${fb.state}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Facebook test::Reel ${fb.videoId} ${fb.state}`);
  } else {
    const { videoId, publishAt } = await uploadShort(mp4, script);
    console.log(`Upload: https://youtube.com/shorts/${videoId}${publishAt ? ` (goes public ${publishAt})` : ""}`);

    // TikTok is optional and must never cost us the YouTube upload or the history entry.
    let tiktokPublishId: string | undefined;
    if (args.has("no-tiktok") || !tiktokConfigured()) {
      console.log(`TikTok: skipped (${args.has("no-tiktok") ? "--no-tiktok" : "TIKTOK_ENABLED is not true or TikTok secrets are missing"})`);
    } else {
      try {
        const tt = await uploadTikTok(mp4, script, seconds);
        tiktokPublishId = tt.publishId;
        console.log(`TikTok: posted (${tt.privacy})`);
      } catch (err) {
        console.error(err);
        const msg = String((err as Error)?.message ?? err).replace(/[\r\n%]/g, " ");
        if (process.env.GITHUB_ACTIONS) console.log(`::error title=TikTok upload failed::${msg}`);
        process.exitCode = 1; // YouTube still went out; fail the run so the TikTok problem gets noticed
      }
    }
    // Facebook Reels: same rules — optional, and never blocks YouTube or history.
    let facebookVideoId: string | undefined;
    if (args.has("no-facebook") || !facebookConfigured()) {
      console.log(`Facebook: skipped (${args.has("no-facebook") ? "--no-facebook" : "FACEBOOK_ENABLED is false or Facebook secrets are missing"})`);
    } else {
      try {
        const fb = await uploadFacebookReel(mp4, script, publishAt);
        facebookVideoId = fb.videoId;
        console.log(`Facebook: Reel ${fb.videoId} ${fb.state}`);
      } catch (err) {
        console.error(err);
        const msg = String((err as Error)?.message ?? err).replace(/[\r\n%]/g, " ");
        if (process.env.GITHUB_ACTIONS) console.log(`::error title=Facebook upload failed::${msg}`);
        process.exitCode = 1;
      }
    }
    await appendHistory({ date, title: script.title, theme: script.theme, videoId, publishAt, tiktokPublishId, facebookVideoId });
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
