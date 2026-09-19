import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targetRef = process.argv[2]?.trim();
const targetEnvPath = resolve(".env.e2e.local");
const baseEnvPath = resolve(".env.local");

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function projectRefFromUrl(value) {
  try {
    const match = new URL(value).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function readEnvValue(source, key) {
  return source.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";
}

function upsert(source, key, value) {
  const line = `${key}=${value}`;
  const expression = new RegExp(`^${key}=.*$`, "m");
  return expression.test(source)
    ? source.replace(expression, line)
    : `${source.trimEnd()}\n${line}\n`;
}

if (!/^[a-z0-9]{20}$/i.test(targetRef ?? "")) {
  fail("Informe o project ref do Supabase de teste: npm run e2e:configure-supabase -- <project-ref>.");
}

if (!existsSync(baseEnvPath)) {
  fail(".env.local não encontrado; ele é necessário para preservar os segredos locais de sessão.");
}

const baseEnv = readFileSync(baseEnvPath, "utf8");
const productionRef = projectRefFromUrl(readEnvValue(baseEnv, "NEXT_PUBLIC_SUPABASE_URL"));

if (!productionRef) {
  fail("NEXT_PUBLIC_SUPABASE_URL em .env.local não identifica um projeto Supabase válido.");
}

if (productionRef === targetRef) {
  fail("O projeto de teste não pode ser o mesmo projeto configurado atualmente em .env.local.");
}

const keyResult = spawnSync(
  "supabase",
  ["projects", "api-keys", "--project-ref", targetRef, "--reveal", "--output", "json"],
  { encoding: "utf8", timeout: 60_000 },
);

if (keyResult.error?.code === "ETIMEDOUT") {
  fail("A leitura das chaves do Supabase expirou; confirme a conectividade e execute novamente.");
}

if (keyResult.status !== 0) {
  fail("Não foi possível obter as chaves do projeto de teste pela CLI autenticada.");
}

let keys;
try {
  keys = JSON.parse(keyResult.stdout);
} catch {
  fail("A CLI retornou uma resposta de chaves inválida.");
}

const valueOf = (key) => key?.api_key ?? key?.key ?? "";
const publishableKey =
  valueOf(keys.find((key) => key.type === "publishable")) ||
  valueOf(keys.find((key) => key.name === "anon"));
const serviceRoleKey =
  valueOf(keys.find((key) => key.type === "secret")) ||
  valueOf(keys.find((key) => key.name === "service_role"));

if (!publishableKey || !serviceRoleKey) {
  fail("O projeto de teste não expôs uma chave publicável e uma chave de serviço utilizáveis.");
}

const targetUrl = `https://${targetRef}.supabase.co`;
const existing = existsSync(targetEnvPath) ? readFileSync(targetEnvPath, "utf8") : "";
const values = {
  NEXT_PUBLIC_SUPABASE_URL: targetUrl,
  SUPABASE_URL: targetUrl,
  NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL: `${targetUrl}/functions/v1`,
  SUPABASE_FUNCTIONS_URL: `${targetUrl}/functions/v1`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  E2E_ALLOW_DATABASE_WRITES: "1",
  E2E_TARGET_KIND: "isolated-test",
  E2E_LOCAL_SUPABASE: "0",
  E2E_SUPABASE_PROJECT_REF: targetRef,
  E2E_PRODUCTION_PROJECT_REF: productionRef,
};

const configured = Object.entries(values).reduce(
  (source, [key, value]) => upsert(source, key, value),
  existing,
);

writeFileSync(targetEnvPath, configured, { encoding: "utf8", mode: 0o600 });
// `mode` só é aplicado na criação; reafirma a permissão ao sobrescrever um
// arquivo que já pudesse existir com uma máscara mais permissiva.
chmodSync(targetEnvPath, 0o600);
console.log(`✅ Ambiente E2E isolado configurado para ${targetUrl}.`);
console.log("As credenciais ficaram apenas em .env.e2e.local (ignorado pelo Git).");
