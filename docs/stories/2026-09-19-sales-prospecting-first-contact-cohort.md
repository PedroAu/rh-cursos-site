# Story: Prospecção inicial da base fornecida por decisão do controlador

## Status

Ready for Review

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@architect"
quality_gate_tools:
  - policy_review
  - migration_review
  - pgtap
  - vitest
  - dry_run_production
  - secret_scan
  - aws_ses_gate
```

## Tracking

> ClickUp não está disponível nesta sessão. A story é mantida localmente como
> fonte oficial até que uma integração de gestão de projeto seja configurada.

## Origem e rastreabilidade

| ID | Requisito | Origem |
| --- | --- | --- |
| USR-01 | Enviar o primeiro contato por e-mail para toda a base fornecida sem exigir comprovação individual de interação anterior. | Decisão explícita do controlador em 19/09/2026 |
| USR-02 | Tratar como elegíveis tanto dados fornecidos diretamente pelas pessoas quanto dados obtidos de fontes públicas. | Esclarecimentos do controlador em 19/09/2026 |
| USR-03 | Preservar descadastro, bounce permanente, reclamação, pedido de exclusão, endereço inválido e demais supressões. | Decisão vigente e arquitetura de vendas |
| USR-04 | Oferecer os três cursos nacionais já definidos e encaminhar respostas à caixa corporativa/Telegram. | Decisões anteriores do controlador |
| USR-05 | Usar Amazon SES; não contornar sandbox, reputação, quota nem controles do provedor. | Decisão de infraestrutura e controles vigentes |
| ARC-01 | CRM é o sistema oficial e o event store append-only preserva decisão, ação, versão e resultado. | `docs/architecture/sales-agent-revenue-operating-system.md#6-observabilidade-e-modelo-de-dados` |
| ARC-02 | Campanha em massa exige decisão humana; ações externas permanecem versionadas, idempotentes, limitadas e reversíveis. | `docs/architecture/sales-agent-revenue-operating-system.md#10-sales-manager--supervisor` e `#12-human-in-the-loop-segurança-e-governança` |

## Story

**As a** controlador responsável pela operação comercial da RH Cursos,
**I want** aprovar por coorte e executar um único primeiro contato para a base
fornecida,
**so that** a empresa possa iniciar prospecção nacional de forma auditável,
transparente e interrompível sem exigir prova individual de relação anterior.

## Contexto e decisão de produto

- A produção contém 3.758 contatos importados com permissão mais recente
  `UNKNOWN`: 2.220 trazem indicação de `LEGITIMATE_INTEREST` da fonte e 1.538
  não trazem base indicada.
- O controlador informou que parte dos dados foi solicitada e fornecida pelas
  próprias pessoas, inclusive por ligação e e-mail, e parte veio de fontes
  públicas. Também decidiu expressamente realizar o primeiro contato em toda a
  base sem exigir comprovação individual de interação anterior.
- A decisão será documentada como legítimo interesse da coorte. Ela não elimina
  os princípios de finalidade, necessidade, transparência e prestação de contas,
  nem autoriza contato com registros suprimidos ou inválidos.
- A campanha desta story é separada da reativação `reactivation-v1`: ela possui
  somente o passo inicial. Nenhum follow-up é criado automaticamente para quem
  não responder.
- O SES estava em sandbox durante a implementação. Em 20/09/2026, a revisão do
  caso foi concedida e o estado autoritativo passou a
  `ProductionAccessEnabled=true` em `sa-east-1`; o primeiro lote permanece
  separado e exige autorização explícita de go-live.

## Acceptance Criteria

1. **Decisão auditável por coorte:** existe artefato versionado com controlador,
   finalidade `COMMERCIAL_PROSPECTING`, base `LEGITIMATE_INTEREST`, população,
   critérios de exclusão, conteúdo aprovado, validade máxima de 30 dias, digest
   determinístico e referência imutável. Não é exigida prova individual de
   relação anterior para a coorte aprovada. (USR-01, USR-02, ARC-01, ARC-02)
2. **Planejador e aplicador CLI-first:** um comando server-side começa em
   `DRY_RUN`, seleciona somente contatos provenientes dos lotes importados,
   calcula digest e contagens sem imprimir PII. `APPLY` exige digest esperado,
   referência de decisão e confirmação textual; grava eventos `APPROVED`
   append-only e idempotentes, sem atualizar ou apagar eventos anteriores.
   (USR-01, ARC-01, ARC-02)
3. **Exclusões irrenunciáveis:** o aplicador e o policy engine nunca tornam
   enviável contato excluído, e-mail ausente/inválido, descadastrado, reclamante,
   bounce permanente ou integrante de qualquer supressão. `BLOCKED` mais recente
   prevalece. Dados sensíveis não são usados para seleção ou personalização.
   (USR-03, ARC-02)
4. **Campanha de primeiro contato:** existe campanha imutável
   `prospecting-v1@1`, separada de `reactivation-v1`, com um único passo no dia 0,
   remetente/reply-to `pedro@rhcursos.com.br`, finalidade
   `COMMERCIAL_PROSPECTING`, conteúdo aprovado e versão/hash exatos. O texto se
   identifica como RH Cursos, apresenta os três cursos, explica de forma breve a
   origem possível dos dados, oferece resposta para datas/programa/investimento,
   informa canal para direitos e inclui descadastro funcional. (USR-04, ARC-02)
5. **Compatibilidade e isolamento:** o orquestrador seleciona propósito,
   template e curso/segmento pela campanha carregada; o claim filtra a campanha
   configurada e nunca mistura passos de `reactivation-v1` com
   `prospecting-v1`. A campanha anterior e suas evidências permanecem imutáveis.
   (ARC-01, ARC-02)
6. **Ativação continua fail-closed:** migration e deploy mantêm campanha
   `DISABLED`, schedule `DISABLED`, `RUN_MODE=DRY_RUN`, `enabled=false` e kill
   switch ligado. Imediatamente antes do envio, o sistema consulta o estado SES
   e só permite a transição quando a mesma resposta autoritativa informa
   `ProductionAccessEnabled=true`, `SendingEnabled=true` e enforcement
   `HEALTHY`. Não usar SMTP Locaweb ou outro canal para contornar esse gate.
   (USR-05, ARC-02)
7. **Dry-run produtivo verificável:** após a decisão da coorte, o dry-run informa
   contatos avaliados, elegíveis e rejeitados por reason code, sem PII e sem
   criar sequência, tentativa ou mensagem. Há duas reconciliações explícitas:
   o plano dos 3.758 importados resulta em 3.712 aprovados e 46 excluídos; o
   universo ampliado do worker avalia 3.779 registros, com 3.712 elegíveis e 67
   rejeitados. (USR-01–05, ARC-01)
8. **Primeiro lote após liberação do SES:** quando
   `ProductionAccessEnabled=true`, `SendingEnabled=true` e enforcement
   `HEALTHY` forem confirmados na mesma consulta imediatamente anterior ao envio,
   e houver autorização comercial explícita, a ativação usa a campanha/digest
   aprovados, limite diário e lote conservadores, janela 08h–18h em
   `America/Sao_Paulo`, schedule inicialmente desligado e execução manual
   idempotente. Timeline, descadastro, respostas, Telegram, bounces, complaints,
   alarmes e DLQs são conferidos antes de ampliar o lote. (USR-03–05, ARC-02)
9. **Testes e gates:** pgTAP cobre seleção, digest, append-only, idempotência,
   exclusões, propósito e isolamento de campanha; Vitest cobre policy/templates
   e ausência de PII; lint, typecheck, unitários, banco, build, CloudFormation,
   secret scan e CodeRabbit passam antes do merge. (ARC-01, ARC-02)

## Conteúdo aprovado da campanha

**Assunto:** `{{firstName}}, três capacitações para sua equipe em 2026`

**Corpo:**

> Olá, {{firstName}}. Sou Pedro, da RH Cursos. Estamos divulgando três
> capacitações nacionais: Curso Prático de Atualização do eSocial — Novo Leiaute
> 1.3 para Órgãos Públicos; Auditoria da Folha de Pagamento; e Inteligência
> Artificial na Execução Orçamentária. Caso algum tema seja relevante para sua
> equipe, responda a este e-mail e eu envio datas, programa e investimento. Este
> contato utiliza dados fornecidos à RH Cursos ou disponíveis em fonte pública
> profissional. Para consultar, corrigir ou excluir seus dados, responda a este
> e-mail. Para não receber novos contatos, use {{unsubscribeUrl}}.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml`. A validação usa
> revisão local independente, testes e os gates técnicos desta story.

## Tasks / Subtasks

- [x] Implementar decisão de legítimo interesse por coorte (AC: 1–3, 7)
  - [x] Criar CLI agregado com `DRY_RUN` padrão, digest determinístico e `APPLY`
    protegido por confirmação textual.
  - [x] Gravar eventos append-only `APPROVED` com finalidade, validade,
    `evidence_ref`, ator e idempotency key, sem PII no relatório.
  - [x] Excluir supressões, registros inválidos/excluídos e `BLOCKED` mais recente.
- [x] Versionar a campanha de primeiro contato (AC: 4–6)
  - [x] Adicionar purpose por campanha e `prospecting-v1@1` com apenas passo 0.
  - [x] Adicionar template compilado aprovado, hash estável e assunto editorial
    `Gestão de Pessoas`, sem filtrar a coorte pelo tema do lead nem atribuir
    falsamente um curso individual.
  - [x] Isolar claim/renderização por campaign key/version e preservar
    `reactivation-v1`.
- [x] Preparar infraestrutura sem ativar envio (AC: 5, 6, 8)
  - [x] Parametrizar campaign key no worker mantendo `DRY_RUN` e schedule
    desabilitado.
  - [x] Manter o gate autoritativo do SES antes de qualquer transição para LIVE.
- [x] Cobrir regressão e segurança (AC: 3, 5, 7, 9)
  - [x] Adicionar pgTAP, Vitest e testes de CLI para plano/aplicação concorrente e
    idempotente.
  - [x] Executar dry-run no Supabase isolado e, depois do deploy seguro, na base
    produtiva sem enviar mensagens.
  - [x] Executar todos os gates, revisão automática, PR, merge e pipeline
    pós-merge.

## Dev Notes

### Decisões e compatibilidade

- CRM continua sendo a fonte oficial; decisões e eventos são append-only e não
  sobrescrevem o histórico. `[Source: docs/architecture/sales-agent-revenue-operating-system.md#6-observabilidade-e-modelo-de-dados]`
- Campanha em massa e nova base legal exigem decisão humana. A decisão explícita
  do controlador de 19/09/2026 é a origem desta story; a execução continua
  limitada pelo payload aprovado, expiração, digest e guardrails.
  `[Source: docs/architecture/sales-agent-revenue-operating-system.md#10-sales-manager--supervisor]`
- Ações externas exigem payload hash, idempotency key, limites, kill switch,
  auditoria e rollback. `[Source: docs/architecture/sales-agent-revenue-operating-system.md#12-human-in-the-loop-segurança-e-governança]`
- O orquestrador é o único caminho de envio e agentes não chamam canais
  diretamente. `[Source: docs/architecture/sales-agent-revenue-operating-system.md#19-decisões-arquiteturais-recomendadas]`

### Estrutura e arquivos relevantes

- `supabase/migrations/`: purpose da campanha, campanha versionada e funções
  transacionais.
- `scripts/`: planejador/aplicador CLI da decisão por coorte.
- `src/features/sales/reactivation/`: policy, tipos e templates versionados.
- `infrastructure/sales-reactivation-orchestrator/`: seleção da campanha,
  renderização e parâmetro CloudFormation.
- `supabase/tests/database/`, `src/__tests__/` e testes do worker: regressão e
  segurança.
- Os arquivos gerais `docs/framework/coding-standards.md`, `tech-stack.md` e
  `source-tree.md`, bem como os fallbacks configurados, não existem neste
  checkout; a story usa os padrões comprovados nas duas stories anteriores e na
  arquitetura brownfield vigente.

### Dependências externas

- A saída do sandbox do SES em `sa-east-1` foi confirmada em 20/09/2026, com
  revisão `GRANTED`, envio habilitado e enforcement saudável.
- A identidade, DKIM, custom MAIL FROM, SPF/DMARC, webhook de eventos, IMAP e
  Telegram já foram validados nas entregas anteriores.

### Testing

- Unitários: Vitest em `src/__tests__/features/` e no pacote do worker.
- Banco: pgTAP em `supabase/tests/database/`, incluindo concorrência e RLS.
- CLI: plano determinístico sem PII; aplicação testada contra Supabase isolado.
- Gates: lint, typecheck, unitários, banco, build, E2E aplicável, secretlint,
  `cfn-lint` e revisão CodeRabbit local.

## Riscos e mitigações

| Risco | Mitigação obrigatória |
| --- | --- |
| Interpretar dado público como autorização irrestrita | Decisão de coorte documentada, primeiro contato único, transparência e oposição fácil |
| Contatar quem já recusou | Supressão e `BLOCKED` prevalecem em todos os gates |
| Misturar reativação e prospecção | Campaign key, purpose, template e claim isolados e versionados |
| Repetir o primeiro contato | Sequência/idempotency key únicas por lead e campanha |
| Expor PII em plano ou CI | Somente contagens, reason codes e digest no output |
| Contornar quota/reputação | Gate SES autoritativo, limites locais e nenhum fallback por Locaweb |

## Story Draft Checklist Result

**Readiness:** READY

**Clarity score:** 9/10
**Major gaps:** nenhum bloqueador de implementação/dry-run; o envio real depende
da autorização comercial explícita e da transição controlada para `LIVE`.

| Category | Status | Issues |
| --- | --- | --- |
| 1. Goal & Context Clarity | PASS | Objetivo, decisão do controlador e limites estão explícitos |
| 2. Technical Implementation Guidance | PASS | CLI, schema, policy, campanha, worker e arquivos estão delimitados |
| 3. Reference Effectiveness | PASS | Arquitetura e stories anteriores são resumidas e citadas |
| 4. Self-Containment Assessment | PASS | Coorte, conteúdo, exclusões e ativação estão definidos |
| 5. Testing Guidance | PASS | Banco, unitário, CLI, infraestrutura e produção segura estão cobertos |
| 6. CodeRabbit Integration | N/A | Integração formal desabilitada; revisão local continua obrigatória |

## Change Log

| Date | Version | Description | Author |
| --- | ---: | --- | --- |
| 2026-09-19 | 0.1 | Story criada a partir da decisão explícita do controlador para primeiro contato em toda a base, com aprovação por coorte e exclusões irrenunciáveis. | River (@sm) |
| 2026-09-19 | 0.2 | Validação de produto concluída: escopo, conteúdo, critérios de aplicação, exclusões e gates estão claros e testáveis; story aprovada para implementação. | Pax (@po) |
| 2026-09-19 | 0.3 | Decisão por coorte, campanha isolada, CLI, guardrails SES, testes e documentação implementados e validados para revisão. | Dex (@dev) |
| 2026-09-20 | 0.4 | Dry-run produtivo identificou filtro indevido por tema; correção passa a abranger toda a base importada elegível e mantém `Gestão de Pessoas` somente como assunto editorial. | Dex (@dev) |
| 2026-09-20 | 0.5 | PRs #35–#38 mescladas com todos os gates verdes; a execução autoritativa daquele ciclo `35493069786`, no SHA `5e953c7`, confirmou 934 testes unitários e 293 SQL. Decisão aplicada a 3.712 contatos e dry-run concluído; envio permanece bloqueado pelo SES negado/sandbox. | Gage (@devops) |
| 2026-09-20 | 0.6 | SES liberado para produção (`GRANTED`); nova simulação produtiva `a761ea97-ca9e-4ec9-ab12-169fb537f2b2` confirmou 3.712 elegíveis, 67 rejeitados e zero sequências/tentativas/envios. O primeiro lote continua aguardando autorização explícita de go-live. | Gage (@devops) |
| 2026-09-20 | 0.7 | Primeiro lote autorizado: 5 enviados, 4 entregues, 1 bounce e 0 complaints. Campanha, controle global e schedule voltaram ao estado pausado. A observação deixou a regra EventBridge sem disparos; a principal hipótese é o filtro `resources`. Correção local pronta e expansão bloqueada até deploy e validação. | Gage (@devops) |
| 2026-09-21 | 0.8 | Filtro EventBridge corrigido em produção e validado com um único envio ao Mailbox Simulator: `SENT` e `DELIVERED` persistidos automaticamente, duas invocações, zero falhas e DLQ vazia. O registro sintético foi desativado; nenhuma mensagem adicional foi enviada a contatos reais. | Gage (@devops) |
| 2026-09-21 | 0.9 | Corrigido o status administrativo para usar `prospecting-v1`, campanha efetivamente configurada no worker produtivo, mantendo consulta explícita de outras campanhas por parâmetro validado e isolando falhas/alertas pela sequência da campanha. | Dex (@dev) |

## Dev Agent Record

### Agent Model Used

Codex (GPT-5)

### Debug Log References

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit` — 934 testes aprovados na execução autoritativa da versão 0.5.
- `npm run test:db` — 293 testes aprovados, incluindo concorrência.
- `npm run build:verify`
- `npm run verify:sales-reactivation`
- `supabase db lint --local --level warning` — somente dois warnings legados,
  fora desta story.
- `uvx cfn-lint infrastructure/sales-reactivation-orchestrator/template.yaml`
- `npx secretlint ...`
- `npx vitest run src/__tests__/app/api/admin-sales-reactivation-status-route.test.ts src/__tests__/features/sales-reactivation-status.test.ts` — 20/20 aprovados.
- `npm run test:unit -- --reporter=dot` — 950/950 aprovados.
- `npm run test:db` — 20 arquivos e 306/306 testes aprovados, incluindo
  isolamento de alertas por campanha e versão.
- `coderabbit review --agent -t uncommitted` — 0 crítico/alto; achados menores
  e triviais corrigidos antes do commit.
- PR #35: CI `35485352733` iniciou em `2026-09-20T02:58:14Z` sobre o SHA
  `d28868c`; merge `78bb43c` em `2026-09-20T03:04:30Z`.
- PR #36: CI `35486374325` iniciou em `2026-09-20T03:22:08Z` sobre o SHA
  `ba23a3c`; merge `1829a4e` em `2026-09-20T03:34:31Z`.
- PR #37: CI `35487475855` iniciou em `2026-09-20T03:47:15Z` sobre o SHA
  `a508303`; merge `27dc005` em `2026-09-20T03:54:59Z`.
- PR #38: CI `35493069786` iniciou em `2026-09-20T06:00:03Z` sobre o SHA
  `5e953c7`; merge `e462e2a` em `2026-09-20T06:16:19Z`.
- PR #39: CI `35503547979` iniciou em `2026-09-20T09:53:33Z` sobre o SHA
  `dcd75aa`; Static Checks, Unit Tests, Build & A11y, API Docs, Performance
  Budgets, Secret Scanning, DB Tests e E2E isolado passaram; merge
  `3024b0485f43c6293c28e8aeb5352e110ba794bc` em
  `2026-09-20T16:51:23Z`.

### Completion Notes List

- Decisão por coorte implementada sem PII no relatório, com digest, validade de
  até 30 dias, referência imutável e aplicação idempotente/append-only.
- Campanha `prospecting-v1@1` possui apenas o primeiro contato e finalidade
  própria; a reativação anterior permanece isolada.
- Supressão, oposição, e-mail inválido, exclusão, bounce e complaint continuam
  fail-closed. A prospecção aprovada não exige comprovação individual de
  inatividade, conforme decisão do controlador.
- Worker consulta `ses:GetAccount` antes de qualquer execução `LIVE`; SES está
  liberado e saudável, com cota de 50.000/dia e 14/s. O primeiro lote autorizado
  enviou exatamente 5 mensagens para a coorte importada: 4 entregas, 1 bounce e
  nenhuma complaint. A mensagem técnica anterior para a própria caixa não faz
  parte desses cinco envios.
- O plano da decisão de coorte `e03171df-5180-43f4-a948-d45f226d734a`
  reconciliou 3.758 contatos importados: aplicou 3.712 eventos `APPROVED` e
  excluiu 46, com digest e expiração em `2026-10-05T03:40:00Z`.
- Separadamente, o dry-run final do worker, run ID
  `a761ea97-ca9e-4ec9-ab12-169fb537f2b2`, avaliou 3.779 registros do CRM,
  confirmou 3.712 elegíveis, rejeitou 67 e terminou com zero sequências, zero
  tentativas e zero mensagens.
- PRs #35–#39 foram mescladas; unitários, banco, build, E2E, secret scan,
  CloudFormation e demais gates remotos passaram. O gate SES e o lote manual do
  AC 8 foram atendidos. A correção da regra está na PR #40 e já foi implantada
  por Change Set; o simulador confirmou o caminho automático sem falhas. A
  ampliação permanece bloqueada pela taxa observada de um bounce em cinco envios
  e exige nova decisão explícita; schedule e campanha continuam pausados.
- A API administrativa de status agora consulta `prospecting-v1` por padrão,
  alinhada ao `CAMPAIGN_KEY` da Lambda produtiva. Administradores ainda podem
  consultar `reactivation-v1` explicitamente; chaves fora do contrato são
  rejeitadas antes da consulta de status da campanha.
- Contadores de falhas e alertas deixaram de misturar campanhas: tentativas e
  notificações são correlacionadas às sequências da chave selecionada. As duas
  consultas relacionais foram validadas em modo somente leitura contra a
  produção, sem imprimir PII.

### File List

- `docs/stories/2026-09-19-sales-prospecting-first-contact-cohort.md`
- `docs/stories/index.md`
- `docs/operations/sales-reactivation-go-live-checklist.md`
- `docs/operations/sales-reactivation-legitimate-interest-assessment.md`
- `docs/operations/sales-reactivation-orchestrator.md`
- `docs/api/openapi.yaml`
- `public/api-docs.html`
- `app/api/admin/sales/reactivation/status/route.ts`
- `infrastructure/sales-reactivation-orchestrator/README.md`
- `infrastructure/sales-reactivation-orchestrator/src/orchestrator.ts`
- `infrastructure/sales-reactivation-orchestrator/src/ses-email-sender.ts`
- `infrastructure/sales-reactivation-orchestrator/src/store.ts`
- `infrastructure/sales-reactivation-orchestrator/src/types.ts`
- `infrastructure/sales-reactivation-orchestrator/template.yaml`
- `infrastructure/sales-reactivation-orchestrator/tests/config-and-ses.test.ts`
- `infrastructure/sales-reactivation-orchestrator/tests/orchestrator.test.ts`
- `infrastructure/sales-reactivation-orchestrator/tests/template.test.ts`
- `package.json`
- `scripts/approve-sales-prospecting-cohort.d.mts`
- `scripts/approve-sales-prospecting-cohort.mjs`
- `src/__tests__/features/sales-reactivation-core.test.ts`
- `src/__tests__/app/api/admin-sales-reactivation-status-route.test.ts`
- `src/__tests__/features/sales-reactivation-status.test.ts`
- `src/__tests__/scripts/sales-prospecting-cohort.test.ts`
- `src/features/sales/reactivation/policy.ts`
- `src/features/sales/reactivation/status.ts`
- `src/features/sales/reactivation/templates.ts`
- `src/features/sales/reactivation/types.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/20260919230000_sales_prospecting_first_contact.sql`
- `supabase/migrations/20260921143000_scope_sales_status_notifications.sql`
- `supabase/tests/database/sales-campaign-status-notifications.test.sql`
- `supabase/tests/database/sales-prospecting-first-contact.test.sql`
- `supabase/tests/database/sales-reactivation-orchestrator.test.sql`
