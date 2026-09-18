# Operação do time autônomo de reativação

## Escopo

Este runbook cobre a reativação por e-mail dos contatos elegíveis para:

1. Curso Prático de Atualização do eSocial: Novo Leiaute 1.3 para Órgãos Públicos
2. Auditoria da Folha de Pagamento
3. Inteligência Artificial na Execução Orçamentária

O CRM e o event store são as fontes oficiais. “Gestão de Pessoas” é uma
classificação temática e nunca substitui permissão comercial ou base legal.

## Fluxo operacional

1. Uma execução manual com `--discover` lê controles, campanha e candidatos no Supabase.
2. O policy engine registra `ELIGIBLE` ou `REJECTED` com reason codes.
3. Em `DRY_RUN`, nenhuma sequência, mensagem SES ou notificação Telegram é criada.
4. Em `LIVE`, a sequência preserva um snapshot imutável do curso aprovado e o
   banco revalida permissão, destinatário, curso atual, supressão e kill switches
   imediatamente antes do SES.
5. Passos vencidos são reservados por claim/lease e enviados pelo SES.
6. Eventos SES, descadastro e respostas IMAP alimentam a mesma timeline.
7. Eventos terminais interrompem a sequência; a outbox notifica o Telegram privado.
8. O agendamento não descobre novos contatos: ele processa somente sequências já
   materializadas, evitando ampliar a coorte sem nova revisão.

## Estados que bloqueiam envio

- `enabled=false`, `dry_run=true` ou `kill_switch=true` no controle global.
- campanha diferente de `ACTIVE` ou conteúdo diferente de `APPROVED`.
- e-mail inválido, permissão ausente/bloqueada/expirada ou finalidade divergente.
- curso ausente ou fora da lista versionada.
- supressão, sequência já processada ou interação dentro dos últimos 15 dias.
- fora da janela de envio, limite diário/lote excedido ou tentativa ambígua anterior.

## Comandos

Execute no pacote `infrastructure/sales-reactivation-orchestrator` após `npm run build`:

```bash
npm run cli -- status
npm run cli -- dry-run
npm run cli -- pause
```

`resume` e `run-batch` exigem `--confirm-live`; `resume` também exige uma
referência de aprovação. A mudança de estado é gravada em
`sales_orchestrator_control_event`. Esses comandos não devem ser executados sem
autorização explícita. Acrescente `--discover` ao `run-batch` somente para a
inclusão controlada da coorte revisada; sem essa opção, nenhum contato novo entra.

## Métricas e interpretação

- `eligible` e `rejected`: decisões do policy engine na coorte avaliada.
- `rejectedByReason`: contagem por bloqueio; uma pessoa pode aparecer em mais de um motivo.
- `sent`, `delivered`, `opened`, `clicked`, `replied`: eventos observados na timeline.
- `bounced`, `complained`, `unsubscribed`: sinais de risco e supressão.
- `interruptedSequences`: sequências paradas por evento terminal.
- `toolFailures`: falhas técnicas; não representam rejeição do contato.
- `sentByStep`: envios observados nos passos 0, 1 e 2 da versão consultada.
- `positiveReplies`: permanece `null` enquanto não houver classificação humana
  explícita; o sistema não infere intenção positiva a partir de uma resposta.
- `costEstimate`: faixa do custo-base SES em USD, calculada pelo volume enviado e
  pelos extremos públicos de US$ 0,10–0,23 por mil mensagens verificados em
  18/09/2026. Não inclui dados, anexos, VDM, IP dedicado, Global Endpoints nem
  impostos; antes da ativação, confirmar o plano real da conta em
  <https://aws.amazon.com/ses/pricing/>.

Essas métricas são descritivas. Abertura pode ser afetada por proteção de
privacidade, eventos podem ocorrer mais de uma vez, e nenhuma diferença deve ser
tratada como causal sem experimento. A projeção administrativa usa uma janela
móvel de 30 dias e preserva campanha, versão, policy, template e período.

## Planejamento das bases de contatos

Antes de qualquer escrita no CRM, execute o planejador local somente leitura.
Ele aceita uma exportação atual do CRM e uma ou mais bases, reconhece os schemas
HubSpot/site/leads, preserva cabeçalhos duplicados por posição, normaliza e-mail,
deduplica somente por e-mail exato e usa telefone apenas como sinal de revisão.
O relatório é agregado: não imprime nome, e-mail, telefone ou linhas de contato.

```bash
npm run sales:contacts:plan -- \
  --crm-file /caminho/contatos-exportado-site.csv \
  --reference-date 2026-09-18T12:00:00-03:00 \
  --inactive-days 15 \
  /caminho/base-hubspot-1.csv \
  /caminho/base-hubspot-2.csv \
  /caminho/leads.csv
```

O resultado nunca autoriza envio e não grava um arquivo intermediário com PII.
`MISSING_CONTACT_PERMISSION`, `SUPPRESSED_SOURCE_EVIDENCE`,
`RECENT_SOURCE_INTERACTION` e `SOURCE_HISTORY_DATE_UNKNOWN` bloqueiam o registro.
`REQUIRES_CRM_HISTORY_CHECK` significa apenas que o arquivo não trouxe um bloqueio:
o e-mail ainda precisa ser confrontado com o CRM/event store produtivo e passar
pela policy fail-closed. Conflitos de nome, telefone ou organização devem ser
revisados; o importador não sobrescreve silenciosamente o cadastro oficial.

Depois que a migration do pipeline estiver aplicada, a comparação com o CRM
produtivo usa RPCs `service_role` e começa obrigatoriamente em `DRY_RUN`. Esse
modo grava somente hashes, ações e reason codes para auditoria; não cria nem
altera leads, permissões ou sequências. A execução é uma ação externa e requer
autorização explícita, mesmo em dry-run:

```bash
npm run sales:contacts:import -- \
  --mode dry-run \
  --source-label bases-comerciais-2026-09 \
  /caminho/base-hubspot-gestao-pessoas.csv \
  /caminho/base-hubspot-departamento-pessoal.csv \
  /caminho/leads.csv
```

O modo `APPLY` exige simultaneamente `--approval-reference` com referência
auditável e `--confirm-apply APPLY_CONTACTS_TO_CRM`. Ele cria somente contatos
inexistentes, preserva PII de contatos já presentes, classifica o segmento em
tabela própria e registra a base legal importada como `UNKNOWN`; nunca como
`APPROVED`. Eventos históricos de e-mail com tipo e data conhecidos entram na
timeline. Evidência sem data bloqueia a elegibilidade indefinidamente. Conflito
de nome e endereço marcado como inválido pelo provedor são bloqueados localmente;
conflitos de organização ou telefone são omitidos em vez de sobrescrever dados.
Nenhum modo cria sequência de reativação ou envia mensagem.

## Primeiro lote

1. Gerar o plano agregado das bases e revisar duplicidades, conflitos, histórico e base legal.
2. Comparar candidatos com o CRM/event store produtivo; não importar ou reativar por classificação temática.
3. Aplicar a migração no projeto isolado e repetir pgTAP.
4. Implantar Lambda com `ScheduleState=DISABLED`, `RunMode=DRY_RUN` e chat permitido `0`.
5. Aprovar conteúdo e cadastrar evidências de permissão somente após revisão jurídica/operacional.
6. Executar dry-run, exportar reason codes e revisar a coorte manualmente.
7. Validar identidade SES, SPF/DKIM/DMARC e Configuration Set.
8. Usar um contato sintético para testar inbox, reply-to Locaweb, descadastro, bounce e Telegram.
9. Registrar a aprovação do conteúdo, coorte, janela e volume inicial.
10. Alterar o allowlist do chat para o ID privado confirmado.
11. Ativar controle/campanha, publicar `RunMode=LIVE` ainda com schedule desligado.
12. Executar `run-batch --confirm-live --discover` em um lote manual pequeno;
    conferir coorte, timeline e métricas.
13. Só depois habilitar o schedule.

## Incidente e rollback

1. Execute `pause`; isso liga o kill switch de forma auditável.
2. Desabilite o EventBridge Scheduler.
3. Não reenvie tentativa `AMBIGUOUS`; confira o SES e a caixa primeiro.
4. Preserve outbox, DLQ, logs, decisões e attempts.
5. Não remova supressão nem reative sequência interrompida automaticamente.
6. Para rollback de código, publique a versão anterior mantendo schedule desabilitado.

## Evidência mínima de fechamento

- `npm run verify:sales-reactivation`
- `npm run sales:contacts:plan -- --crm-file <export.csv> <bases.csv...>`
- `npm run sales:contacts:import -- --mode dry-run <bases.csv...>` (somente após autorização)
- `npm run test:db`
- o gate de banco inclui corrida real de dois lotes sobre o mesmo e-mail
- `npm run docs:api:lint && npm run docs:api:check-drift`
- `cfn-lint infrastructure/sales-reactivation-orchestrator/template.yaml`
- build de produção do site
- validação isolada de dry-run; nenhuma chamada real aos provedores
