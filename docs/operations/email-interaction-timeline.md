# Linha do tempo de interações de e-mail — runbook

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

## Amazon SES

1. No configuration set usado pelo envio, habilitar os eventos `Send`,
   `Delivery`, `Open`, `Click`, `Bounce` e `Complaint` para o EventBridge.
2. Criar regra do EventBridge limitada ao configuration set e à identidade SES
   da RH Cursos.
3. Configurar um API Destination HTTPS apontando para
   `POST /api/webhooks/ses`, incluindo o header `x-rh-webhook-secret`.
4. O envio deve registrar tags SES `lead_id`, `sequence_id`,
   `sequence_step_id` e `rfc_message_id`. Apenas o primeiro evento `Send` pode
   criar o vínculo; os demais eventos exigem `provider_message_id` já conhecido.
5. Validar primeiro em ambiente de teste. Reentregas são esperadas e convergem
   pela chave de idempotência no banco.

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
retries, DLQ, retenção de logs e alarmes. Antes da ativação ainda é necessário
criar o segredo no Secrets Manager, publicar a stack em homologação, executar o
smoke test manual e confirmar os eventos na timeline. A cadência não deve ser
ativada antes desses passos.

## Descadastro

O link deve carregar um token assinado gerado por `createUnsubscribeToken` e
enviar `POST /api/email/unsubscribe?token=...`. A transação grava
`UNSUBSCRIBED`, ativa a supressão e cancela passos pendentes antes de responder.
Tokens repetidos são idempotentes; tokens expirados ou adulterados falham.

## Ordem de entrega ao DevOps

1. Backup lógico e validação das migrations pendentes.
2. Aplicar `20260916120000_lead_email_interaction_timeline.sql` em homologação.
3. Executar testes pgTAP, unitários, typecheck e build.
4. Configurar secrets server-side.
5. Publicar a aplicação e a stack do coletor com `ScheduleState=DISABLED`.
6. Validar BFF, timeline e uma invocação manual do coletor em homologação.
7. Ativar EventBridge do SES; habilitar o schedule IMAP somente depois da homologação.

Rollback antes de eventos reais: remover os cinco objetos criados pela migration
em ordem de dependência. Depois de eventos reais, não apagar o event store: fazer
rollback apenas da aplicação/regras externas e preservar a trilha para auditoria.
