# Checklist de go-live — time autônomo de vendas

Atualizado em 21/09/2026. Este documento é operacional: um item só pode ser
marcado quando houver evidência observável do ambiente correspondente.

## Estado preparado localmente

- [x] Timeline append-only de interações por e-mail, SES e IMAP.
- [x] Orquestrador 0/5/10 com policy fail-closed, idempotência, limites e kill switch.
- [x] Outbox e cliente Telegram com chat privado permitido.
- [x] Status administrativo e métricas agregadas sem PII.
- [x] Planejador agregado das quatro bases.
- [x] Gate de importação service-role com `DRY_RUN` e dupla confirmação para `APPLY`.
- [x] Concorrência real de importação: um `CREATED`, um `EXISTING`, um único lead.
- [x] Lint, typecheck, build de produção, 934 testes unitários, 293 testes SQL,
  testes concorrentes, worker e OpenAPI aprovados. Evidência vigente: PR #38,
  execução CI `35493069786`, iniciada em `2026-09-20T06:00:03Z` sobre o SHA
  `5e953c7` e mesclada no commit `e462e2a`.
- [x] Auditoria de dependências sem vulnerabilidade crítica; Next.js atualizado
  para 16.3.5 e Sharp consolidado em 0.35.4 antes da publicação da PR.
- [x] Teste real do Telegram entregue no chat privado autorizado; antes do
  piloto, o SES também aceitou uma única mensagem técnica destinada ao próprio
  `pedro@rhcursos.com.br`.
- [x] Push em `main` executa validação, mas migrations e deploys produtivos
  exigem `workflow_dispatch` explícito; merge e produção permanecem gates separados.

## Estado externo e operacional

- [x] Sessão AWS administrativa renovada e perfil `rhcursos` validado sem expor
  credenciais; a sessão técnica anterior permanece separada.
- [x] Sessão Supabase CLI renovada; projetos de produção
  `hwpsrujkxjhmmwphqdlz` e teste `rajjoakjkmmzcwtabuxx` inspecionados sem escrita.
- [x] Histórico de 18/09/2026: commits locais enviados à PR #30; o branch remoto
  estava em `17dba96`.
- [x] Histórico de 18/09/2026: CI remoto totalmente verde no SHA `17dba96`:
  Static Checks, Unit Tests,
  Build & A11y, API Docs, Performance Budgets, Secret Scanning, DB Tests e E2E
  passaram. Com autorização específica, `admin-resources` do projeto
  `site-teste` foi atualizado da versão 16 para 17; os três fontes publicados
  (`index.ts`, validação e mappers) foram comparados com o repositório e o E2E
  isolado concluiu em 6m03s. Produção não foi alterada.
- [x] Histórico de 18/09/2026: PR #30 revisada, com todos os gates verdes,
  mesclada em `main` no commit
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
- [x] Conta SES fora do sandbox na região `sa-east-1`. O caso
  `178957960700508` está em `GRANTED` e a consulta autoritativa de 20/09/2026
  nessa mesma região confirmou
  `ProductionAccessEnabled=true`, `SendingEnabled=true`, enforcement `HEALTHY`,
  limite de 50.000 mensagens/dia e 14 mensagens/segundo. A supressão global da
  conta permanece ativa para `BOUNCE` e `COMPLAINT`.
- [x] Estado atual do Configuration Set inspecionado: `rhub-email-events` publica
  via SNS para um endpoint Vercel legado.
- [x] Novo caminho SES → EventBridge → API Destination → Cloudflare implantado
  e autenticado, com DLQ vazia, conexão `AUTHORIZED` e destino `ACTIVE`. Em
  21/09/2026, a stack foi atualizada removendo somente o predicado redundante
  `resources`; os filtros exatos de remetente e Configuration Set foram
  preservados. Um único envio para o Mailbox Simulator oficial do SES produziu
  dois disparos da regra e duas invocações, sem falha ou envio à DLQ. A timeline
  do lead sintético registrou `SENT` e `DELIVERED`; o lead foi desativado após o
  teste e não houve supressão nem notificação terminal.
- [x] Extensão mínima do papel `rhcursos-email-deployer` aplicada e versionada,
  incluindo tags do Configuration Set e leituras necessárias aos gates SES.
- [x] ID numérico do chat privado confirmado e teste entregue pelo
  `@rhcursos_bot` sem expor token.
- [x] Stack `rhcursos-email-sales-reactivation` implantada com schedule
  `DISABLED`, `RunMode=DRY_RUN`, lote 5 e allowlist de chat `0`.
- [x] Auditoria externa de 20/09/2026 confirmou a stack em `UPDATE_COMPLETE`,
  Scheduler `DISABLED` a cada cinco minutos, função ativa com timeout de 120
  segundos e as DLQs do orquestrador e dos eventos SES vazias. Evidência:
  inspeções read-only de `rhcursos-email-sales-reactivation`, do schedule
  `SalesReactivationFunctionOrchestratorSchedule`, da configuração Lambda e dos
  atributos das filas via AWS CLI, perfil administrativo `rhcursos`, região
  `sa-east-1`, em 20/09/2026. Identidade, DKIM e MAIL FROM estão em `SUCCESS`;
  o destino EventBridge do Configuration Set está habilitado para `SEND`,
  `DELIVERY`, `OPEN`, `CLICK`, `BOUNCE` e `COMPLAINT`.
- [x] Gate de secrets do Cloudflare confirmou os seis nomes obrigatórios; a API
  do Telegram confirmou o bot `@rhcursos_bot` e a presença do chat privado no
  segredo, sem expor token ou identificador. Evidências separadas de 20/09/2026:
  `npm run check:workers:secrets` para o worker `site-rh-cursos`; chamada
  read-only `getMe` da Bot API com o segredo do AWS Secrets Manager e validação
  de presença do chat configurado.
- [x] Estado anterior de 19/09/2026: coletor Locaweb IMAP confirmado saudável a
  cada minuto, com checkpoint preservado no UID 15.793; quatro mensagens antigas
  da DLQ, originadas antes da correção do bundle, foram removidas após a
  conferência dos logs e o alarme da fila retornou a `OK`.
- [x] Revalidação de 20/09/2026 confirmou o recurso Scheduler do coletor IMAP
  `ImapCollectorFunctionPollSchedule` em `ENABLED` a cada minuto, execuções
  `LIVE` concluídas sem erro, checkpoint UID 15.800 e DLQ vazia.
- [x] Dry-run produtivo das quatro bases concluído: 6.913 linhas, 5.668 registros
  canônicos, 1.910 conflitos de nome bloqueados e 3.758 candidatos processados;
  nenhuma mensagem ou sequência criada.
- [x] `APPLY` auditável concluído: 3.758 contatos criados e classificados como
  `Gestão de Pessoas`, 2.096 evidências históricas preservadas, 1.642 eventos
  incorporados à timeline e 3.758 permissões registradas como `UNKNOWN`.
  Sequências, mensagens e tentativas de envio permaneceram em zero.
- [x] Retrato anterior à decisão de coorte, consolidado no
  [`sales-reactivation-legitimate-interest-assessment.md`](sales-reactivation-legitimate-interest-assessment.md):
  em 19/09/2026, os 3.758 contatos estavam em `UNKNOWN`; 2.220 traziam da fonte
  a indicação `LEGITIMATE_INTEREST` e 1.538 não traziam base. Esse retrato foi
  sucedido pela decisão auditável de 20/09/2026, que aprovou 3.712 contatos e
  manteve as exclusões irrenunciáveis.
- [x] Retrato anterior à decisão de coorte, em 19/09/2026: o dry-run do
  orquestrador avaliou 3.773 registros do CRM, não encontrou elegíveis e não
  enviou mensagens; conteúdo e permissão ainda não estavam aprovados. Esse
  resultado histórico foi sucedido pelo dry-run final de 20/09/2026 e não deve
  ser usado para decidir o primeiro lote.
- [x] Evento sintético autenticado validou `Send`, `Bounce` e `Unsubscribe` na
  timeline produtiva, supressão e três alertas Telegram; os leads de teste foram
  desativados e os controles voltaram a `DRY_RUN` com kill switch ligado.
- [x] Migration `20260919210000_skip_imported_terminal_notifications.sql`
  aplicada após o dry-run revelar 46 alertas indevidos de bounces históricos;
  timeline e supressões foram preservadas, a outbox histórica foi limpa e o
  teste de regressão passou na suíte então vigente de 266 testes de banco.
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
- [x] Conteúdo e coorte do primeiro contato aprovados de forma auditável:
  decisão `e03171df-5180-43f4-a948-d45f226d734a`, digest
  `3efb06621efeffddba6b128e961ca87fe4fee96a1a03038eb0dbdd80f616e5b0`,
  3.712 contatos e `expires_at=2026-10-05T03:40:00Z`; nesse instante ou depois,
  uma nova decisão é obrigatória.
- [x] Retrato final do worker em 20/09/2026, concluído em aproximadamente 32
  segundos: 3.779 registros avaliados, 3.712 elegíveis e 67 rejeitados; a
  conferência no CRM confirmou zero sequências e zero mensagens da campanha.
  Evidência mais recente: run ID `a761ea97-ca9e-4ec9-ab12-169fb537f2b2`,
  executado de `2026-09-20T17:03:47Z` a `2026-09-20T17:04:19Z`; 3.779 decisões
  persistidas em modo `DRY_RUN`/`BLOCKED`, zero sequências, zero passos e zero
  tentativas. O run anterior `dc702aef-b7dc-4350-9a57-376102473562` permanece
  como evidência histórica consistente.
  A variação de 3.773 para 3.779 decorre de instantâneos em datas distintas do
  universo mais amplo e mutável do CRM; a base importada permanece reconciliada
  separadamente em 3.758. Este é o resultado mais recente, mas deve ser
  recalculado imediatamente antes de qualquer materialização.
- [x] Primeiro lote real executado manualmente após autorização explícita em
  20/09/2026. O preflight revalidou SES, janela, decisão, conteúdo, exclusões e
  limites; o dry-run imediato `78c406d0-ccb7-44b7-a881-5f4bfbc06dd5`
  confirmou 3.712 elegíveis. A materialização auditável
  `e6b05a12-b30f-4402-808a-8f61715f7c43` criou 3.712 sequências e não enviou
  mensagens. O lote `ff74788b-c8f3-492e-9269-bae77d9d5f06` processou e enviou
  exatamente 5 passos, sem falha de envio.
- [x] Observação do lote: o SES registrou 5 envios, 4 entregas, 1 bounce, zero
  complaint, zero reject e zero rendering failure. O CRM preserva 5 eventos
  `SENT`; o bounce foi correlacionado a partir da lista autoritativa de supressão
  da conta, persistido como `BOUNCED`, suprimiu o contato e interrompeu a
  sequência. O alerta correspondente foi entregue pelo runner
  `697c6fb0-b69f-4a38-afab-046be968a51e`; a outbox voltou a zero.
- [x] Encerramento fail-closed do piloto: campanha `PAUSED`, controle global com
  `enabled=false` e `kill_switch=true`, Scheduler `DISABLED`, Lambda em
  `DRY_RUN`, 3.711 sequências ativas, 1 interrompida, 3.707 passos pendentes e 5
  enviados. Nenhum novo e-mail pode sair nesse estado.
- [x] Telemetria automática pós-envio validada em 21/09/2026 com o Mailbox
  Simulator: `SENT` e `DELIVERED` foram correlacionados automaticamente no CRM,
  com duas invocações EventBridge, zero falhas e DLQ vazia. As quatro entregas
  históricas do primeiro lote continuam somente nas métricas agregadas do SES e
  não serão reconstruídas artificialmente. O schedule permanece `DISABLED` e a
  campanha pausada; esta validação técnica não autoriza novos envios reais.

## Ordem obrigatória e autorização vigente

Em 19/09/2026, o responsável concedeu autorização geral para concluir as ações
necessárias deste projeto sem novas confirmações repetitivas. Essa autorização
permite infraestrutura, importação, decisão de coorte por legítimo interesse,
dry-runs, testes sintéticos, versionamento e publicação das correções. Ela não
remove os gates fail-closed nem substitui a autorização explícita imediatamente
anterior ao primeiro envio real.

1. Preservar o relatório pós-`APPLY` e conferir os totais antes de qualquer envio.
2. Executar e revisar o dry-run do orquestrador por reason code.
3. Validar inbox, reply, descadastro, bounce e Telegram com contato sintético.
4. Consultar o estado autoritativo do SES na região `sa-east-1` imediatamente
   antes da transição para `LIVE` e exigir, na mesma resposta,
   `ProductionAccessEnabled=true`, `SendingEnabled=true` e enforcement
   `HEALTHY`; qualquer divergência mantém o sistema bloqueado.
5. Somente com permissão comercial aprovada, liberar lote manual pequeno.
6. Conferir timeline, métricas, supressões e DLQs antes de habilitar o schedule.
   O lote de 20/09/2026 concluiu essa observação com uma pendência: corrigir e
   validar a ingestão automática SES → EventBridge. Até lá, manter tudo pausado.

## Critérios de rollback

- Qualquer inconsistência liga `pause`/kill switch antes da investigação.
- Schedule EventBridge permanece `DISABLED` até o último gate.
- Tentativa `AMBIGUOUS` nunca é reenviada automaticamente.
- Supressões e interações importadas não são removidas para forçar elegibilidade.
- Lote de importação incompleto permanece `OPEN` e pode ser repetido com o mesmo digest;
  payload divergente para a mesma chave é rejeitado.
- Rollback de código usa a versão anterior mantendo automação e schedule desabilitados.
