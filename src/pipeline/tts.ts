import { GoogleGenAI } from "@google/genai";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Speaker, WordTiming } from "../shared/episode";
import { durationOf, ffmpeg, toEpisodeWav } from "./audio";
import { config, req } from "./config";
import { shouldFallBack, withRetry } from "./retry";

const run = promisify(execFile);

export type Voiced = { wavPath: string; duration: number; words: WordTiming[] };

/** Spread words across the clip by character length. Used when the provider gives no timings. */
function estimateWords(text: string, duration: number): WordTiming[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => t.replace(/[^\w']/g, "").length + 1.5);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return tokens.map((text, i) => {
    const d = (weights[i] / total) * duration;
    const w = { text, start: t, end: t + d };
    t += d;
    return w;
  });
}

/** ElevenLabs returns per-character timings; rebuild words from them. */
function wordsFromAlignment(a: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): WordTiming[] {
  const words: WordTiming[] = [];
  let cur: WordTiming | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: "", start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] };
    cur.text += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  return words;
}

async function elevenlabs(text: string, rawPath: string, speaker: Speaker = "sunny"): Promise<WordTiming[] | null> {
  const voice = speaker === "moon" && config.elevenMoonVoiceId ? config.elevenMoonVoiceId : req("ELEVENLABS_VOICE_ID");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": req("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: config.elevenModel,
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    audio_base64: string;
    alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  };
  await fs.writeFile(rawPath, Buffer.from(json.audio_base64, "base64"));
  return json.alignment ? wordsFromAlignment(json.alignment) : null;
}

/**
 * Google Gemini TTS (Interactions API). Returns 24 kHz mono WAV.
 * Gemini gives no word timings, so captions use the estimate; Rhubarb still drives the mouth exactly.
 */
/** Gemini voice name and speaking style for each character. */
function voiceOf(speaker: Speaker): { voice: string; style: string; name: string } {
  return speaker === "moon"
    ? { voice: config.geminiMoonVoice, style: config.geminiMoonStyle, name: "Moon" }
    : { voice: config.geminiVoice, style: config.geminiStyle, name: "Sunny" };
}

type GeminiVoices = { single: Speaker } | { duo: Line[] };

async function gemini(text: string, rawPath: string, speaker: Speaker = "sunny"): Promise<null> {
  return geminiWith(text, rawPath, { single: speaker });
}

async function geminiWith(text: string, rawPath: string, voices: GeminiVoices): Promise<null> {
  try {
    return await withRetry(`voice (${config.geminiModel})`, () => geminiOnce(config.geminiModel, text, rawPath, voices));
  } catch (err) {
    if (!shouldFallBack(err) || !config.geminiTtsFallback) throw err;
    console.warn(`  ${config.geminiModel} is busy or out of quota; using ${config.geminiTtsFallback}`);
    return await withRetry(`voice (${config.geminiTtsFallback})`, () => geminiOnce(config.geminiTtsFallback, text, rawPath, voices));
  }
}

async function geminiOnce(model: string, text: string, rawPath: string, voices: GeminiVoices): Promise<null> {
  const duo = "duo" in voices;
  const one = duo ? voiceOf("sunny") : voiceOf(voices.single);
  const style = duo
    ? `A two-character cartoon comedy. ${voiceOf("sunny").name}: ${voiceOf("sunny").style}. ${voiceOf("moon").name}: ${voiceOf("moon").style}. Leave a short pause between turns.`
    : one.style;
  // Multi-speaker: name both speakers, and send every line as its own text turn tagged with its speaker.
  const speechConfig = duo
    ? (["sunny", "moon"] as const).map((s) => ({ speaker: voiceOf(s).name, voice: voiceOf(s).voice, language: "en-US" }))
    : [{ voice: one.voice, language: "en-US" }];
  const ai = new GoogleGenAI({ apiKey: req("GEMINI_API_KEY") });
  const interaction = await ai.interactions.create({
    model,
    input: [
      {
        type: "user_input",
        content: duo
          ? voices.duo.map((l, i) => ({
              type: "text" as const,
              text: i < voices.duo.length - 1 ? `${l.text} <short pause>` : l.text,
              annotations: [{ type: "speech_metadata" as const, speaker: voiceOf(l.speaker).name, style: i === 0 ? style : voiceOf(l.speaker).style }],
            }))
          : [{ type: "text" as const, text, annotations: style ? [{ type: "speech_metadata" as const, style }] : undefined }],
      },
    ],
    response_format: { type: "audio", mime_type: "audio/wav" },
    generation_config: { speech_config: speechConfig },
  });
  const data = interaction.output_audio?.data;
  if (!data) throw new Error(`Gemini returned no audio for: "${text}"`);
  await fs.writeFile(rawPath, Buffer.from(data, "base64"));
  return null;
}

/** Offline robot voice for testing the pipeline without API keys. */
async function espeak(text: string, rawPath: string, speaker: Speaker = "sunny"): Promise<null> {
  const args = speaker === "moon" ? ["-v", "en-us+m3", "-p", "25", "-s", "125"] : ["-v", "en-us+f3", "-p", "75", "-s", "150"];
  await run("espeak-ng", [...args, "-w", rawPath, text]);
  return null;
}

const pitchFor = (speaker: Speaker) => (speaker === "moon" ? config.moonPitch : config.voicePitch);

type Silence = { start: number; end: number };

export async function findSilences(file: string): Promise<Silence[]> {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-38dB:d=0.15", "-f", "null", "-"], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const out: Silence[] = [];
  let start: number | null = null;
  for (const m of stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    if (m[1] === "start") start = Math.max(0, Number(m[2]));
    else if (start !== null) {
      out.push({ start, end: Number(m[2]) });
      start = null;
    }
  }
  return out;
}

/**
 * Pick one pause per line boundary. Each boundary's expected position comes from the line lengths;
 * the chosen pause is the longest one near that spot. Returns cut times in seconds, or null.
 */
export function chooseCuts(silences: Silence[], lines: string[], total: number): number[] | null {
  const weights = lines.map((l) => l.replace(/[^\w]/g, "").length + 4);
  const sum = weights.reduce((a, b) => a + b, 0);
  const cand = silences
    .filter((s) => s.start > 0.1 && s.end < total - 0.1)
    .map((s) => ({ mid: (s.start + s.end) / 2, dur: s.end - s.start }));
  const n = lines.length - 1;
  if (cand.length < n) return null;

  const expected: number[] = [];
  let acc = 0;
  for (let k = 0; k < n; k++) {
    acc += weights[k];
    expected.push((acc / sum) * total);
  }
  // Pause length matters most; distance from the expected spot only breaks ties.
  const score = (k: number, j: number) => cand[j].dur - 0.15 * Math.abs(cand[j].mid - expected[k]);

  // Dynamic programming: best[k][j] = best total when boundary k uses candidate j (candidates in time order).
  const m = cand.length;
  const best: number[][] = Array.from({ length: n }, () => Array(m).fill(-Infinity));
  const from: number[][] = Array.from({ length: n }, () => Array(m).fill(-1));
  for (let j = 0; j < m; j++) best[0][j] = score(0, j);
  for (let k = 1; k < n; k++) {
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < j; i++) {
        if (best[k - 1][i] === -Infinity || cand[j].mid - cand[i].mid < 0.4) continue;
        const v = best[k - 1][i] + score(k, j);
        if (v > best[k][j]) {
          best[k][j] = v;
          from[k][j] = i;
        }
      }
    }
  }
  let j = best[n - 1].indexOf(Math.max(...best[n - 1]));
  if (j < 0 || best[n - 1][j] === -Infinity) return null;
  const cuts: number[] = [];
  for (let k = n - 1; k >= 0; k--) {
    cuts.unshift(cand[j].mid);
    j = from[k][j];
  }
  return cuts;
}

/**
 * Voice the whole episode. With Gemini, all lines go in ONE request (the free tier allows only a
 * few TTS requests a day) and the audio is cut at the pauses between lines. Other providers, or a
 * failed split, fall back to one request per line.
 */
export type Line = { text: string; speaker: Speaker };

export async function voiceEpisode(input: Line[], outWavs: string[]): Promise<Voiced[]> {
  const lines = input.map((l) => l.text);
  const duo = input.some((l) => l.speaker === "moon") && input.some((l) => l.speaker === "sunny");
  if (config.ttsProvider === "gemini" && lines.length > 1) {
    const raw = path.join(path.dirname(outWavs[0]), "episode.raw.wav");
    let ok = true;
    if (duo) {
      // One multi-speaker request; every line is its own turn tagged with its speaker.
      try {
        await geminiWith(lines.join("\n"), raw, { duo: input });
      } catch (err) {
        ok = false;
        console.warn(`  Two-voice request failed (${String((err as Error)?.message ?? err).slice(0, 200)}); voicing line by line instead.`);
      }
    } else {
      await gemini(lines.join("\n<short pause>\n"), raw, input[0].speaker);
    }
    const total = ok ? await durationOf(raw) : 0;
    const cuts = ok ? chooseCuts(await findSilences(raw), lines, total) : null;
    if (cuts) {
      const bounds = [0, ...cuts, total];
      const voiced: Voiced[] = [];
      for (const [i, out] of outWavs.entries()) {
        const seg = out.replace(/\.wav$/, ".seg.wav");
        await ffmpeg(["-i", raw, "-ss", bounds[i].toFixed(3), "-to", bounds[i + 1].toFixed(3), seg]);
        await toEpisodeWav(seg, out, pitchFor(input[i].speaker));
        await fs.rm(seg, { force: true });
        const duration = await durationOf(out);
        voiced.push({ wavPath: out, duration, words: estimateWords(lines[i], duration) });
      }
      await fs.rm(raw, { force: true });
      return voiced;
    }
    if (ok) console.warn("  Could not find a pause between every line; voicing line by line instead.");
    await fs.rm(raw, { force: true });
  }
  const voiced: Voiced[] = [];
  for (const [i, line] of input.entries()) voiced.push(await voiceLine(line.text, outWavs[i], line.speaker));
  return voiced;
}

export async function voiceLine(text: string, outWav: string, speaker: Speaker = "sunny"): Promise<Voiced> {
  const raw = outWav.replace(/\.wav$/, config.ttsProvider === "elevenlabs" ? ".raw.mp3" : ".raw.wav");
  const provider = { gemini, elevenlabs, espeak }[config.ttsProvider];
  if (!provider) throw new Error(`Unknown TTS_PROVIDER "${config.ttsProvider}". Use gemini, elevenlabs or espeak.`);
  const timings = await provider(text, raw, speaker);

  const rawDuration = await durationOf(raw);
  await toEpisodeWav(raw, outWav, pitchFor(speaker));
  await fs.rm(raw, { force: true });
  const duration = await durationOf(outWav);

  let words: WordTiming[];
  if (timings && timings.length) {
    // Silence trimming shifts the start; rescale provider timings onto the trimmed clip.
    const first = timings[0].start;
    const last = timings[timings.length - 1].end;
    const span = Math.max(0.01, Math.min(rawDuration, last) - first);
    const k = duration / span;
    words = timings.map((w) => ({ text: w.text, start: (w.start - first) * k, end: (w.end - first) * k }));
  } else {
    words = estimateWords(text, duration);
  }
  return { wavPath: outWav, duration, words };
}
