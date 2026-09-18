# Linha do tempo de interações de e-mail — runbook

## Estado operacional em 17 de setembro de 2026

- Migration `20260916120000_lead_email_interaction_timeline.sql` aplicada em produção.
- Aplicação publicada no Cloudflare Worker, versão `0febab27-5a35-4dbe-8200-669139abc144`.
- Stack AWS `rhcursos-email-imap` em `UPDATE_COMPLETE`, com schedule habilitado a cada minuto.
- Bootstrap IMAP de 15 dias concluído: 6 mensagens examinadas, nenhuma correlacionada e nenhuma inválida; checkpoint incremental avançado para UID 15782.
- Execução incremental seguinte não encontrou novas mensagens; alarmes em `OK` e DLQ vazia.
- Nenhuma campanha de reativação ou envio comercial está ativa.

## Escopo desta entrega

Esta entrega cria, sem ativar disparos, o event store append-only, a interrupção
transacional de cadências, os receptores normalizados de SES/IMAP/descadastro, a
consulta administrativa e a timeline no detalhe do lead. A migration deve ser
aplicada antes da aplicação.

Nenhum corpo integral de e-mail é aceito pelos contratos. O event store guarda
somente resumo seguro, referência opaca e, quando disponível, hash SHA-256.

## Secrets server-side

Configurar no runtime, nunca no repositório ou com prefixo `NEXT_PUBLIC_`:

- `SUPABASE_SERVICE_ROLE_KEY`: usada apenas pelos receptores e BFF protegidos.
- `SES_EVENTS_WEBHOOK_SECRET`: autentica o API Destination do EventBridge.
- `IMAP_EVENTS_WEBHOOK_SECRET`: autentica o coletor IMAP normalizado.
- `EMAIL_UNSUBSCRIBE_SECRET`: assina tokens de descadastro com validade.
- Credenciais da Locaweb, URL do endpoint e o mesmo
  `IMAP_EVENTS_WEBHOOK_SECRET` ficam em um segredo JSON do AWS Secrets Manager
  consumido somente pela Lambda do coletor.

Gere cada segredo com pelo menos 32 bytes aleatórios e use valores distintos.

Antes de publicar o Worker, execute:

```bash
npm run check:workers:secrets
```

O gate consulta somente os nomes cadastrados no Cloudflare e nunca recupera ou
exibe valores. Na leitura de 18 de setembro de 2026, o Worker de produção ainda
não possuía `SES_EVENTS_WEBHOOK_SECRET` nem `EMAIL_UNSUBSCRIBE_SECRET`; portanto,
um novo deploy deve permanecer bloqueado até que o proprietário configure ambos.
Os endpoints correspondentes já falham de forma segura quando o segredo está
ausente.

## Amazon SES

O template `infrastructure/sales-reactivation-orchestrator/template.yaml` cria o
Configuration Set, o destino EventBridge, a Connection autenticada, a API
Destination, a regra, a DLQ retida e o alarme. A regra é limitada ao
Configuration Set, à identidade SES e ao remetente aprovados. Somente `Send`,
`Delivery`, `Open`, `Click`, `Bounce` e `Complaint` são publicados porque são os
seis tipos aceitos pelo receptor.

1. Cadastre o mesmo valor de `sesEventsWebhookSecret` do segredo JSON do
   orquestrador como `SES_EVENTS_WEBHOOK_SECRET` no Cloudflare.
2. Implante a stack ainda com `ScheduleState=DISABLED` e `RunMode=DRY_RUN`.
3. Confirme que a API Destination aponta para
   `POST https://www.rhcursos.com.br/api/webhooks/ses` e usa o header
   `x-rh-webhook-secret` sem revelar seu valor.
4. O envio deve registrar tags SES `lead_id`, `sequence_id`,
   `sequence_step_id` e `rfc_message_id`. Apenas o primeiro evento `Send` pode
   criar o vínculo; os demais eventos exigem `provider_message_id` já conhecido.
5. Validar primeiro em ambiente de teste. Reentregas são esperadas e convergem
   pela chave de idempotência no banco.

O ambiente AWS inspecionado em 18 de setembro de 2026 possuía um Configuration
Set legado (`rhub-email-events`) com destino SNS para um endpoint Vercel antigo.
Ele não substitui a rota versionada acima e não deve ser removido antes do teste
sintético e da confirmação de que nenhum emissor restante depende dele.

Ao rotacionar o segredo do webhook, atualizar Cloudflare primeiro e depois
atualizar a stack. CloudFormation não reaplica automaticamente uma referência
dinâmica quando apenas o valor do Secrets Manager muda.

O receptor aceita o contrato EventBridge `source=aws.ses`, limita o corpo a 64
KiB, rejeita evento desconhecido e nunca correlaciona por e-mail do destinatário.

## Locaweb IMAP

O endpoint interno `POST /api/internal/email/imap-events` recebe somente um
envelope normalizado com `Message-ID`, `In-Reply-To`, `References`, remetente,
destinatários, instante original, UID e mailbox. Campos extras, inclusive
`body` ou `html`, são rejeitados.

Correlação segue esta ordem:

1. `In-Reply-To`/`References` contra o RFC Message-ID da saída;
2. somente na ausência de vínculo, e-mail normalizado do remetente;
3. fallback só é aceito quando existe exatamente um lead e exatamente uma
   sequência ativa; ambiguidades são rejeitadas sem atribuição.

### Coletor AWS

O pacote `infrastructure/email-imap-collector` implementa uma Lambda Node.js
agendada pelo EventBridge Scheduler. Ela conecta por IMAPS/TLS, lê somente
cabeçalhos, mantém checkpoint de UID/UIDVALIDITY no DynamoDB e envia o envelope
normalizado ao endpoint. O bootstrap considera 15 dias e depois converge para
leitura incremental.

O template SAM nasce com o schedule `DISABLED`, concorrência reservada 1,
retries, DLQ, retenção de logs e alarmes. Na implantação atual, o segredo foi
configurado, a stack publicada, o bootstrap executado e o schedule habilitado
somente depois da validação do checkpoint, dos alarmes e da DLQ. Isso habilita
apenas a coleta de respostas; não ativa a cadência de envio.

## Descadastro

O link deve carregar um token assinado gerado por `createUnsubscribeToken` e
enviar `POST /api/email/unsubscribe?token=...`. A transação grava
`UNSUBSCRIBED`, ativa a supressão e cancela passos pendentes antes de responder.
Tokens repetidos são idempotentes; tokens expirados ou adulterados falham.

## Ordem de entrega ao DevOps

1. Backup lógico e validação das migrations pendentes.
2. Aplicar `20260916120000_lead_email_interaction_timeline.sql` em homologação.
3. Executar testes pgTAP, unitários, typecheck e build.
4. Configurar secrets server-side e confirmar `npm run check:workers:secrets`.
5. Publicar a aplicação e a stack do coletor com `ScheduleState=DISABLED`.
6. Validar BFF, timeline e uma invocação manual do coletor em homologação.
7. Ativar EventBridge do SES; habilitar o schedule IMAP somente depois da homologação.

Rollback antes de eventos reais: remover os cinco objetos criados pela migration
em ordem de dependência. Depois de eventos reais, não apagar o event store: fazer
rollback apenas da aplicação/regras externas e preservar a trilha para auditoria.
