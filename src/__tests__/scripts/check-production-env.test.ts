import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/check-production-env.mjs");
const validEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://rh-cursos.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiJ9.production-safe-public-key-value",
  NEXT_PUBLIC_APP_URL: "https://www.rhcursos.com.br",
  AUTH_SESSION_SECRET: "a-32-character-session-secret-for-tests",
};

function runEnvironmentCheck(overrides: Record<string, string | undefined> = {}) {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...validEnvironment, ...overrides };

  Object.entries(environment).forEach(([key, value]) => {
    if (value === undefined) delete environment[key];
  });

  return spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: environment,
  });
}

describe("check-production-env", () => {
  it("aceita uma configuração de produção válida", () => {
    const result = runEnvironmentCheck();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Ambiente de produção validado");
  });

  it("falha quando uma variável obrigatória está ausente", () => {
    const result = runEnvironmentCheck({ NEXT_PUBLIC_SUPABASE_URL: undefined });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEXT_PUBLIC_SUPABASE_URL: ausente");
  });

  it("falha quando uma variável obrigatória está vazia", () => {
    const result = runEnvironmentCheck({ AUTH_SESSION_SECRET: "" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("AUTH_SESSION_SECRET: ausente");
  });

  it("falha para placeholders", () => {
    const result = runEnvironmentCheck({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "replace-with-production-key" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: valor inválido ou placeholder");
  });

  it("rejeita HTTP para host não local", () => {
    const result = runEnvironmentCheck({ NEXT_PUBLIC_APP_URL: "http://www.rhcursos.com.br" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEXT_PUBLIC_APP_URL: valor inválido ou placeholder");
  });

  it("rejeita origem com path", () => {
    const result = runEnvironmentCheck({ NEXT_PUBLIC_APP_URL: "https://www.rhcursos.com.br/portal" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEXT_PUBLIC_APP_URL: valor inválido ou placeholder");
  });

  it("permite HTTP apenas para localhost", () => {
    const result = runEnvironmentCheck({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" });

    expect(result.status).toBe(0);
  });
});
