import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs/promises";
import { EpisodeScript } from "../shared/episode";
import { config, req } from "./config";
import type { HistoryEntry } from "./history";
import { shouldFallBack, withRetry } from "./retry";

/** JSON Schema for one episode. Shared by both script writers. */
const EPISODE_SCHEMA = {
  type: "object",
  required: ["title", "description", "tags", "theme", "hook", "scene", "beats"],
  properties: {
    title: { type: "string", description: "YouTube title, max 70 characters, relatable and funny, no clickbait, ends with a relevant emoji. Not aimed at children." },
    description: { type: "string", description: "2–3 short, funny sentences describing the joke without spoiling the punchline. No links." },
    tags: { type: "array", items: { type: "string" }, description: "6–12 search tags." },
    theme: { type: "string", description: "The one idea of the episode, e.g. 'counting to 5 with claps'." },
    hook: {
      type: "string",
      description: "On-screen text shown from the very first frame, max 40 characters, e.g. 'POV: your phone hits 1%' or 'Me trying to wake up on Monday'. Relatable, makes people stop scrolling.",
    },
    scene: { type: "string", enum: ["park", "bedroom", "rainbow"] },
    beats: {
      type: "array",
      description: "4–7 lines of dialogue between Sunny and Moon, in order. Exactly one line is the punchline (usually the last).",
      items: {
        type: "object",
        required: ["speaker", "line", "expression", "action"],
        properties: {
          speaker: { type: "string", enum: ["sunny", "moon"], description: "Who says this line." },
          line: { type: "string", description: "What the speaker says. 2–14 words. Punchy, conversational English." },
          expression: {
            type: "string",
            enum: ["happy", "wink", "surprised", "laughing", "deadpan", "annoyed", "smirk"],
            description: "The speaker's face on this line. Moon is usually deadpan, annoyed or smirk; Sunny is usually happy, surprised or laughing.",
          },
          action: { type: "string", enum: ["idle", "dance", "wave", "jump", "spin"] },
          scene: { type: "string", enum: ["park", "bedroom", "rainbow"], description: "Optional set change for this line." },
          punchline: { type: "boolean", description: "true on the one line where the joke lands." },
        },
      },
    },
  },
} as const;

async function buildPrompt(history: HistoryEntry[]): Promise<string> {
  const bible = await fs.readFile(config.paths.bible, "utf8");
  const recent = history.slice(-30).map((h) => `- ${h.date}: ${h.title} (theme: ${h.theme})`).join("\n") || "- none yet";
  return `You write daily YouTube Shorts comedy sketches for a cartoon double act, Sunny and Moon, aimed at a general audience (teens and adults).

<character_bible>
${bible}
</character_bible>

<recent_episodes>
${recent}
</recent_episodes>

Write today's episode. Requirements:
- Pick a theme that is NOT in the recent episodes list (vary the theme family too, not just the wording).
- It is a DIALOGUE: Sunny and Moon take turns (both must speak; nobody talks to the camera alone). 4–7 lines, 30–60 spoken words in total, so the Short is 12–22 seconds. Cut every word that is not setup or joke.
- The comedy comes from the contrast: Sunny is over-excited and has a big plan or a bold claim; Moon is tired, deadpan and dry and deflates it. Sunny doubles down. Let the punchline land on one of them (often Moon's flat one-liner, sometimes Sunny's absurd comeback or a twist where Moon secretly loves it).
- Moon's lines are short (2–8 words). Moon never shouts and never uses exclamation marks.
- The first spoken line must grab attention in under two seconds: start in the middle of the situation, no greetings, no "hi", no introductions.
- The hook text and the first line work together but do not repeat each other word for word.
- Mark exactly one line with punchline: true. End on the joke (the punchline is usually the last line), so the Short loops straight back to the start.
- Do not end with a catchphrase or sign-off.
- Match each line's expression and action to what Sunny is saying; use a scene change only when it helps the joke.
- Do not ask viewers to like, comment or subscribe.`;
}

async function askClaude(prompt: string): Promise<unknown> {
  const client = new Anthropic({ apiKey: req("ANTHROPIC_API_KEY") });
  const res = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 2000,
    tools: [{ name: "write_episode", description: "Save today's Sunny episode script.", input_schema: EPISODE_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: "write_episode" },
    messages: [{ role: "user", content: prompt + "\nCall the write_episode tool with the result." }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  return block && "input" in block ? block.input : undefined;
}

async function askGemini(prompt: string): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: req("GEMINI_API_KEY") });
  const call = (model: string) =>
    withRetry(`script (${model})`, () =>
      ai.models.generateContent({
        model,
        contents: prompt + "\nReturn the episode as JSON matching the schema.",
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: EPISODE_SCHEMA,
          temperature: 1,
        },
      }),
    );
  let res;
  try {
    res = await call(config.geminiTextModel);
  } catch (err) {
    if (!shouldFallBack(err) || !config.geminiTextFallback) throw err;
    console.warn(`  ${config.geminiTextModel} is busy or out of quota; using ${config.geminiTextFallback}`);
    res = await call(config.geminiTextFallback);
  }
  const text = res.text;
  if (!text) throw new Error("Gemini returned an empty script.");
  return JSON.parse(text);
}

export async function writeScript(history: HistoryEntry[]): Promise<EpisodeScript> {
  const prompt = await buildPrompt(history);
  const ask = config.scriptProvider === "claude" ? askClaude : askGemini;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const parsed = EpisodeScript.safeParse(await ask(prompt));
      if (parsed.success) return parsed.data;
      console.warn(`Script attempt ${attempt} failed validation:`, parsed.error.issues.slice(0, 3));
    } catch (e) {
      if (attempt === 3) throw e;
      console.warn(`Script attempt ${attempt} failed:`, String(e).slice(0, 300));
    }
  }
  throw new Error("Could not get a valid episode script after 3 attempts.");
}
