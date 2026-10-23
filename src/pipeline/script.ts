import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import { EpisodeScript } from "../shared/episode";
import { config, req } from "./config";
import type { HistoryEntry } from "./history";

const EPISODE_TOOL: Anthropic.Tool = {
  name: "write_episode",
  description: "Save today's Sunny episode script.",
  input_schema: {
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
  },
};

export async function writeScript(history: HistoryEntry[]): Promise<EpisodeScript> {
  const client = new Anthropic({ apiKey: req("ANTHROPIC_API_KEY") });
  const bible = await fs.readFile(config.paths.bible, "utf8");
  const recent = history.slice(-30).map((h) => `- ${h.date}: ${h.title} (theme: ${h.theme})`).join("\n") || "- none yet";

  const prompt = `You write daily YouTube Shorts episodes for a kids' cartoon.

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
- Do not ask viewers to like, comment or subscribe.
Call the write_episode tool with the result.`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 2000,
      tools: [EPISODE_TOOL],
      tool_choice: { type: "tool", name: "write_episode" },
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    const parsed = EpisodeScript.safeParse(block && "input" in block ? block.input : undefined);
    if (parsed.success) return parsed.data;
    console.warn(`Script attempt ${attempt} failed validation:`, parsed.error.issues.slice(0, 3));
  }
  throw new Error("Could not get a valid episode script after 3 attempts.");
}
