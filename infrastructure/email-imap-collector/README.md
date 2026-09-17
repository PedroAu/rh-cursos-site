# Coletor IMAP de respostas

Lambda Node.js agendada pelo EventBridge Scheduler. Ela consulta somente
cabeçalhos da caixa Locaweb, normaliza respostas e envia os eventos ao endpoint
interno do CRM. O corpo da mensagem nunca é baixado nem persistido.

## Segredo exigido

Crie previamente um segredo JSON no AWS Secrets Manager. Não registre o valor no
repositório:

```json
{
  "host": "email-ssl.com.br",
  "port": 993,
  "secure": true,
  "user": "pedro@rhcursos.com.br",
  "password": "senha-da-caixa",
  "endpointUrl": "https://www.rhcursos.com.br/api/internal/email/imap-events",
  "webhookSecret": "mesmo-valor-de-IMAP_EVENTS_WEBHOOK_SECRET-no-site",
  "rejectUnauthorized": true
}
```

`webhookSecret` deve ter pelo menos 32 caracteres. Mantenha
`rejectUnauthorized=true`. Use `servername` apenas se o hostname de conexão e o
nome presente no certificado TLS forem diferentes e essa diferença tiver sido
confirmada pela Locaweb.

Para esta conta, os registros MX apontam para a Locaweb e o endpoint IMAPS
`email-ssl.com.br:993` apresentou certificado válido para `email-ssl.com.br` em
2026-09-17. Evite `imap.rhcursos.com.br`: ele resolve para a mesma infraestrutura,
mas não consta no certificado TLS apresentado.

## Verificação local

```bash
npm ci
npm run verify
```

O build gera `dist/handler.mjs`, que é o `CodeUri` do template SAM.

## Deploy seguro

O agendamento nasce `DISABLED`. Primeiro publique e invoque manualmente em
homologação; confirme o checkpoint e os eventos sintéticos no CRM. Somente então
atualize a stack com `ScheduleState=ENABLED`.

```bash
npm ci
npm run verify
sam validate --lint --template-file template.yaml
sam deploy --guided --parameter-overrides \
  CollectorSecretArn=arn:aws:secretsmanager:sa-east-1:ACCOUNT:secret:SECRET \
  ScheduleState=DISABLED
```

Na primeira execução, o coletor pesquisa os últimos 15 dias. Ao terminar esse
bootstrap, ele avança para leitura incremental por UID. O DynamoDB preserva UID
validity, último UID e modo do checkpoint. Respostas `400/422` do CRM são
consideradas rejeições definitivas e avançam o checkpoint; falhas de rede,
autenticação, limite ou `5xx` mantêm o UID para nova tentativa.

## Operação

- Concorrência reservada: 1, impedindo duas leituras simultâneas da caixa.
- Timeout: 50 segundos; lote padrão: 50 mensagens.
- Retenção de logs: 30 dias.
- Checkpoint e DLQ usam `DeletionPolicy: Retain`.
- Alarmes: erros, throttles, duração p99 e mensagens na DLQ.
- Kill switch: defina a concorrência reservada como 0 ou desabilite o schedule.
