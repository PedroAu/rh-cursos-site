# Prontidão de permissão e legítimo interesse — reativação comercial

Atualizado em 20/09/2026. Este artefato organiza a decisão do controlador e os
controles técnicos necessários antes de qualquer envio. Ele **não é parecer
jurídico**. Em 19/09/2026, o controlador decidiu aprovar uma coorte específica
para um único primeiro contato. Em 20/09/2026, a decisão foi aplicada pelo fluxo
auditável descrito abaixo e produziu os eventos `APPROVED` da coorte elegível.

## Referência e regra de decisão

O art. 7º, IX, da LGPD admite o legítimo interesse para dados pessoais não
sensíveis quando o tratamento é necessário e não prevalecem direitos e
liberdades fundamentais do titular. A aplicação deve ser fundamentada no caso
concreto; o Guia Orientativo da ANPD recomenda um teste em três fases:
finalidade, necessidade, e balanceamento e salvaguardas. Consulte o
[Guia Orientativo sobre Legítimo Interesse da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf/@@display-file/file)
e o
[Glossário da ANPD](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/glossario-anpd).

Para este projeto, a classificação `Gestão de Pessoas`, o fato de um endereço
ser corporativo e a marcação de base legal no arquivo de origem são apenas
sinais. Nenhum deles, isolado ou combinado, autoriza o contato.

## Estado produtivo observado

O `APPLY` auditável da decisão
`controller-2026-09-20-prospecting-v1` foi concluído em 20/09/2026:

| Estado | Contatos | Evidência vigente |
| --- | ---: | --- |
| Importados avaliados pelo plano da coorte | 3.758 | Lote `APPLY` concluído |
| `APPROVED` para `COMMERCIAL_PROSPECTING` | 3.712 | Decisão append-only vigente somente antes de `2026-10-05T03:40:00Z` |
| Excluídos pelo plano da coorte | 46 | Supressões e demais exclusões irrenunciáveis |

A decisão possui ID `e03171df-5180-43f4-a948-d45f226d734a`, digest
`3efb06621efeffddba6b128e961ca87fe4fee96a1a03038eb0dbdd80f616e5b0` e
referência imutável ao commit de aprovação. O dry-run final do worker, run ID
`a761ea97-ca9e-4ec9-ab12-169fb537f2b2`, avaliou
3.779 registros existentes no CRM, dos quais 3.712 foram elegíveis e 67
rejeitados. A diferença decorre do universo mais amplo do CRM; nenhuma exclusão
foi convertida em aprovação. Sequências e mensagens da campanha permanecem em
zero.

Esses números são um retrato agregado de 20/09/2026. O event store é
append-only e uma oposição, supressão, expiração ou nova evidência pode
alterar o estado individual antes do envio.

## Escopo exato da análise

Este documento separa dois propósitos. `COMMERCIAL_REACTIVATION` envia por
e-mail uma sequência curta, transparente e interrompível sobre um dos três
cursos abaixo a uma pessoa com relacionamento anterior demonstrável. A decisão
de 19/09/2026 criou `COMMERCIAL_PROSPECTING` para um único primeiro contato da
base importada, sem exigir prova individual de relação anterior:

1. Curso Prático de Atualização do eSocial: Novo Leiaute 1.3 para Órgãos Públicos.
2. Auditoria da Folha de Pagamento.
3. Inteligência Artificial na Execução Orçamentária.

Qualquer outro curso, finalidade, canal, enriquecimento de perfil,
compartilhamento ou segmentação exige nova análise. WhatsApp e Telegram não são
canais comerciais deste tratamento; o Telegram permanece somente operacional.

## Teste de balanceamento a ser concluído pelo controlador

### 1. Finalidade

Registrar, para uma coorte delimitada:

- o benefício concreto, atual e lícito buscado pela RH Cursos;
- por que a oferta específica é compatível com a atividade da organização e
  com o relacionamento anterior documentado;
- a finalidade específica e explícita, sem expressões genéricas como “ações de
  marketing”;
- a pessoa responsável pela decisão e a data da revisão.

Resultado obrigatório e sua transição: `APROVADO` gera `APPROVED` somente com
toda a evidência mínima; `REPROVADO` gera `BLOCKED`; `INCONCLUSIVO` permanece ou
gera novo evento `UNKNOWN`.

### 2. Necessidade

Demonstrar por que o envio é necessário e por que não há alternativa razoável
menos intrusiva. O tratamento fica limitado a:

- nome, e-mail, curso pertinente, origem/proveniência e histórico mínimo de
  interação;
- deduplicação por e-mail normalizado e consulta ao CRM/event store;
- no máximo três mensagens nos dias 0, 5 e 10 para reativação; exatamente um
  primeiro contato no dia 0 para `COMMERCIAL_PROSPECTING`;
- janela de 08h às 18h em `America/Sao_Paulo`, lote inicial manual e limites
  diários do orquestrador;
- retenção apenas pelo prazo definido na política de privacidade e no registro
  de tratamento.

Não usar dados sensíveis, inferências sensíveis, dados de crianças ou
adolescentes, dados obtidos de forma ilícita, conteúdo de mensagens além do
necessário à correlação, nem enriquecer o perfil com fontes externas para tornar
um contato elegível.

### 3. Balanceamento e salvaguardas

A legítima expectativa deve ser demonstrada, não presumida. A avaliação deve
considerar relação prévia, fonte e forma de coleta, contexto e época da coleta,
finalidade original, compatibilidade com a nova finalidade, impacto e
intrusividade. A ANPD também orienta transparência, canal fácil para exercício
de direitos, minimização e registro das operações.

Para a reativação, comprovar cumulativamente os itens abaixo. Para a prospecção
inicial, a decisão expressa do controlador e o digest da base substituem apenas
a exigência de relação anterior individual; todas as demais salvaguardas
continuam aplicáveis:

- para reativação, relação anterior direta; para prospecção, fonte rastreável da
  coorte e digest determinístico da base sob controle da RH Cursos;
- compatibilidade entre o interesse/curso anterior e a oferta atual;
- ausência de oposição, descadastro, reclamação, bounce permanente ou pedido de
  eliminação;
- para reativação, ausência de interação nos últimos 15 dias; em ambos os
  propósitos, ausência de outra sequência da mesma campanha;
- identidade sem conflito de nome e sem dúvida sobre o destinatário;
- aviso de privacidade claro e identificação do controlador/remetente;
- descadastro funcional em todas as mensagens e supressão imediata;
- resposta encaminhada à caixa corporativa e interrupção automática da sequência;
- timeline append-only, idempotência, limites, kill switch, monitoramento de
  bounce/complaint e trilha da decisão;
- revisão humana sempre que a expectativa ou a proveniência não forem claras.

## Desqualificadores obrigatórios

O contato não pode receber envio quando ocorrer qualquer condição abaixo:

- dado sensível, indício de menor de idade ou categoria que exija avaliação
  específica;
- dado obtido por meio ilícito, fonte sem relação profissional verificável ou
  compartilhamento incompatível com a finalidade documentada; a publicidade do
  dado, isoladamente, não elimina as obrigações de finalidade, necessidade,
  transparência, segurança e oposição;
- e-mail pessoal sem relação anterior e expectativa demonstráveis;
- finalidade original desconhecida ou incompatível;
- oposição, descadastro, reclamação, bounce permanente, pedido de eliminação ou
  outra supressão;
- identidade conflitante, endereço inválido ou dúvida razoável sobre a pessoa;
- para reativação, interação nos últimos 15 dias; para ambos os propósitos,
  sequência concorrente ou tentativa ambígua;
- teste reprovado/inconclusivo, evidência expirada ou incerteza jurídica.

O sistema deve falhar fechado: dúvida não é aprovação.

## Evidência mínima para um evento `APPROVED`

Não existe aprovação em massa por atualização direta. Para cada pessoa ou coorte
homogênea, o responsável deve preservar um documento imutável e então inserir
um novo evento append-only em `lead_contact_permission_event`, sem alterar ou
apagar o histórico anterior. A evidência deve conter:

- referência da decisão do controlador e versão do teste;
- responsável/revisor e instante da decisão;
- finalidade `COMMERCIAL_REACTIVATION` ou `COMMERCIAL_PROSPECTING` e hipótese
  legal escolhida;
- `evidence_ref` verificável e digest da coorte aprovada;
- critérios de inclusão, proveniência e período da coleta;
- justificativas de finalidade, necessidade e legítima expectativa;
- riscos, impactos, salvaguardas e motivos para exclusões;
- curso permitido, canal, quantidade máxima, janela e validade;
- identificadores imutáveis da versão da campanha, da policy e do template ou
  digests equivalentes do conteúdo efetivamente aprovado;
- `expires_at` no máximo 30 dias após a decisão, interpretado em
  `America/Sao_Paulo`, sem renovação automática.
- data de expiração ou revisão obrigatória.

O evento técnico só pode usar `APPROVED` quando a decisão estiver concluída,
vigente e recuperável. `legal_basis` importada sem essa evidência permanece
`UNKNOWN`; reprovação ou oposição gera `BLOCKED`. Imediatamente antes de criar
a sequência, o preflight operacional deve confirmar que campanha, policy,
template, curso e conteúdo coincidem exatamente com os identificadores ou
digests da evidência. A mesma conferência deve ser registrada antes de autorizar
o primeiro lote; os controles permanecem desligados diante de qualquer
divergência. Uma mudança exige nova decisão, sem reaproveitar a aprovação
anterior. O preflight também rejeita `expires_at` ausente ou vencido. No
vencimento ou encerramento do piloto, o responsável registra um novo evento
append-only `UNKNOWN` (ou `BLOCKED` quando houver oposição), com chave
idempotente e referência ao evento encerrado.

## Controles existentes que funcionam como salvaguardas

| Risco | Controle operacional |
| --- | --- |
| Envio sem decisão | Permission event append-only e policy `APPROVED` fail-closed |
| Ampliação silenciosa da coorte | `--discover` explícito, digest e dry-run por reason code |
| Conteúdo/finalidade divergente | Campanha e conteúdo versionados, ambos exigindo aprovação |
| Excesso de frequência | Sequência 0/5/10, máximo de três mensagens e limites de lote/dia |
| Contato inoportuno | Inatividade mínima de 15 dias e janela 08h–18h |
| Oposição ou falha de entrega | Descadastro, bounce, complaint e reply interrompem a sequência |
| Reenvio incerto | Tentativa `AMBIGUOUS` nunca é reenviada automaticamente |
| Incidente | Kill switch, schedule independente, DLQ, alarmes e `pause` auditável |
| Falta de rastreabilidade | Timeline, decisões, tentativas e controles append-only |

## Piloto executado e expansão ainda condicionada aos gates operacionais

A decisão formal do controlador está registrada e o gate externo foi atendido:
em 20/09/2026, o SES da região `sa-east-1` informou
`ProductionAccessEnabled=true`, `SendingEnabled=true`, revisão `GRANTED` e
enforcement `HEALTHY`. A autorização comercial explícita foi registrada e o
primeiro lote manual de cinco mensagens foi executado em 20/09/2026. O SES
registrou quatro entregas, um bounce e nenhuma complaint; o bounce foi suprimido,
interrompeu a sequência e gerou alerta no Telegram. Em 21/09/2026, a correção da
regra EventBridge foi implantada e validada com o Mailbox Simulator oficial do
SES: `SENT` e `DELIVERED` chegaram automaticamente à timeline, com duas
invocações, zero falhas e DLQ vazia. A expansão continua proibida por prudência
operacional e reputacional — o lote inicial teve um bounce em cinco envios — e
depende dos gates do
[`sales-reactivation-go-live-checklist.md`](sales-reactivation-go-live-checklist.md).
Então:

1. confirmar a decisão e o digest; se a liberação ocorrer em ou após
   `2026-10-05T03:40:00Z`, gerar novo plano e nova decisão, sem renovar a
   anterior automaticamente;
2. recalcular o conjunto elegível imediatamente antes da materialização,
   aplicando novos eventos `BLOCKED`, supressões e oposições, e exigir evento
   `APPROVED` vigente de cada contato que for materializado;
3. confirmar que a versão de conteúdo e o assunto editorial continuam idênticos
   aos artefatos aprovados;
4. executar dry-run, rejeitar evidência ausente/vencida e revisar os reason codes;
5. manter o schedule desligado; o único lote manual autorizado já foi encerrado
   após cinco mensagens;
6. manter a ingestão automática validada e conferir timeline, Telegram e DLQs
   antes de qualquer expansão; bounce e complaint continuam sujeitos a novo
   teste controlado ou ocorrência real, sem provocar evento terminal artificial;
7. ao encerrar ou vencer o piloto, registrar o evento append-only `UNKNOWN` ou
   `BLOCKED` correspondente antes de considerar uma nova decisão.

O primeiro lote operacional foi pequeno, manual e imediatamente pausado. A
aprovação da coorte, a liberação do SES e esse piloto não autorizam superar
supressões, oposição, limites de reputação ou os demais gates técnicos.
