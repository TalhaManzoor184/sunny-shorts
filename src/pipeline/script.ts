import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs/promises";
import { EpisodeScript } from "../shared/episode";
import { config, req } from "./config";
import type { HistoryEntry } from "./history";
import { isTransient, withRetry } from "./retry";

/** JSON Schema for one episode. Shared by both script writers. */
const EPISODE_SCHEMA = {
  type: "object",
  required: ["title", "description", "tags", "theme", "scene", "beats"],
  properties: {
    title: { type: "string", description: "YouTube title, max 70 characters, fun and clear, no clickbait, ends with a relevant emoji." },
    description: { type: "string", description: "2–3 short sentences for parents describing what kids learn. No links." },
    tags: { type: "array", items: { type: "string" }, description: "6–12 search tags." },
    theme: { type: "string", description: "The one idea of the episode, e.g. 'counting to 5 with claps'." },
    scene: { type: "string", enum: ["park", "bedroom", "rainbow"] },
    beats: {
      type: "array",
      description: "5–9 spoken lines in order. Last line must be exactly 'Shine, shine, Sunny!'",
      items: {
        type: "object",
        required: ["line", "expression", "action"],
        properties: {
          line: { type: "string", description: "What Sunny says. 3–14 words. Simple English for ages 3–8." },
          expression: { type: "string", enum: ["happy", "wink", "surprised", "laughing"] },
          action: { type: "string", enum: ["idle", "dance", "wave", "jump", "spin"] },
          scene: { type: "string", enum: ["park", "bedroom", "rainbow"], description: "Optional set change for this line." },
        },
      },
    },
  },
} as const;

async function buildPrompt(history: HistoryEntry[]): Promise<string> {
  const bible = await fs.readFile(config.paths.bible, "utf8");
  const recent = history.slice(-30).map((h) => `- ${h.date}: ${h.title} (theme: ${h.theme})`).join("\n") || "- none yet";
  return `You write daily YouTube Shorts episodes for a kids' cartoon.

<character_bible>
${bible}
</character_bible>

<recent_episodes>
${recent}
</recent_episodes>

Write today's episode. Requirements:
- Pick a theme that is NOT in the recent episodes list (vary the theme family too, not just the wording).
- Total spoken words 55–100, so the Short lands between 20 and 45 seconds.
- First line is the hook. Include one join-in moment and one small funny moment.
- Match each line's expression and action to what Sunny is saying.
- The last line is exactly "Shine, shine, Sunny!" with action "jump" and expression "laughing".
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
    if (!isTransient(err) || !config.geminiTextFallback) throw err;
    console.warn(`  ${config.geminiTextModel} is busy; using ${config.geminiTextFallback}`);
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
