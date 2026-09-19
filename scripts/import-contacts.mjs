#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { buildContactImportCandidates } from "./contact-import-plan.mjs";

const APPLY_CONFIRMATION = "APPLY_CONTACTS_TO_CRM";
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export function parseImportArgs(argv) {
  const files = [];
  const options = {
    mode: "DRY_RUN",
    sourceLabel: "bases-comerciais-2026-09",
    approvalReference: null,
    actorId: "contact-import-cli",
    confirmApply: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") options.mode = String(argv[++index] ?? "").toUpperCase().replace("-", "_");
    else if (arg === "--source-label") options.sourceLabel = argv[++index];
    else if (arg === "--approval-reference") options.approvalReference = argv[++index];
    else if (arg === "--actor") options.actorId = argv[++index];
    else if (arg === "--confirm-apply") options.confirmApply = argv[++index];
    else if (arg.startsWith("--")) throw new Error(`Opção desconhecida: ${arg}`);
    else files.push(arg);
  }
  if (!files.length) throw new Error("Informe ao menos uma base CSV.");
  if (!['DRY_RUN', 'APPLY'].includes(options.mode)) throw new Error("--mode deve ser dry-run ou apply.");
  if (String(options.sourceLabel ?? "").trim().length < 3) throw new Error("--source-label inválido.");
  if (String(options.actorId ?? "").trim().length < 3) throw new Error("--actor inválido.");
  if (options.mode === "APPLY") {
    if (options.confirmApply !== APPLY_CONFIRMATION) {
      throw new Error(`APPLY exige --confirm-apply ${APPLY_CONFIRMATION}.`);
    }
    if (String(options.approvalReference ?? "").trim().length < 12) {
      throw new Error("APPLY exige --approval-reference com ao menos 12 caracteres.");
    }
  }
  return { ...options, files };
}

function loadSource(filePath) {
  const absolutePath = resolve(filePath);
  const stat = statSync(absolutePath);
  if (!stat.isFile()) throw new Error(`Entrada não é arquivo: ${basename(filePath)}`);
  if (stat.size > MAX_INPUT_BYTES) throw new Error(`CSV excede 20 MiB: ${basename(filePath)}`);
  return { name: basename(absolutePath), text: readFileSync(absolutePath, "utf8") };
}

async function rpc(client, name, params) {
  const result = await client.rpc(name, params);
  if (result.error) {
    const code = typeof result.error.code === "string" ? result.error.code : "UNKNOWN";
    throw new Error(`${name} falhou (${code}).`);
  }
  return result.data;
}

function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export async function executeContactImport({ client, prepared, options }) {
  if (!prepared.candidates.length) throw new Error("Nenhum candidato seguro para processar.");
  const batchId = await rpc(client, "sales_create_contact_import_batch", {
    p_source_label: options.sourceLabel,
    p_mode: options.mode,
    p_source_rows: prepared.sourceRows,
    p_candidate_count: prepared.candidates.length,
    p_file_set_digest: prepared.fileSetDigest,
    p_approval_reference: options.approvalReference,
    p_actor_id: options.actorId,
  });
  if (typeof batchId !== "string") throw new Error("RPC de lote não retornou um identificador válido.");

  const actions = new Map();
  const reasons = new Map();
  for (let index = 0; index < prepared.candidates.length; index += 1) {
    const candidate = prepared.candidates[index];
    const data = await rpc(client, "sales_import_contact_candidate", {
      p_batch_id: batchId,
      p_source_key: candidate.sourceKey,
      p_name: candidate.name,
      p_email: candidate.email,
      p_phone: candidate.phone,
      p_organization: candidate.organization,
      p_has_source_history: candidate.hasSourceHistory,
      p_source_last_activity_at: candidate.sourceLastActivityAt,
      p_source_event_type: candidate.sourceEventType,
      p_source_event_at: candidate.sourceEventAt,
      p_legal_basis: candidate.legalBasis,
      p_actor_id: options.actorId,
    });
    const row = firstRow(data);
    if (!row || typeof row.action !== "string" || !Array.isArray(row.reason_codes)) {
      throw new Error(`RPC de candidato retornou contrato inválido no item ${index + 1}.`);
    }
    actions.set(row.action, (actions.get(row.action) ?? 0) + 1);
    for (const reason of row.reason_codes) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  const completed = await rpc(client, "sales_complete_contact_import_batch", {
    p_batch_id: batchId,
    p_actor_id: options.actorId,
  });
  if (completed !== true) throw new Error("RPC não confirmou a conclusão do lote.");

  return {
    mode: options.mode,
    batch_id: batchId,
    source_rows: prepared.sourceRows,
    candidates_processed: prepared.candidates.length,
    local_safeguards: prepared.stats,
    actions: Object.fromEntries([...actions.entries()].sort()),
    reason_codes: Object.fromEntries([...reasons.entries()].sort()),
    messages_sent: 0,
    reactivation_sequences_created: 0,
  };
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  try {
    const options = parseImportArgs(argv);
    const sources = options.files.map(loadSource);
    const prepared = buildContactImportCandidates({ sources });
    const supabaseUrl = environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
    }
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const report = await executeContactImport({ client, prepared, options });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : "Falha desconhecida."}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
