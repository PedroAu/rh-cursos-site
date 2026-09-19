#!/usr/bin/env bash

set -euo pipefail

profile_name="${AWS_PROFILE:-rhcursos-email-deployer}"
region_name="${AWS_REGION:-sa-east-1}"
secret_name="${IMAP_SECRET_NAME:-rhcursos/email/imap-collector}"
imap_user="${IMAP_USER:-pedro@rhcursos.com.br}"
imap_host="${IMAP_HOST:-email-ssl.com.br}"
endpoint_url="${CRM_IMAP_ENDPOINT:-https://www.rhcursos.com.br/api/internal/email/imap-events}"
keychain_service="aws-rhcursos-imap-webhook-secret"

for required_command in aws jq node openssl security; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'Comando obrigatorio ausente: %s\n' "$required_command" >&2
    exit 1
  fi
done

printf 'Senha da caixa %s (a digitacao ficara oculta): ' "$imap_user"
IFS= read -r -s imap_password
printf '\n'

if [[ -z "$imap_password" ]]; then
  printf 'A senha nao pode ficar vazia.\n' >&2
  exit 1
fi

cleanup() {
  unset imap_password webhook_secret secret_json
}
trap cleanup EXIT

printf 'Validando autenticacao IMAPS com TLS...\n'
IMAP_PASSWORD="$imap_password" IMAP_USER="$imap_user" IMAP_HOST="$imap_host" node --input-type=module <<'NODE'
import { ImapFlow } from "imapflow";

const client = new ImapFlow({
  host: process.env.IMAP_HOST,
  port: 993,
  secure: true,
  auth: {
    user: process.env.IMAP_USER,
    pass: process.env.IMAP_PASSWORD,
  },
  logger: false,
  tls: {
    rejectUnauthorized: true,
    servername: process.env.IMAP_HOST,
  },
});

try {
  await client.connect();
  await client.logout();
} catch {
  process.stderr.write("Falha ao autenticar na caixa Locaweb. O segredo nao foi criado.\n");
  process.exit(1);
}
NODE

printf 'Autenticacao IMAPS confirmada.\n'
webhook_secret="$(openssl rand -hex 32)"

secret_json="$(jq -cn \
  --arg host "$imap_host" \
  --arg user "$imap_user" \
  --arg password "$imap_password" \
  --arg endpointUrl "$endpoint_url" \
  --arg webhookSecret "$webhook_secret" \
  '{
    host: $host,
    port: 993,
    secure: true,
    user: $user,
    password: $password,
    endpointUrl: $endpointUrl,
    webhookSecret: $webhookSecret,
    rejectUnauthorized: true
  }')"

if aws secretsmanager describe-secret \
  --profile "$profile_name" \
  --region "$region_name" \
  --secret-id "$secret_name" >/dev/null 2>&1; then
  printf '%s' "$secret_json" | aws secretsmanager put-secret-value \
    --profile "$profile_name" \
    --region "$region_name" \
    --secret-id "$secret_name" \
    --secret-string file:///dev/stdin \
    --query '[ARN,Name]' \
    --output text
else
  printf '%s' "$secret_json" | aws secretsmanager create-secret \
    --profile "$profile_name" \
    --region "$region_name" \
    --name "$secret_name" \
    --description 'Credenciais IMAPS Locaweb e autenticacao do receptor CRM' \
    --tags Key=Project,Value=rhcursos-email Key=ManagedBy,Value=codex \
    --secret-string file:///dev/stdin \
    --query '[ARN,Name]' \
    --output text
fi

security add-generic-password \
  -U \
  -a rhcursos-email \
  -s "$keychain_service" \
  -l 'RH Cursos - segredo do webhook IMAP' \
  -w "$webhook_secret" >/dev/null

printf 'Segredo criado e webhookSecret guardado no Chaves do macOS.\n'
