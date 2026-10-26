import "dotenv/config";
import readline from "node:readline/promises";

/**
 * One-time helper to get a never-expiring Facebook Page token.
 *   1. Put FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env.
 *   2. In Graph API Explorer (developers.facebook.com/tools/explorer), pick your app, choose
 *      "Get User Access Token" with pages_show_list, pages_read_engagement, pages_manage_posts,
 *      approve for Sunny's Page, and copy the token.
 *   3. npm run auth:facebook  and paste that token.
 * It prints FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN for your GitHub secrets.
 */

const V = process.env.FACEBOOK_GRAPH_VERSION || "v26.0";
const appId = process.env.FACEBOOK_APP_ID;
const appSecret = process.env.FACEBOOK_APP_SECRET;
if (!appId || !appSecret) {
  console.error("Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env first.");
  process.exit(1);
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/${V}/${path}?${new URLSearchParams(params)}`);
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(`${path}: ${json.error?.message ?? res.status}`);
  return json;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const shortToken = (await rl.question("Paste the user access token from Graph API Explorer: ")).trim();

// Short-lived user token → long-lived user token (Page tokens from it never expire)
const long = await get<{ access_token: string }>("oauth/access_token", {
  grant_type: "fb_exchange_token",
  client_id: appId,
  client_secret: appSecret,
  fb_exchange_token: shortToken,
});

const pages = await get<{ data: { id: string; name: string; access_token: string; tasks?: string[] }[] }>("me/accounts", {
  access_token: long.access_token,
  fields: "id,name,access_token,tasks",
});
if (!pages.data.length) {
  console.error("No Pages found. Make sure you selected the Page when approving the token.");
  process.exit(1);
}
pages.data.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} (${p.id})`));
const pick = pages.data.length === 1 ? 1 : Number(await rl.question("Which Page is Sunny's? Number: "));
rl.close();
const page = pages.data[pick - 1];
if (!page) {
  console.error("Invalid choice.");
  process.exit(1);
}
if (page.tasks && !page.tasks.includes("CREATE_CONTENT")) console.warn("Warning: your role on this Page cannot create content.");

const dbg = await get<{ data: { expires_at?: number; scopes?: string[] } }>("debug_token", {
  input_token: page.access_token,
  access_token: `${appId}|${appSecret}`,
});
const missing = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"].filter((s) => !dbg.data.scopes?.includes(s));
if (missing.length) console.warn(`Warning: token is missing ${missing.join(", ")}.`);
console.log(`\nPage: ${page.name}`);
console.log(`Expires: ${dbg.data.expires_at ? new Date(dbg.data.expires_at * 1000).toISOString() : "never"}`);
console.log(`\nFACEBOOK_PAGE_ID=${page.id}`);
console.log(`FACEBOOK_PAGE_TOKEN=${page.access_token}\n`);
console.log("Add both as GitHub repository secrets. Keep the token private.");
