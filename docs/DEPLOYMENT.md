# Deployment — Guia de publicação

Como fazer deploy do site-rh-cursos em produção no Cloudflare Workers.

## Visão geral

O projeto é publicado em **Cloudflare Workers** via `@opennextjs/cloudflare`:

- **Frontend:** Next.js compilado para Workers (suporta SSR e Edge Functions)
- **Backend:** Supabase Edge Functions (auth, dados, webhooks)
- **Banco:** Postgres gerenciado no Supabase
- **Domínio:** rhcursos.com.br (apex redireciona para www)

## Pré-requisitos para deploy

Antes de fazer deploy, você precisa de:

1. **Acesso Cloudflare Workers**
   - Conta Cloudflare ativa
   - Domínio (rhcursos.com.br) na zona Cloudflare
   - API token e account ID

2. **Acesso Supabase**
   - Projeto Supabase em produção
   - Service role key

3. **Git & GitHub**
   - Repositório em GitHub com acesso write
   - GitHub secrets configurados (ver seção abaixo)

## Setup local (antes de fazer deploy)

### 1. Valide o build localmente

```bash
# Instale as dependências
npm install

# Build para Cloudflare Workers
npm run build:workers
```

Se houver erros, corrija-os antes de continuar.

### 2. Teste o bundle localmente (opcional)

```bash
# Preview local do bundle
npm run preview:workers
```

Acesse http://localhost:8787 — você verá o site como ele aparecerá em produção.

### 3. Defina variáveis de ambiente local

Crie um `.env.production.local` (nunca commite):

```bash
# Supabase Production
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto-prod.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-prod-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-prod-service-role-key

# App URL
NEXT_PUBLIC_APP_URL=https://www.rhcursos.com.br

# Auth session (SEMPRE regenere em produção!)
AUTH_SESSION_SECRET=seu-novo-segredo-de-32-caracteres-aleatorio

# GA4 (opcional)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

## Deploy via GitHub Actions

O deploy automático é acionado por `push` em `main` (ou manualmente).

### 1. Configure GitHub secrets

No repositório GitHub, vá em **Settings** → **Secrets and variables** → **Actions** e adicione:

#### Frontend (Cloudflare Workers)

| Secret | Descrição | Onde obter |
|--------|-----------|-----------|
| `CLOUDFLARE_API_TOKEN` | Token API do Cloudflare | Cloudflare Dashboard → My Profile → API Tokens → Create Token |
| `CLOUDFLARE_ACCOUNT_ID` | ID da sua conta Cloudflare | Cloudflare Dashboard → Workers → canto superior direito |
| `AUTH_SESSION_SECRET` | Chave de sessão (32 chars min) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase de produção | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon key Supabase | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_APP_URL` | URL pública (https://www.rhcursos.com.br) | Você define |

Antes de publicar o frontend, rode `npm run env:check:production` para barrar deploy com secret ausente ou placeholder.

#### Secrets do runtime do Cloudflare Worker

Além dos secrets do GitHub Actions, o Worker `site-rh-cursos` precisa manter estes
secrets diretamente no Cloudflare:

| Secret | Uso |
|--------|-----|
| `SUPABASE_SERVICE_ROLE_KEY` | BFF e receptores server-side protegidos |
| `ASAAS_API_KEY` | Criação de cobranças no Asaas |
| `ASAAS_WEBHOOK_TOKEN` | Autenticação do webhook Asaas |
| `IMAP_EVENTS_WEBHOOK_SECRET` | Autenticação do coletor de respostas Locaweb |
| `SES_EVENTS_WEBHOOK_SECRET` | Autenticação dos eventos do Amazon SES |
| `EMAIL_UNSUBSCRIBE_SECRET` | Assinatura e validação do descadastro |

Valide os nomes presentes antes de qualquer publicação. O comando não lê nem
exibe valores:

```bash
npm run check:workers:secrets
```

O workflow de frontend executa esse gate antes do build/deploy e falha de forma
segura quando um nome obrigatório está ausente. `AUTH_SESSION_SECRET` é legado e
não integra essa lista porque não possui consumidor no runtime atual.

#### Edge Functions (Supabase)

| Secret | Descrição |
|--------|-----------|
| `SUPABASE_ACCESS_TOKEN` | Token de acesso Supabase (GitHub CLI: `gh secret set SUPABASE_ACCESS_TOKEN`) |
| `SUPABASE_PROJECT_REF` | Referência do projeto (ex: `abc123def456`) |
| `AUTH_SESSION_SECRET` | Mesmo da seção acima |
| `NEXT_PUBLIC_APP_URL` | Mesmo da seção acima |

### 2. Configure Cloudflare Workers

Na zona DNS do Cloudflare (rhcursos.com.br):

1. Vá em **Workers Routes**
2. Crie uma rota: `https://www.rhcursos.com.br/*` → seu worker
3. Crie uma rota: `https://rhcursos.com.br/*` → seu worker
4. Desabilite **Workers.dev** (reduz superfície pública)

### 3. Faça push para main e acompanhe o deploy

```bash
# Commit e push
git add .
git commit -m "feat: seu-feature"
git push origin seu-branch

# Crie pull request → merge para main
# O GitHub Actions rodará automaticamente:
# 1. npm install
# 2. npm run deploy:workers
# 3. npm run verify:workers
```

Verifique o status em **Actions** no GitHub.

## Verificação pós-deploy

Após o deploy completar:

```bash
# Rodado automaticamente no CI
npm run verify:workers
```

O script valida:
- Homepage em https://www.rhcursos.com.br/ retorna 200
- Apex https://rhcursos.com.br/ redireciona para www
- `/admin/` está protegido (retorna 303 para login)
- Headers de segurança estão presentes (CSP, HSTS, etc)

Se falhar, veja a seção **Troubleshooting** abaixo.

## Deploy manual (emergência)

Se o CI falhar e você precisar fazer deploy manual:

```bash
# Instale o Wrangler globalmente (se não tiver)
npm install -g wrangler

# Valide credenciais Cloudflare
wrangler whoami

# Valide os secrets obrigatórios já configurados no Worker
npm run check:workers:secrets

# Build e deploy
npm run build:workers
npx wrangler deploy

# Verifique
npm run verify:workers
```

> **Cuidado:** deploy manual não cria git tags. Mantenha o histórico no GitHub sincronizado.

## Rollback

Se algo deu muito errado:

### Via Cloudflare Dashboard (5 min)

1. Vá para **Workers & Pages** → seu worker
2. Clique em **Deployments**
3. Selecione o deployment anterior e clique **Rollback**

### Via CLI

```bash
# Liste deployments
wrangler deployments list

# Reverta para um deployment anterior
wrangler rollback --message "Rollback to previous version"
```

## Edge Functions (Supabase)

As Edge Functions (auth-session, enrollments, leads, admin-resources) são deployadas via GitHub Actions ao push em main.

Se precisar fazer deploy manual:

```bash
# Valide que você tem as credenciais
export SUPABASE_ACCESS_TOKEN=seu-token
export SUPABASE_PROJECT_REF=seu-projeto

# Deploy
supabase functions deploy
```

Credenciais para `SUPABASE_ACCESS_TOKEN`:
1. Supabase Dashboard → Account settings → Access Tokens
2. Gere um novo token com escopo `functions:deploy`

## Variáveis de ambiente em produção

### Cloudflare Workers

Configure no painel **Workers** do Cloudflare (não no GitHub secrets):

1. Workers & Pages → seu worker → Settings
2. **Environment variables** — defina:
   - `NODE_ENV=production`
   - Qualquer outra variável necessária

Variáveis `NEXT_PUBLIC_*` devem estar no `.env.production` ou no secrets do GitHub Actions.

### Supabase

Configure em **Supabase Dashboard** → **Project Settings** → **Secrets**:

- `AUTH_SESSION_SECRET`
- `NEXT_PUBLIC_APP_URL`

## Monitoramento

Após deploy:

### Cloudflare Analytics

- **Workers** → seu worker → **Analytics**
- Monitore CPU time, requests, erros HTTP

### Supabase Monitoring

- **Edge Functions** → selecione a function
- Veja logs, latência, erros

### Google Analytics 4

- Acesse [GA4 Dashboard](https://analytics.google.com)
- Verifique Real-time → Users ativos
- Confira que `NEXT_PUBLIC_GA_MEASUREMENT_ID` está sendo coletado

## Troubleshooting

### Deploy falha com "ENOENT: no such file or directory"

**Causa:** Arquivo faltando em `supabase/migrations/` ou `public/`.

**Solução:**
```bash
git status
git add -A
git commit -m "fix: ensure all files are tracked"
git push
```

### Cloudflare retorna "Service Unavailable (503)"

**Causa:** Variável de ambiente ausente ou incorreta.

**Solução:**
1. Verifique GitHub secrets estão corretos
2. Rode `npm run preview:workers` localmente para validar build
3. Confira que `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão definidos

### Login retorna "Auth unavailable"

**Causa:** Supabase não está acessível ou credenciais estão erradas.

**Solução:**
```bash
# Valide Supabase está online
curl https://seu-projeto.supabase.co/auth/v1/verify

# Verifique as credenciais em .env.local
# Redeploye com secrets corretos
```

### "Retry-After: 60" ao tentar login

**Causa:** Rate limiting por IP (proteção brute-force).

**Solução:** Aguarde 60 segundos e tente novamente. Limite é por IP do cliente.

## Checklist de deploy

- [ ] `npm run typecheck` passou
- [ ] `npm run lint` passou
- [ ] `npm run build` completou sem erros
- [ ] `npm run preview:workers` funciona em http://localhost:8787
- [ ] GitHub secrets configurados (ver tabela acima)
- [ ] `npm run check:workers:secrets` confirmou todos os secrets do runtime
- [ ] Cloudflare Workers routes estão corretas
- [ ] `.env.production.local` foi criado (nunca commite!)
- [ ] Push para `main` via pull request (com review)
- [ ] GitHub Actions deploy completou
- [ ] `npm run verify:workers` passou
- [ ] Homepage abre em https://www.rhcursos.com.br/
- [ ] Apex https://rhcursos.com.br/ redireciona para www
- [ ] `/admin/` requer login

## Detalhes técnicos de infraestrutura

### Workflow files

- **Frontend:** [`.github/workflows/deploy-frontend.yml`](.github/workflows/deploy-frontend.yml)
- **Edge Functions:** [`.github/workflows/deploy-functions.yml`](.github/workflows/deploy-functions.yml)

### Sequência de deploy (CI/CD)

Cada push em `main` dispara:
1. `npm ci`
2. `npm run check:workers:secrets` (gate fail-closed de configuração)
3. `npm run deploy:workers -- --keep-vars` (frontend)
4. `npm run verify:workers` (validação pós-deploy)
5. `supabase functions deploy` (edge functions)

### Configuração do Worker (wrangler.jsonc)

- **Worker name:** definido em `wrangler.jsonc`
- **Routes:** `www.rhcursos.com.br/*` e `rhcursos.com.br/*`
- **Deploy command:** `npm run deploy:workers -- --keep-vars`
- **Runtime:** Cloudflare Workers com `nodejs_compat`
- **Node.js:** versão 24
- `--keep-vars` preserva variáveis de runtime configuradas no painel da Cloudflare (não são apagadas pelo pipeline)

### Configurações de produção

- **Apex redirect:** `rhcursos.com.br` → `www.rhcursos.com.br` (aplicado pelo app, não por Redirect Rules)
- **Workers.dev desabilitado:** reduz superfície pública
- **Legado removido:** projeto antigo do Cloudflare Pages foi removido; tráfego agora entra só pelo Worker
- **Headers de segurança:** `CSP`, `HSTS`, `X-Frame-Options` aplicados via `middleware.ts`
- **Post-deploy validation:** automatizada via `scripts/verify-workers-deploy.js` (valida homepage, redirect, proteção do `/admin/`, headers)

### Adapter e binding

- **Empacotamento:** `@opennextjs/cloudflare` adapter
- **Binding de assets:** gerado em `.open-next/` e referenciado em `wrangler.jsonc`

### Fallbacks

- `public/_headers` — apenas documental para assets estáticos
- `public/_redirects` — não participa do deploy em Workers

## Dúvidas?

- **Cloudflare Workers:** Leia a [documentação oficial](https://developers.cloudflare.com/workers/)
- **Supabase Edge Functions:** Veja [Supabase Docs](https://supabase.com/docs/guides/functions)
- **Next.js em Edge:** Consulte [@opennextjs/cloudflare](https://github.com/opennextjs/opennextjs-cloudflare)
