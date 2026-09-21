#!/usr/bin/env node

import { createHash } from "node:crypto";
import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { domainToASCII, pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

export const APPLY_CONFIRMATION = "APPLY_EMAIL_HYGIENE";
const BATCH_SIZE = 200;
const APPLY_MAX_RESULTS = 5000;
const DNS_CONCURRENCY = 48;
const DOH_CONCURRENCY = 16;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function recoverySnapshotDigest(blocked, steps) {
  const stableBlocked = blocked.map((item) => {
    const stable = { ...item };
    delete stable.checked_at;
    return stable;
  });
  return sha256(JSON.stringify({ blocked: stableBlocked, steps }));
}

export function normalizeEmailForHygiene(value) {
  const email = String(value ?? "").trim().toLocaleLowerCase("en-US");
  if (email.length > 254 || /[\s\x00-\x1f\x7f]/.test(email)) return null;
  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@")) return null;
  const local = email.slice(0, at);
  const domain = domainToASCII(email.slice(at + 1));
  if (
    local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || domain.length > 253 ||
    !domain.includes(".") || domain.split(".").some((label) =>
      !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
    )
  ) return null;
  return { email: `${local}@${domain}`, domain };
}

export function classifyDomainChecks(checks) {
  if (checks.length > 0 && checks.every((check) => check.route)) return "DNS_VALID";
  if (checks.length > 0 && checks.every((check) => check.definitiveNoRoute)) return "NO_MAIL_ROUTE";
  return "DNS_INCONCLUSIVE";
}

export function summarizeResults(results) {
  const reasons = {};
  for (const result of results) reasons[result.reason_code] = (reasons[result.reason_code] ?? 0) + 1;
  return {
    evaluated: results.length,
    eligible: results.filter((result) => result.result === "ELIGIBLE").length,
    blocked: results.filter((result) => result.result === "BLOCKED").length,
    reasons: Object.fromEntries(Object.entries(reasons).sort(([left], [right]) => left.localeCompare(right))),
  };
}

export function parseArgs(argv) {
  const options = {
    mode: "DRY_RUN",
    campaignKey: "prospecting-v1@1",
    runKey: null,
    actorId: "sales-email-hygiene",
    confirmApply: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${argument} exige um valor.`);
      index += 1;
      return next;
    };
    if (argument === "--mode") options.mode = value().toUpperCase().replace("-", "_");
    else if (argument === "--campaign-key") options.campaignKey = value();
    else if (argument === "--run-key") options.runKey = value();
    else if (argument === "--actor") options.actorId = value();
    else if (argument === "--confirm-apply") options.confirmApply = value();
    else throw new Error(`Opcao desconhecida: ${argument}`);
  }
  if (!["DRY_RUN", "APPLY"].includes(options.mode)) throw new Error("--mode deve ser dry-run ou apply.");
  if (!/^[a-z0-9][a-z0-9-]{1,119}@[1-9][0-9]*$/.test(options.campaignKey)) {
    throw new Error("--campaign-key deve incluir a versao, por exemplo prospecting-v1@1.");
  }
  if (options.mode === "APPLY") {
    if (options.confirmApply !== APPLY_CONFIRMATION) {
      throw new Error(`APPLY exige --confirm-apply ${APPLY_CONFIRMATION}.`);
    }
    if (!options.runKey || !/^[A-Za-z0-9][A-Za-z0-9._-]{11,119}$/.test(options.runKey)) {
      throw new Error("APPLY exige --run-key de 12 a 120 caracteres seguros (letras, numeros, ponto, sublinhado ou hifen).");
    }
  }
  return options;
}

async function fetchActiveSequences(client, campaignKey) {
  const rows = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await client
      .from("lead_email_sequence")
      .select("id,lead_id,status,campaign_key,lead!inner(email,deleted_at)")
      .eq("campaign_key", campaignKey)
      .eq("status", "ACTIVE")
      .is("lead.deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Falha ao ler coorte: ${error.message}`);
    rows.push(...data);
    if (data.length < 1_000) return rows;
  }
}

async function systemDnsCheck(domain) {
  let mx = [];
  let ipv4 = [];
  let ipv6 = [];
  const errors = [];
  try { mx = await resolveMx(domain); } catch (error) { errors.push(error?.code ?? "UNKNOWN"); }
  if (mx.length === 0) {
    try { ipv4 = await resolve4(domain); } catch (error) { errors.push(error?.code ?? "UNKNOWN"); }
    try { ipv6 = await resolve6(domain); } catch (error) { errors.push(error?.code ?? "UNKNOWN"); }
  }
  const nullMx = mx.some((record) => !record.exchange || record.exchange === ".");
  const route = (!nullMx && mx.length > 0) || ipv4.length > 0 || ipv6.length > 0;
  return {
    route,
    definitiveNoRoute: !route && (nullMx || (errors.length === 3 && errors.every((code) =>
      code === "ENOTFOUND" || code === "ENODATA"
    ))),
  };
}

async function fetchDoh(provider, domain, type) {
  const base = provider === "cloudflare" ? "https://cloudflare-dns.com/dns-query" : "https://dns.google/resolve";
  const response = await fetch(`${base}?name=${encodeURIComponent(domain)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`${provider} respondeu HTTP ${response.status}.`);
  return response.json();
}

async function dohDnsCheck(provider, domain) {
  try {
    const [mx, ipv4, ipv6] = await Promise.all(
      ["MX", "A", "AAAA"].map((type) => fetchDoh(provider, domain, type)),
    );
    const answers = [mx, ipv4, ipv6].flatMap((response) => response.Answer ?? []);
    const nullMx = (mx.Answer ?? []).some((answer) => String(answer.data).trim().endsWith(" ."));
    const route = !nullMx && answers.some((answer) => [1, 15, 28].includes(answer.type));
    const definitive = [mx, ipv4, ipv6].every((response) => response.Status === 0 || response.Status === 3);
    return { route, definitiveNoRoute: !route && definitive };
  } catch {
    return { route: false, definitiveNoRoute: false };
  }
}

async function mapConcurrent(values, concurrency, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  }));
  return output;
}

async function analyzeRows(rows, checkedAt = new Date().toISOString()) {
  const prepared = rows.map((row) => {
    const rawEmail = String(row.lead?.email ?? "").trim().toLocaleLowerCase("en-US");
    return { row, rawEmail, emailHash: sha256(rawEmail), normalized: normalizeEmailForHygiene(rawEmail) };
  });
  const canonicalByEmail = new Map();
  for (const item of prepared) {
    if (!item.normalized) continue;
    const current = canonicalByEmail.get(item.normalized.email);
    if (!current || item.row.id.localeCompare(current) < 0) canonicalByEmail.set(item.normalized.email, item.row.id);
  }
  const domains = [...new Set(prepared.flatMap((item) => item.normalized ? [item.normalized.domain] : []))];
  const systemChecks = await mapConcurrent(domains, DNS_CONCURRENCY, systemDnsCheck);
  const domainStatus = new Map();
  const suspects = [];
  domains.forEach((domain, index) => {
    if (systemChecks[index].route) domainStatus.set(domain, "DNS_VALID");
    else suspects.push(domain);
  });
  const verified = await mapConcurrent(suspects, DOH_CONCURRENCY, async (domain) => {
    const checks = await Promise.all([dohDnsCheck("cloudflare", domain), dohDnsCheck("google", domain)]);
    return classifyDomainChecks(checks);
  });
  suspects.forEach((domain, index) => domainStatus.set(domain, verified[index]));

  return prepared.map((item) => {
    let reasonCode;
    if (!item.normalized) reasonCode = "INVALID_SYNTAX";
    else if (canonicalByEmail.get(item.normalized.email) !== item.row.id) reasonCode = "DUPLICATE_EMAIL";
    else reasonCode = domainStatus.get(item.normalized.domain) ?? "DNS_INCONCLUSIVE";
    const blocked = ["INVALID_SYNTAX", "DUPLICATE_EMAIL", "NO_MAIL_ROUTE"].includes(reasonCode);
    return {
      sequence_id: item.row.id,
      lead_id: item.row.lead_id,
      email_hash: item.emailHash,
      result: blocked ? "BLOCKED" : "ELIGIBLE",
      reason_code: reasonCode,
      checked_at: checkedAt,
      evidence: {
        method: "syntax-dns-v1",
        ...(item.normalized ? { domain_hash: sha256(item.normalized.domain) } : {}),
      },
    };
  });
}

async function writeRecoverySnapshot(client, campaignKey, results, runKey) {
  const blocked = results.filter((result) => result.result === "BLOCKED");
  const sequenceIds = blocked.map((result) => result.sequence_id);
  const steps = [];
  for (let index = 0; index < sequenceIds.length; index += 100) {
    const { data, error } = await client
      .from("lead_email_sequence_step")
      .select("id,sequence_id,step_index,status,due_at,cancelled_at,claim_token,claim_expires_at,last_error_code")
      .in("sequence_id", sequenceIds.slice(index, index + 100));
    if (error) throw new Error(`Falha ao criar snapshot: ${error.message}`);
    steps.push(...data);
  }
  blocked.sort((left, right) => left.sequence_id.localeCompare(right.sequence_id));
  steps.sort((left, right) => left.id.localeCompare(right.id));
  const digest = recoverySnapshotDigest(blocked, steps);
  const path = join(tmpdir(), `rhcursos-email-hygiene-${sha256(runKey).slice(0, 20)}.json`);
  if (existsSync(path)) {
    const stat = lstatSync(path);
    const ownerMatches = typeof process.getuid !== "function" || stat.uid === process.getuid();
    if (!stat.isFile() || !ownerMatches || (stat.mode & 0o077) !== 0) {
      throw new Error("Snapshot de recuperacao existente e invalido ou inseguro.");
    }
    const snapshot = JSON.parse(readFileSync(path, "utf8"));
    if (snapshot?.campaignKey !== campaignKey || snapshot?.runKey !== runKey ||
      !Array.isArray(snapshot?.blocked) || !Array.isArray(snapshot?.steps) || snapshot?.digest !== digest) {
      throw new Error("Snapshot de recuperacao existente e invalido ou inseguro.");
    }
    return path;
  }
  writeFileSync(path, JSON.stringify({ campaignKey, runKey, createdAt: new Date().toISOString(), digest, blocked, steps }, null, 2), {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return path;
}

async function callBatches(client, options, results, apply) {
  const totals = { evaluated: 0, eligible: 0, blocked: 0, stale: 0, inserted: 0, interrupted: 0, cancelledSteps: 0 };
  for (let index = 0; index < results.length; index += BATCH_SIZE) {
    const payload = results.slice(index, index + BATCH_SIZE).map((result) => ({
      lead_id: result.lead_id,
      email_hash: result.email_hash,
      result: result.result,
      reason_code: result.reason_code,
      checked_at: result.checked_at,
      evidence: result.evidence,
    }));
    const { data, error } = await client.rpc("sales_apply_email_hygiene", {
      p_campaign_key: options.campaignKey,
      p_results: payload,
      p_run_key: options.runKey ?? `dry-run-${new Date().toISOString()}`,
      p_actor_id: options.actorId,
      p_apply: apply,
    });
    if (error) throw new Error(`RPC de higienizacao falhou: ${error.message}`);
    for (const key of Object.keys(totals)) totals[key] += Number(data?.[key] ?? 0);
  }
  return totals;
}

async function applyCohort(client, options, results) {
  if (results.length > APPLY_MAX_RESULTS) {
    throw new Error(`APPLY bloqueado: a coorte excede o limite atomico de ${APPLY_MAX_RESULTS} resultados.`);
  }
  const payload = results.map((result) => ({
    lead_id: result.lead_id,
    email_hash: result.email_hash,
    result: result.result,
    reason_code: result.reason_code,
    checked_at: result.checked_at,
    evidence: result.evidence,
  }));
  const { data, error } = await client.rpc("sales_apply_email_hygiene", {
    p_campaign_key: options.campaignKey,
    p_results: payload,
    p_run_key: options.runKey,
    p_actor_id: options.actorId,
    p_apply: true,
  });
  if (error) throw new Error(`RPC atomica de higienizacao falhou: ${error.message}`);
  return data;
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const options = parseArgs(argv);
  const url = environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = await fetchActiveSequences(client, options.campaignKey);
  if (options.mode === "APPLY" && rows.length === 0) {
    throw new Error("APPLY bloqueado: a campanha nao possui sequencias ativas para higienizar.");
  }
  const results = await analyzeRows(rows);
  const local = summarizeResults(results);

  if (options.mode === "DRY_RUN") {
    const server = await callBatches(client, options, results, false);
    console.log(JSON.stringify({ mode: "DRY_RUN", campaignKey: options.campaignKey, ...local, server }, null, 2));
    return;
  }

  const preview = await callBatches(client, options, results, false);
  if (preview.stale > 0) throw new Error("A coorte mudou durante a varredura; execute novamente.");
  const snapshotPath = await writeRecoverySnapshot(client, options.campaignKey, results, options.runKey);
  const applied = await applyCohort(client, options, results);
  console.log(JSON.stringify({
    mode: "APPLY",
    campaignKey: options.campaignKey,
    runKey: options.runKey,
    ...local,
    applied,
    recoverySnapshot: snapshotPath,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`ERRO: ${error instanceof Error ? error.message : "Falha desconhecida."}`);
    process.exitCode = 1;
  });
}
