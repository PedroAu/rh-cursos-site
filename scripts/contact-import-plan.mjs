#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const DEFAULT_INACTIVE_DAYS = 15;
const CLASSIFICATION = "Gestão de Pessoas";

function normalizeLabel(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeEmail(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  return digits.length === 10 || digits.length === 11 ? digits : null;
}

export function parseCsv(text) {
  const input = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV inválido: campo entre aspas não foi encerrado.");
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value !== "")) rows.push(row);
  if (rows.length === 0) throw new Error("CSV vazio.");

  const [headers, ...dataRows] = rows;
  if (headers.length < 2) throw new Error("CSV inválido: menos de duas colunas.");
  return { headers, rows: dataRows };
}

function indexesFor(headers, candidates) {
  const normalizedCandidates = new Set(candidates.map(normalizeLabel));
  return headers.flatMap((header, index) =>
    normalizedCandidates.has(normalizeLabel(header)) ? [index] : [],
  );
}

function valueAt(row, headers, candidates, occurrence = 0) {
  const indexes = indexesFor(headers, candidates);
  const index = indexes[occurrence];
  return index === undefined ? "" : String(row[index] ?? "").trim();
}

function firstValue(row, headers, candidates) {
  for (const candidate of candidates) {
    const value = valueAt(row, headers, [candidate]);
    if (value) return value;
  }
  return "";
}

function toCount(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return new Date(direct);

  const brazilian = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!brazilian) return null;
  const [, day, month, year, hour = "0", minute = "0", second = "0"] = brazilian;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) + 3, Number(minute), Number(second)),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function detectSchema(headers) {
  const labels = new Set(headers.map(normalizeLabel));
  if (labels.has("lgpdbase") && labels.has("brevomessageid")) return "enriched-leads";
  if (labels.has("statusdocontatodemarketing")) return "site-crm-export";
  if (labels.has("iddoregistrocontact") && labels.has("email")) return "hubspot-segment";
  throw new Error("Schema CSV não reconhecido; importação bloqueada por segurança.");
}

function sourceRecord(row, headers, schema) {
  const email = normalizeEmail(firstValue(row, headers, ["E-mail", "email"]));
  const firstName = firstValue(row, headers, ["Nome", "nome"]);
  const lastName = firstValue(row, headers, ["Sobrenome"]);
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  const phone = normalizePhone(firstValue(row, headers, ["Número de telefone", "telefone"]));
  const organization = firstValue(row, headers, ["empresa", "Nome da empresa", "Associated Company"]);
  const role = firstValue(row, headers, ["cargo", "Cargo"]);
  const sector = firstValue(row, headers, ["setor", "Setor"]);
  const city = firstValue(row, headers, ["cidade", "Cidade"]);
  const legalBasis = firstValue(row, headers, ["lgpd_base"]);
  const emailStatus = normalizeLabel(firstValue(row, headers, ["email_status"]));
  const eventStatus = normalizeLabel(firstValue(row, headers, ["brevo_event_status"]));
  const stage = normalizeLabel(firstValue(row, headers, ["stage"]));
  const lastActivityRaw = firstValue(row, headers, [
    "last_reply_at",
    "reply_date",
    "brevo_last_event_at",
    "email_data",
    "Data da última atividade",
  ]);
  const lastActivityAt = parseTimestamp(lastActivityRaw);

  const providerEventCount = [
    "brevo_events_total",
    "brevo_delivered",
    "brevo_opened",
    "brevo_clicked",
    "brevo_soft_bounces",
    "brevo_hard_bounces",
    "brevo_blocked",
    "brevo_deferred",
    "brevo_invalid",
    "brevo_unsubscribed",
    "brevo_complaints",
    "reply_count",
  ].reduce((total, fieldName) => total + toCount(firstValue(row, headers, [fieldName])), 0);

  const hasProviderMessage = Boolean(firstValue(row, headers, ["brevo_message_id"]));
  const hasPriorInteraction =
    Boolean(lastActivityRaw) ||
    hasProviderMessage ||
    providerEventCount > 0 ||
    ["enviado", "bounce"].includes(emailStatus) ||
    ["contatado", "descadastrado"].includes(stage);

  const suppressions = new Set();
  if (emailStatus === "bounce" || eventStatus.includes("bounce")) suppressions.add("BOUNCE");
  if (stage === "descadastrado" || toCount(firstValue(row, headers, ["brevo_unsubscribed"])) > 0) {
    suppressions.add("UNSUBSCRIBED");
  }
  if (toCount(firstValue(row, headers, ["brevo_complaints"])) > 0) suppressions.add("COMPLAINT");
  if (toCount(firstValue(row, headers, ["brevo_invalid"])) > 0) suppressions.add("INVALID");

  let sourceEventType = null;
  if (toCount(firstValue(row, headers, ["brevo_unsubscribed"])) > 0) sourceEventType = "UNSUBSCRIBED";
  else if (toCount(firstValue(row, headers, ["brevo_complaints"])) > 0) sourceEventType = "COMPLAINED";
  else if (emailStatus === "bounce" || eventStatus.includes("bounce")) sourceEventType = "BOUNCED";
  else if (stage === "descadastrado") sourceEventType = "UNSUBSCRIBED";
  else if (emailStatus === "enviado" || hasProviderMessage) sourceEventType = "SENT";

  return {
    schema,
    email,
    name,
    phone,
    organization,
    role,
    sector,
    city,
    legalBasis,
    hasPriorInteraction,
    lastActivityRaw,
    lastActivityAt,
    sourceEventType,
    suppressions,
  };
}

function normalizedComparable(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function addValue(set, value) {
  const normalized = normalizedComparable(value);
  if (normalized) set.add(normalized);
}

function sortedCounts(counts) {
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function emptyEvidence() {
  return {
    explicit_legal_basis: 0,
    prior_source_interaction: 0,
    recent_source_interaction: 0,
    source_history_date_unknown: 0,
    source_suppression: 0,
  };
}

function countEvidence(target, entity, isRecent) {
  if (entity.legalBases.size > 0) target.explicit_legal_basis += 1;
  if (entity.hasPriorInteraction) target.prior_source_interaction += 1;
  if (entity.historyDateUnknown) target.source_history_date_unknown += 1;
  if (isRecent) target.recent_source_interaction += 1;
  if (entity.suppressions.size > 0) target.source_suppression += 1;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function schemaPriority(schema) {
  if (schema === "enriched-leads") return 0;
  if (schema === "site-crm-export") return 1;
  return 2;
}

function mapLegalBasis(value) {
  const normalized = normalizeLabel(value);
  if (!normalized) return null;
  if (normalized === "legitimointeresse" || normalized === "legitimateinterest") return "LEGITIMATE_INTEREST";
  if (normalized === "consentimento" || normalized === "consent") return "CONSENT";
  if (normalized === "contrato" || normalized === "contract") return "CONTRACT";
  return "OTHER";
}

/**
 * Builds the private in-memory payload used by the controlled Supabase RPC.
 * Callers must never log or persist the returned candidates outside the CRM.
 */
export function buildContactImportCandidates({ sources }) {
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("Informe ao menos um CSV.");
  const canonical = new Map();
  let sourceRows = 0;
  let invalidEmailRows = 0;

  for (const source of sources) {
    const parsed = parseCsv(source.text);
    const schema = detectSchema(parsed.headers);
    sourceRows += parsed.rows.length;
    for (const row of parsed.rows) {
      const record = sourceRecord(row, parsed.headers, schema);
      if (!record.email) {
        invalidEmailRows += 1;
        continue;
      }
      const records = canonical.get(record.email) ?? [];
      records.push({ ...record, sourceName: source.name });
      canonical.set(record.email, records);
    }
  }

  const candidates = [];
  let blockedNameConflicts = 0;
  let blockedInvalidProviderAddresses = 0;
  let organizationConflicts = 0;
  let phoneConflicts = 0;

  for (const [email, records] of canonical) {
    const ordered = [...records].sort((left, right) => {
      const priority = schemaPriority(left.schema) - schemaPriority(right.schema);
      return priority || left.sourceName.localeCompare(right.sourceName);
    });
    const names = new Set(records.map((record) => normalizedComparable(record.name)).filter(Boolean));
    const organizations = new Set(
      records.map((record) => normalizedComparable(record.organization)).filter(Boolean),
    );
    const phones = new Set(records.map((record) => record.phone).filter(Boolean));
    if (records.some((record) => record.suppressions.has("INVALID"))) {
      blockedInvalidProviderAddresses += 1;
      continue;
    }
    if (names.size > 1) {
      blockedNameConflicts += 1;
      continue;
    }
    if (organizations.size > 1) organizationConflicts += 1;
    if (phones.size > 1) phoneConflicts += 1;

    const name = ordered.find((record) => record.name)?.name ?? "";
    if (!name) {
      blockedNameConflicts += 1;
      continue;
    }
    const phone = phones.size === 1 ? ordered.find((record) => record.phone)?.phone ?? null : null;
    const organization =
      organizations.size === 1
        ? ordered.find((record) => record.organization)?.organization ?? null
        : null;
    const lastActivities = records
      .map((record) => record.lastActivityAt)
      .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
    const latestActivity = lastActivities.length
      ? new Date(Math.max(...lastActivities.map((value) => value.getTime())))
      : null;
    const eventRecord = ordered.find((record) => record.sourceEventType);
    const legalBasis = ordered.map((record) => mapLegalBasis(record.legalBasis)).find(Boolean) ?? null;

    candidates.push({
      sourceKey: sha256(`contact-import-v1:${email}`),
      name,
      email,
      phone,
      organization,
      hasSourceHistory: records.some((record) => record.hasPriorInteraction),
      sourceLastActivityAt: latestActivity?.toISOString() ?? null,
      sourceEventType: eventRecord?.sourceEventType ?? null,
      sourceEventAt: eventRecord?.lastActivityAt?.toISOString() ?? null,
      legalBasis,
    });
  }

  const fileSetDigest = sha256(
    `contact-import-v1\n${sources
      .map((source) => `${source.name}:${sha256(source.text)}`)
      .sort()
      .join("\n")}`,
  );
  return {
    candidates,
    fileSetDigest,
    sourceRows,
    stats: {
      canonical_records: canonical.size,
      candidates_ready: candidates.length,
      blocked_name_conflicts: blockedNameConflicts,
      blocked_invalid_provider_addresses: blockedInvalidProviderAddresses,
      organization_conflicts_omitted: organizationConflicts,
      phone_conflicts_omitted: phoneConflicts,
      invalid_email_rows: invalidEmailRows,
    },
  };
}

export function buildContactImportPlan({ sources, crmSourceName, referenceDate, inactiveDays = DEFAULT_INACTIVE_DAYS }) {
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("Informe ao menos um CSV.");
  const now = new Date(referenceDate ?? new Date());
  if (Number.isNaN(now.getTime())) throw new Error("Data de referência inválida.");
  if (!Number.isInteger(inactiveDays) || inactiveDays < 1 || inactiveDays > 365) {
    throw new Error("inactiveDays deve ser um inteiro entre 1 e 365.");
  }
  const recentThreshold = new Date(now.getTime() - inactiveDays * 86_400_000);
  const canonical = new Map();
  const sourceSummaries = [];
  const crmEmails = new Set();
  let rowsTotal = 0;
  let validEmailRowsTotal = 0;

  for (const source of sources) {
    const parsed = parseCsv(source.text);
    const schema = detectSchema(parsed.headers);
    const seenEmails = new Set();
    let validEmailRows = 0;
    let invalidEmailRows = 0;

    for (const row of parsed.rows) {
      rowsTotal += 1;
      const record = sourceRecord(row, parsed.headers, schema);
      if (!record.email) {
        invalidEmailRows += 1;
        continue;
      }
      validEmailRows += 1;
      validEmailRowsTotal += 1;
      seenEmails.add(record.email);
      if (source.name === crmSourceName) crmEmails.add(record.email);

      const entity = canonical.get(record.email) ?? {
        sources: new Set(),
        names: new Set(),
        phones: new Set(),
        organizations: new Set(),
        legalBases: new Set(),
        hasPriorInteraction: false,
        historyDateUnknown: false,
        latestActivityAt: null,
        suppressions: new Set(),
      };
      entity.sources.add(source.name);
      addValue(entity.names, record.name);
      addValue(entity.phones, record.phone);
      addValue(entity.organizations, record.organization);
      addValue(entity.legalBases, record.legalBasis);
      entity.hasPriorInteraction ||= record.hasPriorInteraction;
      entity.historyDateUnknown ||= record.hasPriorInteraction && !record.lastActivityAt;
      if (record.lastActivityAt && (!entity.latestActivityAt || record.lastActivityAt > entity.latestActivityAt)) {
        entity.latestActivityAt = record.lastActivityAt;
      }
      for (const suppression of record.suppressions) entity.suppressions.add(suppression);
      canonical.set(record.email, entity);
    }

    sourceSummaries.push({
      file: source.name,
      schema,
      rows: parsed.rows.length,
      valid_email_rows: validEmailRows,
      invalid_email_rows: invalidEmailRows,
      distinct_emails: seenEmails.size,
      duplicate_rows_by_email: validEmailRows - seenEmails.size,
    });
  }

  const decisions = new Map();
  const newRecordDecisions = new Map();
  const evidence = emptyEvidence();
  const newRecordEvidence = emptyEvidence();
  const conflicts = { name: 0, phone: 0, organization: 0 };
  let existingInCrm = 0;

  for (const [email, entity] of canonical) {
    const isNewRecord = !crmEmails.has(email);
    if (!isNewRecord) existingInCrm += 1;
    const isRecent = Boolean(entity.latestActivityAt && entity.latestActivityAt >= recentThreshold);
    countEvidence(evidence, entity, isRecent);
    if (isNewRecord) countEvidence(newRecordEvidence, entity, isRecent);
    if (entity.names.size > 1) conflicts.name += 1;
    if (entity.phones.size > 1) conflicts.phone += 1;
    if (entity.organizations.size > 1) conflicts.organization += 1;

    let reason = "REQUIRES_CRM_HISTORY_CHECK";
    if (entity.legalBases.size === 0) reason = "MISSING_CONTACT_PERMISSION";
    else if (entity.suppressions.size > 0) reason = "SUPPRESSED_SOURCE_EVIDENCE";
    else if (isRecent) reason = "RECENT_SOURCE_INTERACTION";
    else if (entity.historyDateUnknown) reason = "SOURCE_HISTORY_DATE_UNKNOWN";
    decisions.set(reason, (decisions.get(reason) ?? 0) + 1);
    if (isNewRecord) newRecordDecisions.set(reason, (newRecordDecisions.get(reason) ?? 0) + 1);
  }

  return {
    mode: "READ_ONLY_IMPORT_PLAN",
    classification: CLASSIFICATION,
    reference_date: now.toISOString(),
    inactivity_window_days: inactiveDays,
    source_files: sourceSummaries,
    totals: {
      rows: rowsTotal,
      canonical_records_by_exact_email: canonical.size,
      rows_collapsed_by_exact_email: validEmailRowsTotal - canonical.size,
      existing_in_crm_snapshot: existingInCrm,
      new_vs_crm_snapshot: canonical.size - existingInCrm,
    },
    evidence,
    new_vs_crm_evidence: newRecordEvidence,
    conflicts_requiring_review: conflicts,
    preliminary_reason_codes: sortedCounts(decisions),
    new_vs_crm_reason_codes: sortedCounts(newRecordDecisions),
    safeguards: {
      writes_performed: 0,
      external_messages_sent: 0,
      contacts_authorized_for_send: 0,
      next_gate: "Comparar cada registro com o CRM/event store e aplicar a política fail-closed antes de importar ou reativar.",
    },
  };
}

function parseArgs(argv) {
  const files = [];
  let crmFile = null;
  let referenceDate = null;
  let inactiveDays = DEFAULT_INACTIVE_DAYS;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--crm-file") crmFile = argv[++index];
    else if (arg === "--reference-date") referenceDate = argv[++index];
    else if (arg === "--inactive-days") inactiveDays = Number.parseInt(argv[++index], 10);
    else if (arg.startsWith("--")) throw new Error(`Opção desconhecida: ${arg}`);
    else files.push(arg);
  }
  if (!crmFile) throw new Error("Informe --crm-file com a exportação atual do CRM.");
  return { files: [...new Set([crmFile, ...files])], crmFile, referenceDate, inactiveDays };
}

function loadSource(filePath) {
  const absolutePath = resolve(filePath);
  const stat = statSync(absolutePath);
  if (!stat.isFile()) throw new Error(`Entrada não é arquivo: ${basename(filePath)}`);
  if (stat.size > MAX_INPUT_BYTES) throw new Error(`CSV excede 20 MiB: ${basename(filePath)}`);
  return { name: basename(absolutePath), text: readFileSync(absolutePath, "utf8") };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const sources = options.files.map(loadSource);
    const report = buildContactImportPlan({
      sources,
      crmSourceName: basename(resolve(options.crmFile)),
      referenceDate: options.referenceDate,
      inactiveDays: options.inactiveDays,
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : "Falha desconhecida."}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
