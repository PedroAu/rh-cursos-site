# Checklist de go-live — time autônomo de vendas

Atualizado em 18/09/2026. Este documento é operacional: um item só pode ser
marcado quando houver evidência observável do ambiente correspondente.

## Estado preparado localmente

- [x] Timeline append-only de interações por e-mail, SES e IMAP.
- [x] Orquestrador 0/5/10 com policy fail-closed, idempotência, limites e kill switch.
- [x] Outbox e cliente Telegram com chat privado permitido.
- [x] Status administrativo e métricas agregadas sem PII.
- [x] Planejador agregado das quatro bases.
- [x] Gate de importação service-role com `DRY_RUN` e dupla confirmação para `APPLY`.
- [x] Concorrência real de importação: um `CREATED`, um `EXISTING`, um único lead.
- [x] Lint, typecheck, build de produção, 916 testes unitários, 265 testes SQL,
  testes concorrentes, worker e OpenAPI aprovados.
- [x] Nenhuma chamada real a SES/Telegram e nenhum contato importado.

## Estado externo ainda pendente

- [ ] Mac desbloqueado e sessão AWS renovada.
- [ ] Sessão Supabase CLI renovada para o projeto `hwpsrujkxjhmmwphqdlz`.
- [ ] Commits locais enviados à PR #30; o branch remoto ainda está em `bfcfb9e`.
- [ ] CI remoto executado sobre os commits atuais; o E2E vermelho ainda pertence ao código remoto antigo.
- [ ] PR atualizada com a branch base e revisada antes do merge.
- [ ] Migration `20260918130000_contact_import_pipeline.sql` aplicada em produção.
- [ ] Secrets Cloudflare `EMAIL_UNSUBSCRIBE_SECRET` e `SES_EVENTS_WEBHOOK_SECRET` configurados.
- [ ] Identidade SES `pedro@rhcursos.com.br` e DKIM/SPF/DMARC verificados.
- [ ] Conta SES fora do sandbox ou destinatários sintéticos verificados para o teste.
- [ ] Configuration Set e destino de eventos SES confirmados.
- [ ] ID numérico do chat privado do Telegram confirmado; `@rhcursos_bot` não substitui o chat ID.
- [ ] Stack AWS implantada com schedule `DISABLED`, `RunMode=DRY_RUN` e allowlist de chat segura.
- [ ] Dry-run produtivo da importação das três bases externas concluído e revisado.
- [ ] `APPLY` da importação explicitamente aprovado e executado, se o dry-run for aceito.
- [ ] Dry-run do orquestrador sobre o CRM real revisado por reason code.
- [ ] Contato sintético validou inbox, reply Locaweb, descadastro, bounce e Telegram.
- [ ] Primeiro lote real explicitamente aprovado; schedule permanece desligado até a conferência.

## Ordem obrigatória e autorizações

1. **Autorização de push:** publicar os commits locais no branch da PR. Não mescla nem implanta.
2. Aguardar CI remoto completo e corrigir qualquer regressão.
3. Atualizar a PR com `main`, repetir CI e revisão.
4. **Autorização de merge:** mesclar somente com todos os gates verdes.
5. Renovar AWS e Supabase; inspecionar estado real sem escrita.
6. **Autorização de infraestrutura:** aplicar migrations e implantar a stack ainda desativada/dry-run.
7. Configurar os dois secrets Cloudflare faltantes e validar os nomes pelo gate existente.
8. Confirmar SES, Telegram e alarmes com dados sintéticos.
9. **Autorização de dry-run produtivo:** comparar as 2.731 entradas seguras com o CRM real.
10. Revisar duplicidades, histórico, supressões, base legal e conflitos; não aprovar em massa.
11. **Autorização de importação:** executar `APPLY_CONTACTS_TO_CRM` com referência auditável.
12. Executar dry-run do orquestrador; nenhum envio é permitido nesta etapa.
13. **Autorização do primeiro envio:** liberar um lote manual pequeno, conferir timeline e métricas.
14. Somente depois de nova revisão, autorizar o schedule recorrente.

Cada autorização vale apenas para a etapa nomeada. Push não autoriza merge; merge
não autoriza deploy; deploy não autoriza importação; importação não autoriza envio;
primeiro lote não autoriza o schedule recorrente.

## Critérios de rollback

- Qualquer inconsistência liga `pause`/kill switch antes da investigação.
- Schedule EventBridge permanece `DISABLED` até o último gate.
- Tentativa `AMBIGUOUS` nunca é reenviada automaticamente.
- Supressões e interações importadas não são removidas para forçar elegibilidade.
- Lote de importação incompleto permanece `OPEN` e pode ser repetido com o mesmo digest;
  payload divergente para a mesma chave é rejeitado.
- Rollback de código usa a versão anterior mantendo automação e schedule desabilitados.
