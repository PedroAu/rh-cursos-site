# Orquestrador de reativação comercial

Lambda Node.js agendada pelo EventBridge Scheduler. Ela avalia a elegibilidade
no CRM, materializa a cadência 0/5/10, envia pelo Amazon SES e entrega alertas
operacionais ao chat privado do Telegram. O pacote compartilha o policy engine e
os templates do site; a migração revalida os guardrails dentro do banco antes de
cada envio.

## Estado seguro inicial

- `ScheduleState=DISABLED` no template SAM.
- `RunMode=DRY_RUN` no template e no parser de configuração.
- `CampaignKey=reactivation-v1` por padrão; a prospecção usa explicitamente
  `CampaignKey=prospecting-v1`.
- Banco com `enabled=false`, `dry_run=true` e `kill_switch=true`.
- Campanha `reactivation-v1` com status `DISABLED` e conteúdo `DRAFT`.
- Lote padrão de 5 e limite diário inicial de 25.

Construir ou implantar a stack não habilita disparos. A ativação exige a revisão
do dry-run, aprovação do conteúdo, identidade SES verificada, teste de inbox,
descadastro, resposta e Telegram, além de autorização humana explícita.

## Segredo exigido

Crie um segredo JSON no AWS Secrets Manager, sem registrar valores no repositório:

```json
{
  "supabaseUrl": "https://PROJECT.supabase.co",
  "supabaseServiceRoleKey": "valor-secreto",
  "unsubscribeSecret": "minimo-32-caracteres",
  "sesEventsWebhookSecret": "outro-valor-minimo-32-caracteres",
  "publicBaseUrl": "https://www.rhcursos.com.br",
  "telegramBotToken": "valor-do-BotFather",
  "telegramChatId": "-1000000000000"
}
```

O `telegramChatId` deve ser o identificador numérico do chat privado autorizado;
o nome `@rhcursos_bot` não substitui esse ID. Não use token, chave de serviço ou
e-mail completo em logs. `unsubscribeSecret` e `sesEventsWebhookSecret` devem
ser diferentes. O segundo valor também deve ser cadastrado no Cloudflare como
`SES_EVENTS_WEBHOOK_SECRET`; o template o lê do Secrets Manager por referência
dinâmica e não grava o valor no repositório ou nos parâmetros da stack.

## Verificação local

```bash
npm ci
npm run verify
sam validate --lint --template-file template.yaml
```

Os testes usam stores e provedores falsos. Eles não acessam SES, Telegram,
Supabase remoto ou a base real.

## Permissão do implantador

O arquivo `deployer-policy-extension.json` contém somente as permissões novas
necessárias para o papel existente `rhcursos-email-deployer` criar o
Configuration Set, aplicar/remover as tags da stack e criar a Connection da API
Destination. Ele restringe SES ao nome
`rh-cursos-transactional`, restringe o service-linked role ao serviço oficial
`apidestinations.events.amazonaws.com` e restringe os segredos auxiliares ao
prefixo `events!connection/` criado pelo próprio EventBridge.
As permissões globais de SES presentes no arquivo são somente leituras de
status da conta, cota e identidade, usadas pelos gates de entrada em produção.
O pedido formal de saída do sandbox deve usar uma permissão temporária e
auditável; `ses:PutAccountDetails` não permanece no papel de deploy.

Aplicar essa extensão altera permissões da conta e exige autorização explícita.
Não anexar `AmazonEventBridgeFullAccess`: o papel já possui as ações EventBridge
necessárias e a extensão documenta apenas as dependências que faltam.

## CLI

Depois do build, com credenciais AWS somente para ler o segredo:

```bash
npm run cli -- status
npm run cli -- dry-run
npm run cli -- pause
```

Os comandos que podem gerar ação externa exigem confirmação adicional:

```bash
npm run cli -- resume --confirm-live --approval=REFERENCIA_DA_APROVACAO
npm run cli -- run-batch --confirm-live
npm run cli -- run-batch --confirm-live --discover
```

`resume` só remove o kill switch; a campanha e o conteúdo também precisam estar
ativos/aprovados no CRM. Não execute esses comandos sem a autorização explícita
do responsável. `--discover` é a única forma de incluir novos contatos na
campanha; o agendamento processa apenas sequências já materializadas. Assim, uma
mudança futura na base não amplia silenciosamente a coorte aprovada.

Antes de qualquer claim em modo `LIVE`, o worker chama `ses:GetAccount` e exige
`ProductionAccessEnabled=true` na região configurada. O sandbox bloqueia a
execução antes de qualquer sequência, tentativa ou envio.

O timeout da função é de 120 segundos para permitir que o `DRY_RUN` percorra a
base importada completa. As decisões da simulação são persistidas em lotes de até
`CANDIDATE_PAGE_SIZE`, evitando uma requisição remota por contato; isso não altera
lote de envio, concorrência, agenda nem os gates de envio.

## Implantação e ativação

Primeiro implante com schedule desligado e modo dry-run:

```bash
sam deploy --guided --parameter-overrides \
  OrchestratorSecretArn=arn:aws:secretsmanager:sa-east-1:ACCOUNT:secret:SECRET \
  SesIdentityArn=arn:aws:ses:sa-east-1:ACCOUNT:identity/rhcursos.com.br \
  SesConfigurationSetName=rh-cursos-transactional \
  AllowedTelegramChatId=0 \
  CampaignKey=prospecting-v1 \
  ScheduleState=DISABLED \
  RunMode=DRY_RUN \
  ReservedConcurrency=0
```

`ReservedConcurrency=0` omite a reserva da função em contas cuja cota Lambda
não deixa capacidade reservável depois do pool mínimo não reservado da AWS. O
schedule desligado, o lote máximo e os gates transacionais do banco continuam
impedindo paralelismo ou envio acidental. Quando a cota permitir, use `1`.

O deploy cria o Configuration Set, publica os seis eventos aceitos pelo receptor
(`Send`, `Delivery`, `Open`, `Click`, `Bounce` e `Complaint`) no EventBridge e os
encaminha ao endpoint Cloudflare usando uma API Destination autenticada. A regra
é limitada à identidade, ao remetente e ao Configuration Set aprovados, possui
retry, DLQ retida e alarme. O destino de eventos não envia campanhas; o schedule
do orquestrador continua `DISABLED` e o runtime continua `DRY_RUN`.

Ao rotacionar `sesEventsWebhookSecret`, atualize primeiro o secret do Cloudflare
e depois faça uma atualização da stack para a Connection reler a referência
dinâmica. Rotacionar somente o valor no Secrets Manager não atualiza a Connection.

Checklist obrigatório antes do primeiro envio:

1. Migração aplicada e RLS/gates do banco aprovados.
2. Dry-run executado sobre a base real; elegíveis e rejeitados revisados.
3. A decisão de coorte vigente possui digest, referência imutável, propósito e
   validade; classificação temática isolada não vale.
4. Templates e os três cursos aprovados no CRM.
5. Identidade `pedro@rhcursos.com.br` e Configuration Set validados no SES.
6. Bounce, complaint, descadastro, resposta IMAP e alerta Telegram testados com contato sintético.
7. Volume inicial, janela e referência de aprovação registrados.
8. Somente então: ativar campanha/controle, alterar `RunMode=LIVE` e habilitar o schedule.

No deploy de ativação, substitua `AllowedTelegramChatId=0` pelo ID numérico
confirmado do chat privado. Em `LIVE`, qualquer divergência entre esse parâmetro
e o segredo bloqueia a inicialização antes de SES ou Telegram.

## Rollback e kill switch

1. Execute `pause` ou defina `enabled=false` e `kill_switch=true` no controle.
2. Atualize a stack com `ScheduleState=DISABLED`.
3. Preserve DLQ, logs, tentativas e decisões; não apague evidência.
4. Tentativa `AMBIGUOUS` nunca é reenviada automaticamente. Confirme no SES e na caixa antes de reconciliar.
5. Supressão e sequências interrompidas nunca são removidas automaticamente.
