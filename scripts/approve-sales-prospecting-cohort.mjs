#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

export const APPLY_CONFIRMATION = "APPLY_PROSPECTING_COHORT";

export function parseProspectingCohortArgs(argv) {
  const options = {
    mode: "DRY_RUN",
    campaignKey: "prospecting-v1",
    decisionKey: null,
    expectedDigest: null,
    approvalReference: null,
    expiresAt: null,
    actorId: "controller-pedro",
    confirmApply: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const consumeValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} exige um valor.`);
      index += 1;
      return value;
    };
    if (arg === "--mode") options.mode = consumeValue().toUpperCase().replace("-", "_");
    else if (arg === "--campaign-key") options.campaignKey = consumeValue();
    else if (arg === "--decision-key") options.decisionKey = consumeValue();
    else if (arg === "--expected-digest") options.expectedDigest = consumeValue();
    else if (arg === "--approval-reference") options.approvalReference = consumeValue();
    else if (arg === "--expires-at") options.expiresAt = consumeValue();
    else if (arg === "--actor") options.actorId = consumeValue();
    else if (arg === "--confirm-apply") options.confirmApply = consumeValue();
    else throw new Error(`Opção desconhecida: ${arg}`);
  }

  if (!["DRY_RUN", "APPLY"].includes(options.mode)) throw new Error("--mode deve ser dry-run ou apply.");
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(String(options.campaignKey ?? ""))) {
    throw new Error("--campaign-key inválido.");
  }
  if (String(options.actorId ?? "").trim().length < 3) throw new Error("--actor inválido.");

  if (options.mode === "APPLY") {
    if (options.confirmApply !== APPLY_CONFIRMATION) {
      throw new Error(`APPLY exige --confirm-apply ${APPLY_CONFIRMATION}.`);
    }
    if (String(options.decisionKey ?? "").trim().length < 12) throw new Error("APPLY exige --decision-key.");
    if (!/^[0-9a-f]{64}$/.test(String(options.expectedDigest ?? ""))) {
      throw new Error("APPLY exige --expected-digest SHA-256.");
    }
    if (String(options.approvalReference ?? "").trim().length < 12) {
      throw new Error("APPLY exige --approval-reference imutável.");
    }
    const expiryText = String(options.expiresAt ?? "");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(expiryText)) {
      throw new Error("APPLY exige --expires-at ISO-8601 com Z ou offset explícito.");
    }
    const expiry = Date.parse(expiryText);
    if (!Number.isFinite(expiry)) throw new Error("APPLY exige --expires-at ISO-8601 válido.");
    const now = Date.now();
    if (expiry <= now || expiry > now + 30 * 24 * 60 * 60 * 1000) {
      throw new Error("APPLY exige --expires-at no futuro e em até 30 dias.");
    }
  }

  return options;
}

async function rpc(client, name, params) {
  const result = await client.rpc(name, params);
  if (result.error) {
    const code = typeof result.error.code === "string" ? result.error.code : "UNKNOWN";
    const detail = typeof result.error.message === "string" ? result.error.message : "sem detalhe";
    throw new Error(`${name} falhou (${code}): ${detail}`);
  }
  return result.data;
}

function aggregateReport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("RPC retornou relatório agregado inválido.");
  }
  const allowed = [
    "decisionId", "campaignKey", "campaignVersion", "purpose", "evaluated",
    "eligible", "excludedByReason", "cohortDigest", "approved", "expiresAt",
    "idempotent", "messagesSent", "sequencesCreated",
  ];
  return Object.fromEntries(allowed.flatMap((key) => key in data ? [[key, data[key]]] : []));
}

export async function executeProspectingCohort({ client, options }) {
  if (options.mode === "DRY_RUN") {
    return aggregateReport(await rpc(client, "sales_plan_prospecting_permission_cohort", {
      p_campaign_key: options.campaignKey,
    }));
  }

  return aggregateReport(await rpc(client, "sales_apply_prospecting_permission_cohort", {
    p_campaign_key: options.campaignKey,
    p_decision_key: options.decisionKey,
    p_expected_digest: options.expectedDigest,
    p_approval_reference: options.approvalReference,
    p_expires_at: new Date(options.expiresAt).toISOString(),
    p_actor_id: options.actorId,
  }));
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  try {
    const options = parseProspectingCohortArgs(argv);
    const supabaseUrl = environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
    }
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const report = await executeProspectingCohort({ client, options });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : "Falha desconhecida."}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
