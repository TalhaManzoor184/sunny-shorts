import "dotenv/config";
import crypto from "node:crypto";
import readline from "node:readline/promises";

/**
 * One-time helper to get TIKTOK_REFRESH_TOKEN.
 *   1. Put TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REDIRECT_URI in .env.
 *      TIKTOK_REDIRECT_URI must exactly match a redirect URI registered in your TikTok app
 *      (an https page on a site you own; the page itself can be anything, even a 404).
 *   2. npm run auth:tiktok
 *   3. Open the printed link, log in with the TikTok account for Sunny, approve.
 *   4. TikTok sends you to your redirect page. Copy the FULL address from the browser bar
 *      and paste it here. The script prints the refresh token.
 */

const key = process.env.TIKTOK_CLIENT_KEY;
const secret = process.env.TIKTOK_CLIENT_SECRET;
const redirect = process.env.TIKTOK_REDIRECT_URI;
if (!key || !secret || !redirect) {
  console.error("Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REDIRECT_URI in .env first.");
  process.exit(1);
}

const state = crypto.randomBytes(12).toString("hex");
const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
url.search = new URLSearchParams({
  client_key: key,
  scope: "user.info.basic,video.publish",
  response_type: "code",
  redirect_uri: redirect,
  state,
}).toString();

console.log("Open this link, log in to the TikTok account and approve:\n");
console.log(url.toString() + "\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pasted = (await rl.question("Paste the full address you were redirected to: ")).trim();
rl.close();

let code = pasted;
try {
  const back = new URL(pasted);
  if (back.searchParams.get("state") && back.searchParams.get("state") !== state) {
    console.error("State does not match. Start again.");
    process.exit(1);
  }
  code = back.searchParams.get("code") ?? "";
} catch {
  // Not a URL; treat the input as the code itself.
}
if (!code) {
  console.error("No code found. Make sure you approved access and copied the whole address.");
  process.exit(1);
}

const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_key: key,
    client_secret: secret,
    code: decodeURIComponent(code),
    grant_type: "authorization_code",
    redirect_uri: redirect,
  }),
});
const json = (await res.json()) as { refresh_token?: string; scope?: string; open_id?: string; error?: string; error_description?: string };
if (!json.refresh_token) {
  console.error("Token exchange failed:", json.error, json.error_description);
  process.exit(1);
}
console.log(`\nGranted scopes: ${json.scope}`);
if (!json.scope?.includes("video.publish")) console.log("Warning: video.publish was not granted. Add Content Posting API (Direct Post) to the app.");
console.log(`\nTIKTOK_REFRESH_TOKEN=${json.refresh_token}\n`);
console.log("Add it as a GitHub repository secret. It lasts 365 days; the daily run keeps it fresh.");
