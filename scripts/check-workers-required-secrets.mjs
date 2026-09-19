#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_WORKER_SECRETS = Object.freeze([
  "ASAAS_API_KEY",
  "ASAAS_WEBHOOK_TOKEN",
  "EMAIL_UNSUBSCRIBE_SECRET",
  "IMAP_EVENTS_WEBHOOK_SECRET",
  "SES_EVENTS_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

export function parseSecretNames(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("A resposta do Wrangler não é JSON válido.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("A resposta do Wrangler deve ser uma lista de metadados de secrets.");
  }

  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.name !== "string") {
      throw new Error("A resposta do Wrangler contém um secret sem nome válido.");
    }

    return entry.name;
  });
}

export function findMissingSecrets(secretNames, requiredSecrets = REQUIRED_WORKER_SECRETS) {
  const configured = new Set(secretNames);
  return requiredSecrets.filter((name) => !configured.has(name));
}

function resolveWranglerCommand() {
  const localWrangler = resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler",
  );

  if (existsSync(localWrangler)) {
    return { command: localWrangler, prefixArgs: [] };
  }

  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    prefixArgs: ["--no-install", "wrangler"],
  };
}

export function listWorkerSecretNames({
  workerName = process.env.CLOUDFLARE_WORKER_NAME ?? "site-rh-cursos",
  environment = process.env,
} = {}) {
  const { command, prefixArgs } = resolveWranglerCommand();
  const result = spawnSync(
    command,
    [...prefixArgs, "secret", "list", "--name", workerName, "--format", "json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
      shell: false,
    },
  );

  if (result.error) {
    throw new Error(`Não foi possível iniciar o Wrangler: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const details = result.stderr.trim();
    throw new Error(
      `Wrangler não conseguiu listar os secrets${details ? `: ${details}` : "."}`,
    );
  }

  return parseSecretNames(result.stdout);
}

export function main() {
  const workerName = process.env.CLOUDFLARE_WORKER_NAME ?? "site-rh-cursos";
  const configured = listWorkerSecretNames({ workerName });
  const missing = findMissingSecrets(configured);

  if (missing.length > 0) {
    console.error(`❌ Worker ${workerName}: secrets obrigatórios ausentes:`);
    for (const name of missing) console.error(`- ${name}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Worker ${workerName}: ${REQUIRED_WORKER_SECRETS.length} secrets obrigatórios presentes.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
