import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const workflowsDirectory = resolve(process.cwd(), ".github/workflows");

function readWorkflow(name: string) {
  return readFileSync(resolve(workflowsDirectory, name), "utf8");
}

const migrations = readWorkflow("apply-migrations.yml");
const production = readWorkflow("production-pipeline.yml");

function readTopLevelBlock(source: string, key: string) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start < 0) throw new Error(`Bloco top-level ausente: ${key}`);

  const block: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line !== "" && !line.startsWith(" ") && !line.startsWith("#")) break;
    block.push(line);
  }
  return block.join("\n");
}

function readNestedBlock(source: string, key: string, indentation: number) {
  const lines = source.split("\n");
  const prefix = `${" ".repeat(indentation)}${key}:`;
  const start = lines.findIndex((line) => line === prefix);
  if (start < 0) throw new Error(`Bloco aninhado ausente: ${key}`);

  const block: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const currentIndentation = line.match(/^ */)?.[0].length ?? 0;
    if (line.trim() !== "" && currentIndentation <= indentation) break;
    block.push(line);
  }
  return block.join("\n");
}

function externalActionReferences(source: string) {
  return Array.from(source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm), (match) => match[1] ?? "")
    .filter((reference) => !reference.startsWith("./"));
}

function readScopeScript(source: string) {
  const lines = source.split("\n");
  const scopeStep = lines.findIndex((line) => line === "        id: scope");
  const runStart = lines.findIndex(
    (line, index) => index > scopeStep && line === "        run: |",
  );
  if (scopeStep < 0 || runStart < 0) {
    throw new Error("Script de detecção de escopo ausente");
  }

  const script: string[] = [];
  for (let index = runStart + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const indentation = line.match(/^ */)?.[0].length ?? 0;
    if (line.trim() !== "" && indentation < 10) break;
    script.push(line.startsWith("          ") ? line.slice(10) : line);
  }
  return script.join("\n");
}

function runScopeDetection({
  changedFiles = [],
  eventName = "push",
  unknownBase = false,
}: {
  changedFiles?: string[];
  eventName?: string;
  unknownBase?: boolean;
}) {
  const directory = mkdtempSync(resolve(tmpdir(), "rec-402-scope-"));
  const output = resolve(directory, "github-output.txt");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();

  try {
    git("init", "--quiet");
    git("config", "user.email", "rec-402@example.invalid");
    git("config", "user.name", "REC-402 Test");
    writeFileSync(resolve(directory, "README.md"), "base\n");
    git("add", "README.md");
    git("commit", "--quiet", "-m", "base");
    const before = git("rev-parse", "HEAD");

    for (const file of changedFiles) {
      const path = resolve(directory, file);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, `${file}\n`);
    }
    if (changedFiles.length > 0) {
      git("add", "--all");
      git("commit", "--quiet", "-m", "changes");
    }
    const current = git("rev-parse", "HEAD");

    execFileSync("bash", ["-c", readScopeScript(production)], {
      cwd: directory,
      env: {
        ...process.env,
        BEFORE_SHA: unknownBase ? "0".repeat(40) : before,
        CURRENT_SHA: current,
        EVENT_NAME: eventName,
        GITHUB_OUTPUT: output,
      },
      encoding: "utf8",
    });

    return Object.fromEntries(
      readFileSync(output, "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split("=", 2)),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("REC-402 mandatory production migrations", () => {
  it("exposes migrations only as a protected reusable workflow", () => {
    const triggers = readTopLevelBlock(migrations, "on");

    expect(triggers).toContain("  workflow_call:");
    expect(triggers).not.toMatch(/^  (push|pull_request|workflow_dispatch):/m);
    expect(migrations).toContain("permissions:\n  contents: read");
    expect(migrations).toContain("environment: production");
    expect(migrations).toContain("cancel-in-progress: false");

    for (const secret of [
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_PROJECT_REF",
      "SUPABASE_DB_PASSWORD",
    ]) {
      expect(triggers).toContain(`      ${secret}:`);
      expect(triggers).toContain("        required: true");
    }
  });

  it("uses the pinned CLI and fails closed on migration history drift", () => {
    expect(migrations).toContain("version: 2.105.0");
    expect(migrations).toContain("supabase link --project-ref \"$SUPABASE_PROJECT_REF\"");
    expect(migrations).toContain("supabase db push --linked --yes");
    expect(migrations).not.toContain("--include-all");
    expect(migrations).not.toContain("--include-seed");
    expect(migrations).not.toContain("migration repair");
    expect(migrations).not.toContain("continue-on-error");

    const references = externalActionReferences(migrations);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference).toMatch(/@[a-f0-9]{40}$/);
    }
  });

  it("detects database changes and gates migrations only when the database changes", () => {
    const changes = readNestedBlock(production, "changes", 2);
    const migrate = readNestedBlock(production, "migrate-database", 2);

    expect(changes).toContain("database: ${{ steps.scope.outputs.database }}");
    expect(changes).toContain("database=false");
    expect(changes).toContain("supabase/migrations/*)");
    expect(changes).toContain("database=true");
    expect(changes).toContain('\"$EVENT_NAME\" == \"workflow_dispatch\"');

    expect(migrate).toContain("needs: [changes, ci]");
    expect(migrate).toContain("github.event_name == 'workflow_dispatch'");
    expect(migrate).toContain("needs.ci.result == 'success'");
    expect(migrate).toContain("needs.changes.outputs.database == 'true'");
    expect(migrate).not.toContain("needs.changes.outputs.functions == 'true'");
    expect(migrate).not.toContain("needs.changes.outputs.frontend == 'true'");
    expect(migrate).toContain("uses: ./.github/workflows/apply-migrations.yml");
    expect(migrate).not.toContain("secrets: inherit");

    for (const secret of [
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_PROJECT_REF",
      "SUPABASE_DB_PASSWORD",
    ]) {
      expect(migrate).toContain(`${secret}: \${{ secrets.${secret} }}`);
    }
  });

  it(
    "executes path detection fail-closed for database, docs and uncertain inputs",
    () => {
      expect(
        runScopeDetection({
          changedFiles: ["supabase/migrations/20260714000000_rec_402.sql"],
        }),
      ).toEqual({ database: "true", functions: "false", frontend: "false" });

      expect(runScopeDetection({ changedFiles: ["docs/operations.md"] })).toEqual({
        database: "false",
        functions: "false",
        frontend: "false",
      });

      expect(runScopeDetection({ eventName: "workflow_dispatch" })).toEqual({
        database: "true",
        functions: "true",
        frontend: "true",
      });

      expect(runScopeDetection({ unknownBase: true })).toEqual({
        database: "true",
        functions: "true",
        frontend: "true",
      });
    },
    20_000,
  );

  it("orders CI, migrations, Functions and frontend without treating failure as skipped", () => {
    const functions = readNestedBlock(production, "deploy-functions", 2);
    const frontend = readNestedBlock(production, "deploy-frontend", 2);

    expect(functions).toContain("needs: [changes, ci, migrate-database]");
    expect(functions).toContain("github.event_name == 'workflow_dispatch'");
    expect(functions).toContain("needs.migrate-database.result == 'success'");
    expect(functions).toContain("needs.migrate-database.result == 'skipped'");
    expect(functions).toContain("needs.changes.outputs.database == 'false'");

    expect(frontend).toContain("needs: [changes, ci, migrate-database, deploy-functions]");
    expect(frontend).toContain("github.event_name == 'workflow_dispatch'");
    expect(frontend).toContain("needs.migrate-database.result == 'success'");
    expect(frontend).toContain("needs.migrate-database.result == 'skipped'");
    expect(frontend).toContain("needs.changes.outputs.functions == 'true'");
    expect(frontend).toContain("needs.deploy-functions.result == 'success'");
    expect(frontend).toContain("needs.changes.outputs.functions == 'false'");
    expect(frontend).toContain("needs.deploy-functions.result == 'skipped'");
    expect(frontend).toContain("needs.changes.outputs.database == 'false'");
    expect(production).not.toContain("continue-on-error");
  });
});
