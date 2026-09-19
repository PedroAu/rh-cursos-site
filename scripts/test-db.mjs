#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const cliHome = join(tmpdir(), "site-rh-cursos-supabase-cli");
mkdirSync(cliHome, { recursive: true });

const env = {
  ...process.env,
  HOME: process.env.HOME && process.env.HOME.startsWith("/Users/") ? cliHome : (process.env.HOME ?? cliHome),
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runOptional(command, args) {
  spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
}

runOptional("supabase", ["stop", "--no-backup"]);
run("supabase", [
  "start",
  "-x",
  "edge-runtime,gotrue,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector",
]);
run("supabase", ["db", "reset", "--local", "--yes"]);
run("supabase", ["test", "db", "--local", "supabase/tests/database"]);
run("node", ["scripts/test-db-concurrency.mjs"]);
run("node", ["scripts/test-db-rec105-concurrency.mjs"]);
run("node", ["scripts/test-db-contact-import-concurrency.mjs"]);
