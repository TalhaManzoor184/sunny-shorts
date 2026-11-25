import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function opt(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function req(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}. Add it to .env (local) or the GitHub repository secrets.`);
  return v;
}

export const config = {
  // Language of everything the audience sees and hears (script, voice, captions, titles).
  /** ISO code for YouTube metadata, e.g. "es". */
  contentLanguage: opt("CONTENT_LANGUAGE", "es"),
  /** BCP-47 code for the voice, e.g. "es-US" (neutral Latin American Spanish). */
  voiceLanguage: opt("VOICE_LANGUAGE", "es-US"),
  /** Plain-language description given to the script writer. */
  scriptLanguage: opt("SCRIPT_LANGUAGE", "neutral Latin American Spanish (understood from Mexico to Argentina and by US Hispanics; avoid Spain-only words and heavy local slang)"),
  /** On-screen / spoken name of the second character (internal id stays "moon"). */
  moonName: opt("MOON_NAME", "Luna"),

  // Script writer: gemini (default) or claude
  scriptProvider: opt("SCRIPT_PROVIDER", "gemini") as "gemini" | "claude",
  geminiTextModel: opt("GEMINI_TEXT_MODEL", "gemini-3.8-flash"),
  /** Used when the main text model stays overloaded after retries. Empty to disable. */
  geminiTextFallback: opt("GEMINI_TEXT_FALLBACK", "gemini-3.5-flash-lite"),
  anthropicModel: opt("ANTHROPIC_MODEL", "claude-sonnet-5-5"),

  // Voice
  ttsProvider: opt("TTS_PROVIDER", "gemini") as "gemini" | "elevenlabs" | "espeak",
  geminiModel: opt("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts"),
  /** Used when the main TTS model stays overloaded after retries. Empty to disable. */
  geminiTtsFallback: opt("GEMINI_TTS_FALLBACK", "gemini-3.8-flash-lite-tts"),
  /** Prebuilt voice. Upbeat/youthful ones suit Sunny: Puck, Leda, Sadachbia, Laomedeia, Fenrir. */
  geminiVoice: opt("GEMINI_VOICE", "Puck"),
  /** Luna's voice: low, slow and dry. Other good fits: Kore, Sulafat (female) or Algenib, Charon (male). */
  geminiMoonVoice: opt("GEMINI_MOON_VOICE", "Gacrux"),
  geminiMoonStyle: opt("GEMINI_MOON_STYLE", "flat, slow, sleepy and deadpan, dry sarcasm, small tired sighs, never shouts"),
  /** 1.0 = Moon's voice unchanged (VOICE_PITCH only affects Sunny). */
  moonPitch: Number(opt("MOON_PITCH", "1.0")),
  elevenMoonVoiceId: opt("ELEVENLABS_MOON_VOICE_ID"),
  /** Delivery direction sent with every line (not spoken). */
  geminiStyle: opt(
    "GEMINI_STYLE",
    "bright, fast, over-excited and playful, sitcom comic timing, clear",
  ),
  elevenVoiceId: opt("ELEVENLABS_VOICE_ID"),
  elevenModel: opt("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
  /** 1.0 = unchanged. 1.1–1.2 makes an adult voice sound more cartoon-like. */
  voicePitch: Number(opt("VOICE_PITCH", "1.0")),

  // Lip sync
  rhubarbPath: opt("RHUBARB_PATH", "rhubarb"),

  // Render
  chromePath: opt("CHROME_PATH") || undefined,

  // Upload
  /** "schedule" = private now, auto-public at PUBLISH_TIME (after PUBLISH_DELAY_DAYS).
   *  "private"  = private, you publish by hand.
   *  "public"   = public immediately. */
  uploadMode: opt("UPLOAD_MODE", "schedule") as "schedule" | "private" | "public",
  /** Local time of day to go public in schedule mode, HH:MM. */
  publishTime: opt("PUBLISH_TIME", "15:00"),
  /** UTC offset of PUBLISH_TIME in hours (Pakistan = 5). */
  publishUtcOffset: Number(opt("PUBLISH_UTC_OFFSET", "5")),
  /** Days after the run to publish in schedule mode. */
  publishDelayDays: Number(opt("PUBLISH_DELAY_DAYS", "0")),
  /** YouTube audience setting. Must match the content in character/bible.md:
   *  "false" = general audience (current bible), "true" = content made for children. */
  madeForKids: opt("MADE_FOR_KIDS", "false") === "true",
  /** TikTok visibility: PUBLIC_TO_EVERYONE, FOLLOWER_OF_CREATOR, MUTUAL_FOLLOW_FRIENDS or SELF_ONLY.
   *  Until TikTok audits your app, only SELF_ONLY is allowed and the pipeline falls back to it. */
  tiktokPrivacy: opt("TIKTOK_PRIVACY", "PUBLIC_TO_EVERYONE"),
  /** Meta Graph API version for Facebook Reels. */
  facebookGraphVersion: opt("FACEBOOK_GRAPH_VERSION", "v26.0"),

  paths: {
    bible: path.join(ROOT, "character/bible.md"),
    history: path.join(ROOT, "data/history.json"),
    sample: path.join(ROOT, "data/sample-episode.json"),
    music: path.join(ROOT, "assets/music"),
    sfx: path.join(ROOT, "assets/sfx"),
    out: path.join(ROOT, "out"),
    entry: path.join(ROOT, "src/remotion/index.ts"),
  },
};
