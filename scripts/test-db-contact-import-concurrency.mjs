#!/usr/bin/env node
// Prova de concorrência real para o gate de importação: duas conexões e dois
// lotes APPLY tentam criar simultaneamente o mesmo e-mail normalizado. O lock
// transacional deve produzir exatamente um CREATED e um EXISTING.

import { spawn } from "node:child_process";

const connectionString =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const nonce = Date.now().toString();
const email = `contact-import-concurrency-${nonce}@rhcursos.test`;
const digestA = nonce.padEnd(64, "a").slice(0, 64);
const digestB = nonce.padEnd(64, "b").slice(0, 64);
const sourceKeyA = nonce.padEnd(64, "1").slice(0, 64);
const sourceKeyB = nonce.padEnd(64, "2").slice(0, 64);

function runPsql(sql, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [connectionString, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() };
      if (result.code !== 0 && !allowFailure) {
        reject(new Error(result.stderr || `psql saiu com código ${result.code}.`));
        return;
      }
      resolve(result);
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function scalar(sql) {
  return (await runPsql(sql)).stdout;
}

function createBatchSql(label, digest) {
  return `select public.sales_create_contact_import_batch(
    '${label}', 'APPLY', 1, 1, '${digest}', 'approval:concurrency:${nonce}', 'concurrency-test'
  );`;
}

function importSql(batchId, sourceKey, name) {
  return `select candidate_id, lead_id, action
  from public.sales_import_contact_candidate(
    '${batchId}'::uuid, '${sourceKey}', '${name}', '${email}', null, null,
    false, null, null, null, null, 'concurrency-test'
  );`;
}

async function cleanup() {
  await runPsql(
    `
      delete from public.contact_import_candidate
      where batch_id in (
        select id from public.contact_import_batch
        where source_label in ('concurrency-a-${nonce}', 'concurrency-b-${nonce}')
      );
      delete from public.lead_contact_permission_event
      where lead_id in (select id from public.lead where lower(email) = lower('${email}'));
      delete from public.lead_segment_assignment
      where lead_id in (select id from public.lead where lower(email) = lower('${email}'));
      delete from public.lead_source_history_evidence
      where lead_id in (select id from public.lead where lower(email) = lower('${email}'));
      delete from public.lead where lower(email) = lower('${email}');
      delete from public.contact_import_batch
      where source_label in ('concurrency-a-${nonce}', 'concurrency-b-${nonce}');
    `,
    { allowFailure: true },
  );
}

async function main() {
  await cleanup();
  const batchA = await scalar(createBatchSql(`concurrency-a-${nonce}`, digestA));
  const batchB = await scalar(createBatchSql(`concurrency-b-${nonce}`, digestB));
  assert(batchA && batchB, "Não foi possível preparar os dois lotes concorrentes.");

  try {
    const [first, second] = await Promise.all([
      runPsql(importSql(batchA, sourceKeyA, "Contato Concorrente A"), { allowFailure: true }),
      runPsql(importSql(batchB, sourceKeyB, "Contato Concorrente B"), { allowFailure: true }),
    ]);
    assert(first.code === 0 && second.code === 0, `RPC concorrente falhou: ${first.stderr}\n${second.stderr}`);
    const combined = `${first.stdout}\n${second.stdout}`;
    assert((combined.match(/\|CREATED(?:\n|$)/g) ?? []).length === 1, `Esperava 1 CREATED: ${combined}`);
    assert((combined.match(/\|EXISTING(?:\n|$)/g) ?? []).length === 1, `Esperava 1 EXISTING: ${combined}`);

    const leadCount = Number(
      await scalar(`select count(*) from public.lead where lower(email) = lower('${email}');`),
    );
    const segmentCount = Number(
      await scalar(`select count(*) from public.lead_segment_assignment segment
        join public.lead lead on lead.id = segment.lead_id
        where lower(lead.email) = lower('${email}');`),
    );
    const permissionCount = Number(
      await scalar(`select count(*) from public.lead_contact_permission_event permission
        join public.lead lead on lead.id = permission.lead_id
        where lower(lead.email) = lower('${email}');`),
    );
    const auditCount = Number(
      await scalar(`select count(*) from public.contact_import_candidate candidate
        where candidate.batch_id in ('${batchA}'::uuid, '${batchB}'::uuid);`),
    );
    assert(leadCount === 1, `Esperava um único lead; obtidos ${leadCount}.`);
    assert(segmentCount === 1, `Esperava uma atribuição de segmento; obtidas ${segmentCount}.`);
    assert(permissionCount === 1, `Esperava um evento UNKNOWN de permissão; obtidos ${permissionCount}.`);
    assert(auditCount === 2, `Esperava duas decisões auditadas; obtidas ${auditCount}.`);
    console.log("✅ Importação concorrente criou 1 lead, preservou 1 existente e manteve auditoria idempotente.");
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
