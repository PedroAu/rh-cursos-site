# Checklist de go-live — time autônomo de vendas

Atualizado em 19/09/2026. Este documento é operacional: um item só pode ser
marcado quando houver evidência observável do ambiente correspondente.

## Estado preparado localmente

- [x] Timeline append-only de interações por e-mail, SES e IMAP.
- [x] Orquestrador 0/5/10 com policy fail-closed, idempotência, limites e kill switch.
- [x] Outbox e cliente Telegram com chat privado permitido.
- [x] Status administrativo e métricas agregadas sem PII.
- [x] Planejador agregado das quatro bases.
- [x] Gate de importação service-role com `DRY_RUN` e dupla confirmação para `APPLY`.
- [x] Concorrência real de importação: um `CREATED`, um `EXISTING`, um único lead.
- [x] Lint, typecheck, build de produção, 927 testes unitários, 266 testes SQL,
  testes concorrentes, worker e OpenAPI aprovados.
- [x] Auditoria de dependências sem vulnerabilidade crítica; Next.js atualizado
  para 16.3.5 e Sharp consolidado em 0.35.4 antes da publicação da PR.
- [x] Teste real do Telegram entregue no chat privado autorizado; o SES aceitou
  uma única mensagem técnica destinada ao próprio `pedro@rhcursos.com.br` e
  nenhum contato importado recebeu envio.
- [x] Push em `main` executa validação, mas migrations e deploys produtivos
  exigem `workflow_dispatch` explícito; merge e produção permanecem gates separados.

## Estado externo ainda pendente

- [x] Mac desbloqueado e sessão AWS renovada; perfil assumido
  `rhcursos-email-deployer` validado sem expor credenciais.
- [x] Sessão Supabase CLI renovada; projetos de produção
  `hwpsrujkxjhmmwphqdlz` e teste `rajjoakjkmmzcwtabuxx` inspecionados sem escrita.
- [x] Commits locais enviados à PR #30; o branch remoto está em `17dba96`.
- [x] CI remoto totalmente verde no SHA `17dba96`: Static Checks, Unit Tests,
  Build & A11y, API Docs, Performance Budgets, Secret Scanning, DB Tests e E2E
  passaram. Com autorização específica, `admin-resources` do projeto
  `site-teste` foi atualizado da versão 16 para 17; os três fontes publicados
  (`index.ts`, validação e mappers) foram comparados com o repositório e o E2E
  isolado concluiu em 6m03s. Produção não foi alterada.
- [x] PR #30 revisada, com todos os gates verdes, mesclada em `main` no commit
  `7182873d22f5c514d998eddfc968e075e21a6fea`; pipeline pós-merge concluído.
- [x] Migrations `20260918120000_sales_reactivation_orchestrator.sql`,
  `20260918130000_contact_import_pipeline.sql` e
  `20260918140000_fix_profile_trigger_role.sql` aplicadas em produção e
  confirmadas no histórico remoto.
- [x] Secrets Cloudflare `EMAIL_UNSUBSCRIBE_SECRET` e
  `SES_EVENTS_WEBHOOK_SECRET` rotacionados e sincronizados com o segredo do
  orquestrador no AWS Secrets Manager; webhook autenticado respondeu `422` ao
  payload sintético inválido, comprovando autenticação sem gravar evento.
- [x] Identidade de domínio SES `rhcursos.com.br`, DKIM, custom MAIL FROM, SPF e
  DMARC verificados. A identidade de domínio autoriza o remetente corporativo.
- [ ] Conta SES fora do sandbox. A reconsideração do caso `178957960700508` foi
  enviada à AWS em 18/09/2026 e aguarda resposta; o estado autoritativo ainda é
  `ProductionAccessEnabled=false`, com limite de 200/dia e 1/segundo.
- [x] Estado atual do Configuration Set inspecionado: `rhub-email-events` publica
  via SNS para um endpoint Vercel legado.
- [x] Novo caminho SES → EventBridge → API Destination → Cloudflare implantado,
  autenticado e filtrado por identidade, remetente e Configuration Set; DLQs
  vazias, conexão `AUTHORIZED`, destino `ACTIVE` e alarmes `OK`.
- [x] Extensão mínima do papel `rhcursos-email-deployer` aplicada e versionada,
  incluindo tags do Configuration Set e leituras necessárias aos gates SES.
- [x] ID numérico do chat privado confirmado e teste entregue pelo
  `@rhcursos_bot` sem expor token.
- [x] Stack `rhcursos-email-sales-reactivation` implantada com schedule
  `DISABLED`, `RunMode=DRY_RUN`, lote 5 e allowlist de chat `0`.
- [x] Coletor Locaweb IMAP confirmado saudável a cada minuto, com checkpoint
  preservado no UID 15.793; quatro mensagens antigas da DLQ, originadas antes
  da correção do bundle, foram removidas após a conferência dos logs e o alarme
  da fila retornou a `OK`.
- [x] Dry-run produtivo das quatro bases concluído: 6.913 linhas, 5.668 registros
  canônicos, 1.910 conflitos de nome bloqueados e 3.758 candidatos processados;
  nenhuma mensagem ou sequência criada.
- [x] `APPLY` auditável concluído: 3.758 contatos criados e classificados como
  `Gestão de Pessoas`, 2.096 evidências históricas preservadas, 1.642 eventos
  incorporados à timeline e 3.758 permissões registradas como `UNKNOWN`.
  Sequências, mensagens e tentativas de envio permaneceram em zero.
- [x] Prontidão de permissão consolidada no
  [`sales-reactivation-legitimate-interest-assessment.md`](sales-reactivation-legitimate-interest-assessment.md):
  os 3.758 contatos continuam em `UNKNOWN`; 2.220 trouxeram da fonte a indicação
  `LEGITIMATE_INTEREST` e 1.538 não trouxeram base. A indicação de origem não é
  aprovação: ambos os grupos permanecem bloqueados até decisão documentada do
  controlador, e nenhum evento `APPROVED` foi criado.
- [x] Dry-run do orquestrador sobre o CRM real revisado: 3.773 avaliados,
  nenhum elegível e nenhum envio; todos foram bloqueados por conteúdo ainda não
  aprovado, permissão ausente e curso não aprovado, além de 46 supressões e
  quatro registros excluídos detectados pelos gates adicionais.
- [x] Evento sintético autenticado validou `Send`, `Bounce` e `Unsubscribe` na
  timeline produtiva, supressão e três alertas Telegram; os leads de teste foram
  desativados e os controles voltaram a `DRY_RUN` com kill switch ligado.
- [x] Migration `20260919210000_skip_imported_terminal_notifications.sql`
  aplicada após o dry-run revelar 46 alertas indevidos de bounces históricos;
  timeline e supressões foram preservadas, a outbox histórica foi limpa e o
  teste de regressão passou na suíte de 266 testes de banco.
- [x] Transporte real SES/Locaweb confirmado somente com a caixa corporativa:
  a mensagem técnica aceita pelo SES chegou à inbox como UID 15.794 com
  `Message-ID` do Amazon SES; a Locaweb aceitou a resposta SMTP para a própria
  caixa como UID 15.797 e o coletor IMAP a examinou no ciclo seguinte,
  avançando o checkpoint então vigente de 15.796 para 15.797. Como o envio
  técnico original não foi criado pelo orquestrador e não possuía sequência
  ativa no CRM, a ingestão rejeitou a
  correlação de forma fail-closed. O caminho correlacionado `REPLIED`, a
  interrupção e o alerta Telegram já haviam sido validados pelo evento sintético
  autenticado. Nenhum contato importado recebeu mensagem.
- [ ] Primeiro lote real explicitamente aprovado; schedule permanece desligado até a conferência.

## Ordem obrigatória e autorização vigente

Em 19/09/2026, o responsável concedeu autorização geral para concluir as ações
necessárias deste projeto sem novas confirmações repetitivas. Essa autorização
permite infraestrutura, importação, dry-runs, testes sintéticos, versionamento e
publicação das correções. Ela não remove os gates fail-closed, não transforma
permissão `UNKNOWN` em consentimento e não permite contornar o sandbox do SES.

1. Preservar o relatório pós-`APPLY` e conferir os totais antes de qualquer envio.
2. Executar e revisar o dry-run do orquestrador por reason code.
3. Validar inbox, reply, descadastro, bounce e Telegram com contato sintético.
4. Aguardar `ProductionAccessEnabled=true` na região `sa-east-1`.
5. Somente com permissão comercial aprovada, liberar lote manual pequeno.
6. Conferir timeline, métricas, supressões e DLQs antes de habilitar o schedule.

## Critérios de rollback

- Qualquer inconsistência liga `pause`/kill switch antes da investigação.
- Schedule EventBridge permanece `DISABLED` até o último gate.
- Tentativa `AMBIGUOUS` nunca é reenviada automaticamente.
- Supressões e interações importadas não são removidas para forçar elegibilidade.
- Lote de importação incompleto permanece `OPEN` e pode ser repetido com o mesmo digest;
  payload divergente para a mesma chave é rejeitado.
- Rollback de código usa a versão anterior mantendo automação e schedule desabilitados.
