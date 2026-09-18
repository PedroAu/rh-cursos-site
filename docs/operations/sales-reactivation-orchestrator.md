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
4. Em `LIVE`, o banco revalida permissão, curso, supressão, recência e kill switches.
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

Essas métricas são descritivas. Abertura pode ser afetada por proteção de
privacidade, e nenhuma diferença deve ser tratada como causal sem experimento.

## Primeiro lote

1. Aplicar a migração no projeto isolado e repetir pgTAP.
2. Implantar Lambda com `ScheduleState=DISABLED`, `RunMode=DRY_RUN` e chat permitido `0`.
3. Aprovar conteúdo e cadastrar evidências de permissão somente após revisão jurídica/operacional.
4. Executar dry-run, exportar reason codes e revisar a coorte manualmente.
5. Validar identidade SES, SPF/DKIM/DMARC e Configuration Set.
6. Usar um contato sintético para testar inbox, reply-to Locaweb, descadastro, bounce e Telegram.
7. Registrar a aprovação do conteúdo, coorte, janela e volume inicial.
8. Alterar o allowlist do chat para o ID privado confirmado.
9. Ativar controle/campanha, publicar `RunMode=LIVE` ainda com schedule desligado.
10. Executar `run-batch --confirm-live --discover` em um lote manual pequeno;
    conferir coorte, timeline e métricas.
11. Só depois habilitar o schedule.

## Incidente e rollback

1. Execute `pause`; isso liga o kill switch de forma auditável.
2. Desabilite o EventBridge Scheduler.
3. Não reenvie tentativa `AMBIGUOUS`; confira o SES e a caixa primeiro.
4. Preserve outbox, DLQ, logs, decisões e attempts.
5. Não remova supressão nem reative sequência interrompida automaticamente.
6. Para rollback de código, publique a versão anterior mantendo schedule desabilitado.

## Evidência mínima de fechamento

- `npm run verify:sales-reactivation`
- `npm run test:db`
- `npm run docs:api:lint && npm run docs:api:check-drift`
- `cfn-lint infrastructure/sales-reactivation-orchestrator/template.yaml`
- build de produção do site
- validação isolada de dry-run; nenhuma chamada real aos provedores
