import { GoogleGenAI } from "@google/genai";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import type { WordTiming } from "../shared/episode";
import { durationOf, toEpisodeWav } from "./audio";
import { config, req } from "./config";

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

async function elevenlabs(text: string, rawPath: string): Promise<WordTiming[] | null> {
  const voice = req("ELEVENLABS_VOICE_ID");
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
async function gemini(text: string, rawPath: string): Promise<null> {
  const ai = new GoogleGenAI({ apiKey: req("GEMINI_API_KEY") });
  const interaction = await ai.interactions.create({
    model: config.geminiModel,
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text,
            annotations: config.geminiStyle ? [{ type: "speech_metadata", style: config.geminiStyle }] : undefined,
          },
        ],
      },
    ],
    response_format: { type: "audio", mime_type: "audio/wav" },
    generation_config: { speech_config: [{ voice: config.geminiVoice, language: "en-US" }] },
  });
  const data = interaction.output_audio?.data;
  if (!data) throw new Error(`Gemini returned no audio for: "${text}"`);
  await fs.writeFile(rawPath, Buffer.from(data, "base64"));
  return null;
}

/** Offline robot voice for testing the pipeline without API keys. */
async function espeak(text: string, rawPath: string): Promise<null> {
  await run("espeak-ng", ["-v", "en-us+f3", "-p", "75", "-s", "150", "-w", rawPath, text]);
  return null;
}

export async function voiceLine(text: string, outWav: string): Promise<Voiced> {
  const raw = outWav.replace(/\.wav$/, config.ttsProvider === "elevenlabs" ? ".raw.mp3" : ".raw.wav");
  const provider = { gemini, elevenlabs, espeak }[config.ttsProvider];
  if (!provider) throw new Error(`Unknown TTS_PROVIDER "${config.ttsProvider}". Use gemini, elevenlabs or espeak.`);
  const timings = await provider(text, raw);

  const rawDuration = await durationOf(raw);
  await toEpisodeWav(raw, outWav, config.voicePitch);
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
