import fs from "node:fs/promises";
import path from "node:path";
import type { EpisodeScript } from "../shared/episode";
import { config, req } from "./config";

/**
 * TikTok Content Posting API (Direct Post).
 * Until TikTok audits your developer app, posts are forced to "Only me" (SELF_ONLY)
 * and the TikTok account itself must be private.
 */

const API = "https://open.tiktokapis.com/v2";

export function tiktokConfigured(): boolean {
  if (process.env.TIKTOK_ENABLED !== "true") return false; // on hold unless switched on
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REFRESH_TOKEN);
}

type TokenResponse = { access_token?: string; refresh_token?: string; error?: string; error_description?: string };

/** Exchange the refresh token for a 24-hour access token. TikTok may rotate the refresh token. */
async function accessToken(): Promise<string> {
  const oldRefresh = req("TIKTOK_REFRESH_TOKEN");
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: req("TIKTOK_CLIENT_KEY"),
      client_secret: req("TIKTOK_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: oldRefresh,
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) throw new Error(`TikTok token refresh failed: ${json.error ?? res.status} ${json.error_description ?? ""}`);
  if (json.refresh_token && json.refresh_token !== oldRefresh) {
    // The workflow saves this back to the TIKTOK_REFRESH_TOKEN secret after the run.
    await fs.mkdir(config.paths.out, { recursive: true });
    await fs.writeFile(path.join(config.paths.out, "tiktok-refresh-token.txt"), json.refresh_token, { mode: 0o600 });
    console.log("  TikTok issued a new refresh token; it will be saved to the repo secret.");
  }
  return json.access_token;
}

type ApiResponse<T> = { data?: T; error?: { code: string; message: string; log_id?: string } };

async function call<T>(token: string, endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || (json.error && json.error.code !== "ok")) {
    throw new Error(`TikTok ${endpoint} failed: ${json.error?.code ?? res.status} ${json.error?.message ?? ""}`);
  }
  return json.data as T;
}

type CreatorInfo = {
  creator_username?: string;
  privacy_level_options: string[];
  max_video_post_duration_sec?: number;
};

function caption(script: EpisodeScript): string {
  const tags = ["#sunnyyluna", "#humor", "#comedia", "#animacion", "#parati"];
  return `${script.title}\n\n${script.description}\n\n${tags.join(" ")}`.slice(0, 2200);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadTikTok(file: string, script: EpisodeScript, durationSec: number): Promise<{ publishId: string; privacy: string }> {
  const token = await accessToken();

  // TikTok requires checking the creator's allowed privacy levels before each post.
  const creator = await call<CreatorInfo>(token, "/post/publish/creator_info/query/", {});
  if (creator.max_video_post_duration_sec && durationSec > creator.max_video_post_duration_sec) {
    throw new Error(`Video is ${durationSec.toFixed(0)}s; this TikTok account allows ${creator.max_video_post_duration_sec}s.`);
  }
  let privacy = config.tiktokPrivacy;
  if (!creator.privacy_level_options.includes(privacy)) {
    const fallback = creator.privacy_level_options.includes("SELF_ONLY") ? "SELF_ONLY" : creator.privacy_level_options[0];
    console.warn(`  TikTok does not allow ${privacy} for this app yet (allowed: ${creator.privacy_level_options.join(", ")}). Posting as ${fallback}.`);
    privacy = fallback;
  }

  const bytes = await fs.readFile(file);
  // Shorts are well under 64 MB, so the whole file goes up as one chunk.
  const init = await call<{ publish_id: string; upload_url: string }>(token, "/post/publish/video/init/", {
    post_info: {
      title: caption(script),
      privacy_level: privacy,
      disable_comment: false,
      disable_duet: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1500,
      brand_content_toggle: false,
      brand_organic_toggle: false,
      is_aigc: true, // script and voice are AI-generated
    },
    source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 },
  });

  const put = await fetch(init.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(bytes.length),
      "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
    },
    body: bytes,
  });
  if (!put.ok) throw new Error(`TikTok upload failed: ${put.status} ${await put.text()}`);

  // Wait for TikTok to process and publish (up to ~5 minutes).
  for (let i = 0; i < 30; i++) {
    await sleep(10_000);
    const st = await call<{ status: string; fail_reason?: string }>(token, "/post/publish/status/fetch/", { publish_id: init.publish_id });
    if (st.status === "PUBLISH_COMPLETE") return { publishId: init.publish_id, privacy };
    if (st.status === "FAILED") throw new Error(`TikTok publish failed: ${st.fail_reason ?? "unknown reason"}`);
  }
  console.warn("  TikTok is still processing the video; it should appear on the account shortly.");
  return { publishId: init.publish_id, privacy };
}
