import fs from "node:fs/promises";
import path from "node:path";
import { loadHistory } from "../pipeline/history";

/**
 * Finds rendered episodes (a folder with episode.mp4 + script.json) under the given folders,
 * keeps the ones that were uploaded (their title is in data/history.json with a videoId),
 * and copies them to --out as <date>_<videoId>.mp4, the names the compilation expects.
 * Test and --no-upload renders have no history entry, so they are skipped.
 *
 *   npx tsx src/scripts/archive-collect.ts --out=archive out
 *   npx tsx src/scripts/archive-collect.ts --out=archive artifacts
 */

const argv = process.argv.slice(2);
const outDir = path.resolve(argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "archive");
const roots = argv.filter((a) => !a.startsWith("--"));

async function* episodeDirs(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const names = new Set(entries.map((e) => e.name));
  if (names.has("episode.mp4") && names.has("script.json")) yield dir;
  for (const e of entries) if (e.isDirectory() && e.name !== "public") yield* episodeDirs(path.join(dir, e.name));
}

async function main() {
  const history = (await loadHistory()).filter((h) => h.videoId);
  await fs.mkdir(outDir, { recursive: true });
  let copied = 0;
  for (const root of roots) {
    for await (const dir of episodeDirs(root)) {
      const { title } = JSON.parse(await fs.readFile(path.join(dir, "script.json"), "utf8")) as { title: string };
      const entry = [...history].reverse().find((h) => h.title === title);
      if (!entry) {
        console.log(`skip (not uploaded): ${title}`);
        continue;
      }
      const name = `${entry.date}_${entry.videoId}.mp4`;
      await fs.copyFile(path.join(dir, "episode.mp4"), path.join(outDir, name));
      console.log(`archived ${name}  ${title}`);
      copied++;
    }
  }
  console.log(`${copied} episode(s) in ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
