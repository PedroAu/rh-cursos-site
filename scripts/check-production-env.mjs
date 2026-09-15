#!/usr/bin/env node

const REQUIRED_VARS = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    description: "URL pública do projeto Supabase",
    validate(value) {
      return isHttpsOrigin(value);
    }
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    description: "Anon/publishable key do Supabase",
    validate(value) {
      return value.length >= 20;
    }
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    description: "URL pública do app",
    validate(value) {
      return isProductionAppOrigin(value);
    }
  },
  {
    name: "AUTH_SESSION_SECRET",
    description: "Segredo de sessão",
    validate(value) {
      return value.length >= 32;
    }
  }
];

const PLACEHOLDER_PATTERNS = [
  /example\.supabase\.co/i,
  /your-project-ref/i,
  /your-secure-password/i,
  /your-32-char-secret-key-here/i,
  /replace-with/i,
  /example(?:\.|-|_)/i,
  /dummy/i,
  /fake/i,
  /placeholder/i,
  /change-me/i,
  /seu-projeto/i,
  /seu-segredo/i
];

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function parseOrigin(value) {
  try {
    const url = new URL(value);

    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function isHttpsOrigin(value) {
  const url = parseOrigin(value);
  return url?.protocol === "https:";
}

function isProductionAppOrigin(value) {
  const url = parseOrigin(value);

  if (!url) return false;

  const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return url.protocol === "https:" || (url.protocol === "http:" && isLocalHost);
}

const issues = [];

for (const entry of REQUIRED_VARS) {
  const value = (process.env[entry.name] ?? "").trim();

  if (!value) {
    issues.push(`- ${entry.name}: ausente (${entry.description})`);
    continue;
  }

  if (isPlaceholder(value) || !entry.validate(value)) {
    issues.push(`- ${entry.name}: valor inválido ou placeholder (${entry.description})`);
  }
}

if (issues.length > 0) {
  fail([
    "Configuração de produção incompleta. Defina as variáveis abaixo no deploy frontend:",
    ...issues,
    "",
    "Corrija os secrets/variáveis no GitHub Actions ou no provedor do Worker e tente novamente."
  ].join("\n"));
}

console.log("✅ Ambiente de produção validado: Supabase e auth estão configurados.");
