import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { EpisodeProps } from "../shared/episode";
import { config } from "./config";

export async function renderEpisode(props: EpisodeProps, publicDir: string, outFile: string): Promise<void> {
  const serveUrl = await bundle({ entryPoint: config.paths.entry, publicDir });
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({
    serveUrl,
    id: "SunnyEpisode",
    inputProps,
    browserExecutable: config.chromePath,
  });
  let lastPct = -10;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    crf: 18,
    audioBitrate: "192k",
    outputLocation: outFile,
    browserExecutable: config.chromePath,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastPct + 10) {
        lastPct = pct;
        console.log(`  render ${pct}%`);
      }
    },
  });
}
