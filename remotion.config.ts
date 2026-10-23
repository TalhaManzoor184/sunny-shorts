import { Config } from "@remotion/cli/config";

// Settings for `npm run studio`. The daily pipeline renders through src/pipeline/render.ts.
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
