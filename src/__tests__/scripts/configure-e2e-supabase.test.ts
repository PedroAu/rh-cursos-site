import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/configure-e2e-supabase.mjs");

function readEnvironment(source: string) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

describe("configure-e2e-supabase", () => {
  it("remove referências locais obsoletas ao configurar o projeto isolado", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "rh-cursos-e2e-config-"));
    const binDir = join(fixtureRoot, "bin");
    const fakeSupabase = join(binDir, "supabase");
    const targetRef = "testref1234567890123";
    const productionRef = "prodref1234567890123";

    mkdirSync(binDir);
    writeFileSync(
      fakeSupabase,
      `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify([\n  { type: "publishable", api_key: "publishable-test-key" },\n  { type: "secret", api_key: "service-role-test-key" }\n]));\n`,
    );
    chmodSync(fakeSupabase, 0o755);
    writeFileSync(
      join(fixtureRoot, ".env.local"),
      `NEXT_PUBLIC_SUPABASE_URL=https://${productionRef}.supabase.co\n`,
    );
    writeFileSync(
      join(fixtureRoot, ".env.e2e.local"),
      [
        "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
        "SUPABASE_URL=http://127.0.0.1:54321",
        "NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1",
        "SUPABASE_FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1",
        "E2E_LOCAL_SUPABASE=1",
      ].join("\n"),
    );

    try {
      const result = spawnSync(process.execPath, [scriptPath, targetRef], {
        cwd: fixtureRoot,
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}` },
      });

      if (result.error) throw result.error;

      expect(
        result.status,
        `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      ).toBe(0);

      const configured = readEnvironment(readFileSync(join(fixtureRoot, ".env.e2e.local"), "utf8"));
      const targetUrl = `https://${targetRef}.supabase.co`;

      expect(configured.NEXT_PUBLIC_SUPABASE_URL).toBe(targetUrl);
      expect(configured.SUPABASE_URL).toBe(targetUrl);
      expect(configured.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL).toBe(`${targetUrl}/functions/v1`);
      expect(configured.SUPABASE_FUNCTIONS_URL).toBe(`${targetUrl}/functions/v1`);
      expect(configured.E2E_LOCAL_SUPABASE).toBe("0");
      expect(configured.E2E_SUPABASE_PROJECT_REF).toBe(targetRef);
      expect(configured.E2E_PRODUCTION_PROJECT_REF).toBe(productionRef);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
