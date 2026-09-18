# Story: Orquestrador seguro de reativação por e-mail e alertas Telegram

## Status

Ready for Review

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools:
  - vitest
  - playwright
  - supabase-db-tests
  - lint
  - typecheck
  - build
  - aws-sam-validation
  - security-review
```

## Tracking

> ⚠️ **ClickUp não sincronizado:** a integração ClickUp não está disponível nesta sessão. A história foi criada localmente sem bloquear o desenvolvimento.

## Origem e rastreabilidade

| ID | Requisito | Origem |
|---|---|---|
| USR-01 | Reativar automaticamente contatos elegíveis por e-mail. | Decisão do usuário durante a configuração do time de vendas |
| USR-02 | Usar Amazon SES; a conta Locaweb permanece como caixa corporativa/IMAP. | Decisão do usuário durante a configuração do time de vendas |
| USR-03 | Executar três contatos nos dias 0, 5 e 10 e interromper em resposta, bounce, reclamação ou descadastro. | Decisão do usuário e story anterior da timeline |
| USR-04 | Encaminhar respostas e alertas relevantes para o Telegram privado `@rhcursos_bot`. | Decisão do usuário durante a configuração do time de vendas |
| USR-05 | Operar sobre o CRM próprio e preservar a linha do tempo auditável. | Decisão do usuário e arquitetura aprovada |
| USR-06 | Público nacional, base estimada entre 2 mil e 4 mil contatos e foco comercial nos três cursos informados. | Decisão do usuário durante a configuração do time de vendas |
| ARC-01 | Um orquestrador controla o processo; agentes não chamam canais sem policy gate. | `docs/architecture/sales-agent-revenue-operating-system.md#19-decisões-arquiteturais-recomendadas` |
| ARC-02 | Toda ação externa é idempotente, versionada e atribuível, com orçamento, limites e kill switch. | `docs/architecture/sales-agent-revenue-operating-system.md#12-human-in-the-loop-segurança-e-governança` |

## Story

**As a** responsável pela operação comercial da RH Cursos,
**I want** que um orquestrador seguro selecione contatos elegíveis, execute a cadência aprovada por Amazon SES e encaminhe respostas/alertas ao Telegram privado,
**so that** a reativação aconteça automaticamente, sem perder rastreabilidade, consentimento, limites de volume ou capacidade de interrupção humana.

## Contexto

- A story anterior implantou o event store, a timeline administrativa, ingestão de eventos SES, descadastro e coleta de respostas Locaweb via IMAP.
- Ainda não existe processo que crie cadências, selecione passos vencidos, envie e-mails, registre a mensagem enviada ou notifique o responsável no Telegram.
- A base contém contatos de origens e perfis diferentes; classificação como “Gestão de Pessoas” não equivale a consentimento. O motor só pode selecionar registros com elegibilidade comprovada e nunca deve inferir permissão.
- A campanha referencia somente: `Curso Prático de Atualização do eSocial: Novo Leiaute 1.3 para Órgãos Públicos`, `Auditoria da Folha de Pagamento` e `Inteligência Artificial na Execução Orçamentária`.
- O endereço corporativo informado é `pedro@rhcursos.com.br`; identidade de remetente e reply-to devem ser verificadas antes da ativação.
- A automação nasce desativada. Construir, testar ou implantar não autoriza o primeiro disparo; habilitação produtiva e volume inicial exigem aprovação humana explícita.

## Acceptance Criteria

1. **Política de elegibilidade fail-closed:** somente lead ativo, com e-mail válido, finalidade/base legal registradas, consentimento ou outra elegibilidade comercial aprovada, sem supressão e sem interação recente impeditiva pode entrar em reativação. Registro ausente, contraditório ou ambíguo é rejeitado com reason code auditável. Classificação temática não substitui consentimento. (USR-01, USR-05, ARC-01, ARC-02)
2. **Cadastro e versionamento da campanha:** existe uma campanha `reactivation-v1` desativada por padrão, vinculada exclusivamente aos três cursos nomeados no Contexto, com template/versionamento, remetente e reply-to `pedro@rhcursos.com.br`, assunto/corpo aprovados e três passos imutáveis nos dias 0, 5 e 10. Alterar conteúdo, público ou cadência cria nova versão; não reescreve execuções anteriores. (USR-02, USR-03, USR-06, ARC-02)
3. **Criação idempotente de sequências:** o orquestrador cria no máximo uma sequência ativa por lead/campanha, materializa os três passos e registra decisão, policy version, reason codes e correlation ID. Reexecução, concorrência ou retry não duplica sequência ou passo. (USR-01, USR-03, USR-05, ARC-02)
4. **Claim concorrente e revalidação antes do envio:** cada passo vencido é reivindicado atomicamente por um único worker, possui lease/timeout recuperável e é revalidado imediatamente antes da ação externa. Supressão, resposta, bounce, reclamação, descadastro, kill switch ou limite excedido impedem o envio. (USR-03, ARC-01, ARC-02)
5. **Envio SES idempotente:** cada tentativa usa chave idempotente estável, tags `lead_id`, `sequence_id`, `sequence_step_id`, `campaign_id` e versão, remetente/reply-to aprovados e configuração de eventos existente. Sucesso registra `lead_email_message`, marca o passo `SENT` e gera interação `SENT`; retry não envia novamente quando a confirmação já existe. Falha transitória volta à fila com backoff limitado; falha permanente encerra/escalona sem loop infinito. (USR-02, USR-03, USR-05, ARC-02)
6. **Interrupção e supressão prevalecem:** `REPLIED`, `BOUNCED`, `COMPLAINED` ou `UNSUBSCRIBED` interrompem a sequência e cancelam os passos futuros antes de nova execução. O worker nunca reativa automaticamente uma sequência interrompida nem remove supressão. (USR-03, USR-05)
7. **Limites e kill switches:** existem controles por organização, campanha e dia, limite de lote, janela de horário em `America/Sao_Paulo`, taxa máxima por execução, configuração dry-run e kill switch global/campanha. O supervisor pode pausar ou reduzir volume, mas ativação e aumento material exigem aprovação humana. (USR-01, USR-06, ARC-01, ARC-02)
8. **Telegram privado e seguro:** respostas correlacionadas, eventos terminais, falhas permanentes e violação de guardrail geram alerta idempotente ao chat privado configurado. A mensagem contém apenas identificação operacional mínima, link seguro para o CRM, tipo/instante e resumo sanitizado; nunca inclui credenciais, corpo integral do e-mail ou PII desnecessária. Falha do Telegram não desfaz o evento comercial e entra em retry/DLQ. (USR-04, USR-05, ARC-02)
9. **Supervisor e estado operacional via CLI/API:** comandos server-side permitem `status`, `dry-run`, `pause`, `resume` e execução de lote com autenticação forte e auditoria. O status mostra campanha/versão, limites, passos pendentes, enviados, interrompidos, falhas e última execução. A UI, se adicionada, apenas observa ou invoca o mesmo contrato protegido. (ARC-01, ARC-02)
10. **Métricas iniciais do Analyst:** a projeção reporta contatos elegíveis/rejeitados por reason code, enviados por passo, entrega, abertura, clique, resposta, resposta positiva quando classificada, bounce, reclamação, descadastro, sequência interrompida, falha de ferramenta e custo estimado. Métricas preservam coorte, campanha, versão e período; não declaram causalidade. (USR-05, ARC-02)
11. **Infraestrutura e segredos:** credenciais SES e token/chat do Telegram ficam em AWS Secrets Manager ou variáveis server-side protegidas; não aparecem no browser, repositório, logs ou payloads de evento. Worker tem privilégio mínimo, concorrência limitada, logs estruturados, alarmes, DLQ, retenção e rollback documentado. (USR-02, USR-04, ARC-02)
12. **Ativação segura:** deploy mantém `enabled=false`, `dry_run=true` e limite de lote conservador. Antes do primeiro disparo produtivo devem passar dry-run sobre a base real, revisão dos elegíveis/rejeitados, teste de inbox/descadastro/resposta/Telegram, validação da identidade SES e aprovação explícita do usuário para habilitar. (USR-01–06, ARC-01, ARC-02)
13. **Testes e gates:** banco cobre elegibilidade, unicidade, claim, lease, limites, interrupção e idempotência; unitários cobrem policy engine, templates, SES, Telegram, retries e métricas; integração usa SES/Telegram falsos e Supabase isolado; E2E cobre CLI/API em dry-run e kill switch. Lint, typecheck, testes, build, validação SAM/CloudFormation e segurança passam. (ARC-02)

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `.aiox-core/core-config.yaml`. A validação usará revisão manual independente, testes e gates técnicos.

## Tasks / Subtasks

- [x] Modelar política, campanha e execução auditável (AC: 1–4, 7, 10)
  - [x] Adicionar migration para elegibilidade/base legal, campanha/versionamento, decisões, attempts/leases e configuração operacional.
  - [x] Criar constraints, índices, RLS e RPCs transacionais para criação de sequência, claim e conclusão.
  - [x] Preservar compatibilidade com `lead_email_sequence`, `lead_email_sequence_step`, `lead_email_message`, supressão e event store existentes.
- [x] Implementar policy engine determinístico (AC: 1, 3, 4, 6, 7)
  - [x] Produzir reason codes estáveis para elegível e cada rejeição.
  - [x] Revalidar supressão, evento terminal, recência, consentimento, horário, orçamento e kill switches antes do envio.
  - [x] Implementar dry-run que persiste decisão sem criar ação externa.
- [x] Implementar campanha e templates versionados (AC: 2, 5)
  - [x] Cadastrar os três cursos e passos 0/5/10 sem inferir interesse quando o dado não existe.
  - [x] Criar renderização segura com escaping, unsubscribe assinado e hashes de payload/template.
  - [x] Configurar remetente/reply-to e tags SES sem expor segredos.
- [x] Implementar worker/orquestrador (AC: 3–7, 9, 11)
  - [x] Criar pacote CLI-first com `status`, `dry-run`, `run-batch`, `pause` e `resume`.
  - [x] Implementar claim atômico, lease, idempotência de envio, retry/backoff, DLQ e reconciliação.
  - [x] Entregar infraestrutura AWS desativada/dry-run por padrão, alarmes e runbook de rollback.
- [x] Implementar notificações Telegram (AC: 8, 11)
  - [x] Criar outbox idempotente e cliente da Bot API com timeout/retry.
  - [x] Notificar resposta, terminal, falha permanente e guardrail com dados mínimos e link para CRM.
  - [x] Validar chat privado permitido; rejeitar destino diferente sem logar token/chat sensível.
- [x] Implementar projeções e status operacional (AC: 9, 10)
  - [x] Expor status e métricas por API protegida/CLI usando o CRM/event store como fontes oficiais.
  - [x] Documentar definições, janelas e limitações de atribuição.
- [x] Cobrir solução com testes (AC: 13)
  - [x] Adicionar pgTAP para constraints/RLS/RPCs/concorrência/leases/limites.
  - [x] Adicionar Vitest para policy, templates, SES, Telegram, retries, métricas e PII.
  - [x] Adicionar integração e E2E somente em dry-run/provedores falsos até autorização de ativação.
  - [x] Executar todos os gates e registrar evidências.
- [x] Preparar handoff e ativação controlada (AC: 11, 12)
  - [x] Atualizar `.env.example`, OpenAPI, arquitetura e runbook sem valores de segredo.
  - [x] Documentar ordem de deploy, smoke tests, rollback e checklist do primeiro lote.
  - [x] Entregar ao `@devops` commit candidato; push/deploy/ativação permanecem sujeitos a autorização.

## Dev Notes

### Dependência da story anterior

- Reutilizar o event store e as tabelas de sequência/mensagem da story `2026-09-16-crm-linha-do-tempo-interacoes-email.md`; não criar uma segunda timeline nem outro CRM.
- A ingestão SES já espera tags estáveis e registra `SENT`, entrega, abertura, clique, bounce e reclamação. O coletor IMAP já registra `REPLIED` e interrompe a sequência.
- Produção já possui a migration anterior e o coletor IMAP; qualquer nova migration deve ser forward-only e testada no projeto Supabase isolado antes de produção.

### Arquitetura e governança

- CRM é o sistema oficial; event store é a trilha auditável. `[Source: docs/architecture/sales-agent-revenue-operating-system.md#6-observabilidade-e-modelo-de-dados]`
- O orquestrador controla o processo e agentes não chamam canais sem policy gate. `[Source: docs/architecture/sales-agent-revenue-operating-system.md#19-decisões-arquiteturais-recomendadas]`
- Idempotency key, orçamento por execução/lead/campanha/dia, tool allowlist, limites e aprovação ligada ao payload são controles mínimos. `[Source: docs/architecture/sales-agent-revenue-operating-system.md#12-human-in-the-loop-segurança-e-governança]`
- Kill switches existem por organização, canal, campanha, agente, ferramenta e versão; o supervisor pode pausar/reduzir, não elevar o próprio limite. `[Source: docs/architecture/sales-agent-revenue-operating-system.md#10-sales-manager--supervisor]`
- Recuperação deve excluir do-not-contact, disputas e perdas por confiança/jurídico. `[Source: docs/architecture/sales-agent-revenue-operating-system.md#4-matriz-completa-de-agentes]`
- O dashboard mínimo separa negócio, funil, velocidade, qualidade, risco, economia, agentes e experimentos. `[Source: docs/architecture/sales-agent-revenue-operating-system.md#18-dashboard-executivo-mínimo]`

### Restrições de ativação

- Esta história implementa capacidade, mas não autoriza envio real.
- `enabled=false` e `dry_run=true` são defaults obrigatórios.
- O primeiro lote produtivo requer nova aprovação explícita depois das evidências do AC 12.
- Telegram deve apontar somente para o chat privado aprovado; o identificador real fica fora do repositório.

### Estrutura provável

- `supabase/migrations/`: política, campanha, outbox, attempts/leases e RPCs.
- `src/features/sales/reactivation/`: contratos, policy engine, templates, métricas e serviços server-side compartilhados.
- `app/api/internal/sales/`: contratos protegidos de status/execução quando necessários.
- `infrastructure/sales-reactivation-orchestrator/`: CLI/worker, SAM, testes e scripts operacionais.
- `docs/operations/`: runbook, primeiro lote, incidentes e rollback.

### Testing

- Unitários/componentes: Vitest.
- Banco: pgTAP no Supabase isolado, incluindo concorrência e RLS.
- Infraestrutura: typecheck, testes isolados, bundle load-safe, `cfn-lint` e `aws cloudformation validate-template` quando houver credenciais válidas.
- Integração externa: SES e Telegram falsos; nenhuma chamada real em CI.
- E2E: comandos/API em dry-run e kill switch, sem envio externo.

## Fora do escopo

- WhatsApp automático, telefonia, calendário e negociação.
- Geração livre de mensagem por LLM em produção.
- Promoção automática de prompts/experimentos.
- Remover supressão ou reativar sequência interrompida.
- Alterar preço, desconto, contrato ou compromisso comercial.
- Disparar a campanha ou habilitar o schedule durante a implementação.

## Story Draft Checklist Result

**Readiness:** READY
**Clarity score:** 9/10
**Major gaps:** nenhum bloqueador para implementação em modo desativado/dry-run. A identidade SES, o chat privado e o volume inicial só serão necessários no checklist de ativação produtiva.

| Category | Status | Issues |
|---|---|---|
| Goal & Context Clarity | PASS | Objetivo, valor, dependências e proibição de ativação estão explícitos. |
| Technical Implementation Guidance | PASS | Banco, policy, CLI, SES, Telegram, métricas e infraestrutura estão delimitados. |
| Reference Effectiveness | PASS | Referências apontam para seções específicas da arquitetura e story anterior. |
| Self-Containment Assessment | PASS | Regras, limites, edge cases e fora de escopo estão incluídos. |
| Testing Guidance | PASS | Banco, unitário, integração, E2E, infraestrutura e segurança estão cobertos. |
| CodeRabbit Integration | N/A | Integração desabilitada; revisão manual independente obrigatória. |

## Change Log

| Date | Version | Description | Author |
|---|---:|---|---|
| 2026-09-18 | 0.1 | História criada para orquestrador de reativação 0/5/10, SES, policy gate, kill switches, Telegram privado, métricas e ativação controlada. | River (@sm) |
| 2026-09-18 | 0.2 | PO tornou explícitos os três cursos e o endereço corporativo; história aprovada para implementação em dry-run, com ativação produtiva ainda condicionada. | Pax (@po) |
| 2026-09-18 | 0.3 | Implementação local concluída e movida para revisão; descoberta de coorte exige comando manual explícito e produção permanece desativada. | Dex (@dev) |
| 2026-09-18 | 0.4 | Commit candidato `ca426b0` preparado para handoff; push, deploy e ativação não executados. | Gage (@devops) |
| 2026-09-18 | 0.5 | Corrigida a corrida autosave/salvamento manual do blog que quebrava o E2E da PR; rascunhos novos agora usam ID estável e retry idempotente. | Dex (@dev) |
| 2026-09-18 | 0.6 | Adicionado gate fail-closed que valida os nomes dos secrets obrigatórios do Cloudflare Worker antes do deploy; leitura de produção identificou `SES_EVENTS_WEBHOOK_SECRET` e `EMAIL_UNSUBSCRIBE_SECRET` ausentes, sem acessar valores. | Gage (@devops) |
| 2026-09-18 | 0.7 | Endurecida a corrida claim→SES: a sequência agora preserva o curso aprovado em snapshot imutável e o banco revalida destinatário e curso atuais antes de autorizar o envio. | Dex (@dev) |
| 2026-09-18 | 0.8 | Projeção operacional ampliada por campanha/versão e janela de 30 dias, com reason codes, eventos por etapa, interrupções, falhas, ausência explícita de classificação positiva e faixa conservadora do custo-base SES. | Atlas (@analyst) |
| 2026-09-18 | 0.9 | Adicionado planejador local e somente leitura para comparar a exportação do CRM com as quatro bases, deduplicar por e-mail, detectar histórico/supressões/conflitos e manter todos os contatos bloqueados até o gate produtivo. | Dex (@dev) |
| 2026-09-18 | 1.0 | Implementado pipeline de importação auditável com dry-run, RPCs service-role, preservação de PII, classificação separada, histórico importado e dupla confirmação para APPLY; nenhuma execução remota realizada. | Dex (@dev) |

## Dev Agent Record

### Agent Model Used

Codex / GPT-5

### Debug Log References

- Corrigidos conflitos de tipos/casts e condições de concorrência detectados pelos testes pgTAP durante o desenvolvimento da migration.
- O build local inicialmente falhou no prerender porque o ambiente E2E apontava para o PostgREST local indisponível; a validação foi repetida com stub HTTP local, somente leitura, e concluiu 46/46 páginas.
- A descoberta de contatos foi retirada do caminho agendado e exige `run-batch --confirm-live --discover`, impedindo ampliação silenciosa da coorte e varredura repetitiva da base.
- O único check remoto vermelho foi reproduzido no teste de criação de artigo: uma falha do autosave era herdada pelo clique manual sem nova tentativa. O fluxo agora repete manualmente com o mesmo ID estável, e o E2E valida resposta HTTP, ID e rota canônica.

### Completion Notes List

- Policy engine fail-closed, campanha imutável 0/5/10 e três cursos exatos implementados.
- Banco fornece trilha append-only, RPCs transacionais, leases, limites, kill switch, controle auditado, outbox Telegram e estados de falha ambígua.
- Worker AWS/SES e Telegram implementado com privilégio mínimo, concorrência 1, DLQ, alarmes e defaults desativados/dry-run.
- API administrativa de status, projeções descritivas, OpenAPI, arquitetura e runbook concluídos.
- Nenhuma chamada real a SES/Telegram, migration remota, deploy, ativação, push ou merge foi executada nesta story.
- Commit candidato de implementação: `ca426b0` (`feat(sales): add safe reactivation orchestrator`).
- Correção do gate E2E: `31c217b` (`fix(blog): retry failed autosave safely`).
- O gate E2E pendente da PR foi corrigido e validado localmente em modo equivalente à CI; o check remoto só poderá ser renovado após push autorizado.
- O pipeline de frontend agora bloqueia publicação quando faltam secrets obrigatórios do Worker; o verificador consulta somente metadados e nunca imprime valores.
- A inspeção read-only do Worker de produção confirmou quatro dos seis nomes exigidos e identificou `SES_EVENTS_WEBHOOK_SECRET` e `EMAIL_UNSUBSCRIBE_SECRET` como pendências de configuração.
- A auditoria pós-claim fechou a troca silenciosa de destinatário/curso: o curso da sequência é imutável, o claim rejeita drift prévio e `sales_begin_send` compara novamente os dados capturados imediatamente antes do SES.
- O status administrativo passou a incluir métricas agregadas sem PII por campanha/versão/período; respostas positivas permanecem nulas até classificação explícita, e custo SES é exibido como faixa com premissas documentadas.
- As bases CSV ganharam um planejador agregado e fail-closed: e-mail exato é a única chave automática de deduplicação; telefone e divergências cadastrais são apenas sinais de revisão, e nenhum contato é autorizado para envio pelo relatório local.
- Execução sobre as quatro bases: 6.913 linhas viraram 5.668 registros canônicos; 2.923 já constam na exportação do CRM e 2.745 são novos. Entre os novos, 505 não têm base legal registrada, 47 trazem supressão e 2.193 permanecem bloqueados até a consulta ao histórico produtivo.
- O gate de banco agora compara por e-mail normalizado sob lock transacional, bloqueia duplicidade ambígua, mantém auditoria sem PII, não sobrescreve cadastro existente e nunca converte base legal da planilha em permissão aprovada. O executor exige confirmação textual adicional no modo APPLY.
- Preparação das três bases externas para o RPC: 3.990 linhas, 2.790 e-mails canônicos e 2.731 candidatos seguros; 59 conflitos de nome ficaram fora do payload, 731 organizações divergentes foram omitidas, 2.096 registros trazem histórico e 46 trazem evento terminal de bounce. A comparação produtiva ainda não foi executada.
- Ativação ainda depende de dry-run na base real, revisão de elegibilidade, ID numérico do chat privado, identidade SES, testes sintéticos e nova autorização explícita.

### File List

- `.env.example`
- `.github/workflows/deploy-frontend.yml`
- `app/api/admin/sales/reactivation/status/route.ts`
- `docs/ARCHITECTURE.md`
- `docs/api/openapi.yaml`
- `docs/operations/sales-reactivation-orchestrator.md`
- `docs/stories/2026-09-18-sales-reactivation-orchestrator-telegram.md`
- `infrastructure/sales-reactivation-orchestrator/README.md`
- `infrastructure/sales-reactivation-orchestrator/package.json`
- `infrastructure/sales-reactivation-orchestrator/package-lock.json`
- `infrastructure/sales-reactivation-orchestrator/scripts/build.mjs`
- `infrastructure/sales-reactivation-orchestrator/src/*.ts`
- `infrastructure/sales-reactivation-orchestrator/template.yaml`
- `infrastructure/sales-reactivation-orchestrator/tests/*.test.ts`
- `infrastructure/sales-reactivation-orchestrator/tsconfig.json`
- `infrastructure/sales-reactivation-orchestrator/vitest.config.ts`
- `package.json`
- `scripts/check-workers-required-secrets.mjs`
- `scripts/check-workers-required-secrets.d.mts`
- `scripts/contact-import-plan.mjs`
- `scripts/contact-import-plan.d.mts`
- `scripts/import-contacts.mjs`
- `scripts/import-contacts.d.mts`
- `src/__tests__/app/api/admin-sales-reactivation-status-route.test.ts`
- `src/__tests__/features/admin-blog.test.tsx`
- `src/__tests__/features/contact-import-plan.test.ts`
- `src/__tests__/features/contact-import-execution.test.ts`
- `src/__tests__/features/sales-reactivation-core.test.ts`
- `src/__tests__/features/sales-reactivation-status.test.ts`
- `src/__tests__/ci/production-workflow.test.ts`
- `src/__tests__/scripts/check-workers-required-secrets.test.ts`
- `src/features/admin/blog/admin-blog-editor.tsx`
- `src/features/sales/reactivation/*.ts`
- `src/lib/email/unsubscribe-token-core.ts`
- `src/lib/email/unsubscribe-token.ts`
- `supabase/migrations/20260918120000_sales_reactivation_orchestrator.sql`
- `supabase/migrations/20260918130000_contact_import_pipeline.sql`
- `supabase/tests/database/sales-reactivation-orchestrator.test.sql`
- `supabase/tests/database/contact-import-pipeline.test.sql`
- `tests/admin-crud.spec.ts`

## QA Results

### Validação do Product Owner (Pax/@po — 2026-09-18)

- **Decisão:** GO — `Approved`.
- **Readiness:** 94%; clareza para desenvolvimento 9/10; nenhum bloqueador de implementação local/dry-run.
- **Rastreabilidade:** todos os requisitos derivam das decisões do usuário, da story anterior ou da arquitetura aprovada.
- **Escopo:** adequado ao próximo incremento; WhatsApp, negociação, LLM livre e promoção automática permanecem fora.
- **Risco principal:** ação externa sobre base real. Mitigado por elegibilidade fail-closed, dry-run, kill switches, volume limitado e aprovação explícita antes do primeiro envio.
- **Dependência humana futura:** confirmar identidade SES/chat Telegram e aprovar conteúdo/elegíveis/volume do primeiro lote após os testes; isso não bloqueia a implementação desativada.

### Evidências do executor (Dex/@dev — 2026-09-18)

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- Vitest completo: PASS, 100 arquivos e 906 testes.
- `npm run test:db`: PASS, 17 arquivos e 237 testes, incluindo concorrência, métricas agregadas e drift de destinatário/curso após claim.
- Worker: PASS, typecheck, 2 arquivos e 11 testes, bundle e smoke-load.
- OpenAPI lint e drift: PASS, 23 rotas reconciliadas.
- `cfn-lint infrastructure/sales-reactivation-orchestrator/template.yaml`: PASS.
- Build de produção: PASS, 48/48 páginas no Supabase local isolado.
- E2E funcional equivalente à CI: PASS, 131 testes e 8 snapshots intencionalmente ignorados; o caso do blog que falhava na PR passou.
- Gate de secrets do Worker: PASS em 2 arquivos/11 testes direcionados; execução contra produção falhou de forma segura somente pelos dois nomes pendentes.
- `secretlint` nos arquivos novos e `git diff --check`: PASS.
- Revisão formal de QA e qualquer ação remota/produtiva permanecem pendentes.
