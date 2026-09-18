import { rm } from "node:fs/promises";

import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: {
    handler: "src/handler.ts",
    cli: "src/cli.ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  sourcemap: true,
  minify: true,
  legalComments: "none",
  tsconfig: "tsconfig.json",
});
