import fs from "node:fs";
import { google } from "googleapis";
import type { EpisodeScript } from "../shared/episode";
import { config, req } from "./config";

export function youtubeClient() {
  const auth = new google.auth.OAuth2(req("YOUTUBE_CLIENT_ID"), req("YOUTUBE_CLIENT_SECRET"));
  auth.setCredentials({ refresh_token: req("YOUTUBE_REFRESH_TOKEN") });
  return google.youtube({ version: "v3", auth });
}

/** Next PUBLISH_TIME (in PUBLISH_UTC_OFFSET local time), PUBLISH_DELAY_DAYS from now, as ISO UTC. */
export function publishAtIso(now = new Date()): string {
  const [hh, mm] = config.publishTime.split(":").map(Number);
  const offsetMs = config.publishUtcOffset * 3600_000;
  const local = new Date(now.getTime() + offsetMs);
  let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + config.publishDelayDays, hh, mm) - offsetMs;
  // YouTube rejects times in the past. If today's slot is too close or gone, use the same time tomorrow.
  while (target < now.getTime() + 15 * 60_000) target += 24 * 3600_000;
  return new Date(target).toISOString();
}

const FOOTER = `

Sunny is a cheerful little star who loves to sing, dance and make friends. A new adventure every day!

#Shorts #KidsSongs #LearningForKids #Sunny`;

export async function uploadShort(file: string, script: EpisodeScript): Promise<{ videoId: string; publishAt?: string }> {
  const yt = youtubeClient();
  const publishAt = config.uploadMode === "schedule" ? publishAtIso() : undefined;
  const res = await yt.videos.insert({
    part: ["snippet", "status"],
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title: script.title.slice(0, 100),
        description: (script.description + FOOTER).slice(0, 4900),
        tags: script.tags,
        categoryId: "1", // Film & Animation
        defaultLanguage: "en",
        defaultAudioLanguage: "en",
      },
      status: {
        privacyStatus: config.uploadMode === "public" ? "public" : "private",
        publishAt,
        // Content for ages 3–8 must be marked made for kids (COPPA).
        selfDeclaredMadeForKids: true,
        embeddable: true,
      },
    },
    media: { mimeType: "video/mp4", body: fs.createReadStream(file) },
  });
  const videoId = res.data.id;
  if (!videoId) throw new Error("YouTube did not return a video id.");
  return { videoId, publishAt };
}
