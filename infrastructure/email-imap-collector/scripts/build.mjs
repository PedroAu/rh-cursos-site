import { rm } from "node:fs/promises";

import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/handler.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outfile: "dist/handler.mjs",
  sourcemap: true,
  minify: true,
  legalComments: "none",
});
