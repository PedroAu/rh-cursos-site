import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const validatorPath = resolve(process.cwd(), "scripts/validate-design-system.mjs");
const fixturePath = resolve(process.cwd(), "src/views/public/__design-system-validator-fixture.tsx");
const tokensPath = resolve(process.cwd(), "src/design-tokens/tokens.json");

function runValidator() {
  return spawnSync(process.execPath, [validatorPath], { encoding: "utf8" });
}

describe("validate-design-system", () => {
  it("falha para raio arbitrário fora das exceções permitidas", () => {
    writeFileSync(fixturePath, 'export const fixture = "rounded-[13px]";\n');

    try {
      const result = runValidator();

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Arbitrary Styles Audit");
      expect(result.stdout).toContain("rounded-[13px]");
    } finally {
      rmSync(fixturePath, { force: true });
    }
  });

  it("falha quando o valor serializado diverge do token runtime", () => {
    const originalTokens = readFileSync(tokensPath, "utf8");
    const divergentTokens = originalTokens.replace('"success": "#068466"', '"success": "#000000"');

    expect(divergentTokens).not.toBe(originalTokens);
    writeFileSync(tokensPath, divergentTokens);

    try {
      const result = runValidator();

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("tokens.json colors.status.success");
    } finally {
      writeFileSync(tokensPath, originalTokens);
    }
  });
});
