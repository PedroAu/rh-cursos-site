# Prontidão de permissão e legítimo interesse — reativação comercial

Atualizado em 19/09/2026. Este artefato organiza a decisão do controlador e os
controles técnicos necessários antes de qualquer envio. Ele **não é parecer
jurídico**, não aprova uma base legal e não converte contatos em `APPROVED`.

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

O evento de permissão mais recente dos 3.758 contatos importados está em
`UNKNOWN`:

| Indicação trazida pela fonte | Contatos | Decisão vigente |
| --- | ---: | --- |
| `LEGITIMATE_INTEREST` | 2.220 | Bloqueados até teste documentado e decisão do controlador |
| Sem base indicada | 1.538 | Bloqueados até consentimento ou outra hipótese legal válida |
| **Total `UNKNOWN`** | **3.758** | **Nenhum envio permitido** |

Esses números são um retrato agregado de 19/09/2026. Devem ser recalculados
antes de uma decisão, pois o event store é append-only e uma oposição,
supressão ou nova evidência pode alterar o estado individual.

## Escopo exato da análise

O único propósito avaliado neste documento é `COMMERCIAL_REACTIVATION`: enviar
por e-mail uma sequência curta, transparente e interrompível sobre um dos três
cursos abaixo a uma pessoa com relacionamento anterior demonstrável com a RH
Cursos:

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
- no máximo três mensagens nos dias 0, 5 e 10;
- janela de 08h às 18h em `America/Sao_Paulo`, lote inicial manual e limites
  diários do orquestrador;
- retenção apenas pelo prazo definido na política de privacidade e no registro
  de tratamento.

Não usar dados sensíveis, inferências sensíveis, dados de crianças ou
adolescentes, listas raspadas da internet, conteúdo de mensagens além do
necessário à correlação, nem enriquecer o perfil com fontes externas para tornar
um contato elegível.

### 3. Balanceamento e salvaguardas

A legítima expectativa deve ser demonstrada, não presumida. A avaliação deve
considerar relação prévia, fonte e forma de coleta, contexto e época da coleta,
finalidade original, compatibilidade com a nova finalidade, impacto e
intrusividade. A ANPD também orienta transparência, canal fácil para exercício
de direitos, minimização e registro das operações.

Para cada coorte, comprovar cumulativamente:

- relação anterior direta e fonte rastreável sob controle da RH Cursos;
- compatibilidade entre o interesse/curso anterior e a oferta atual;
- ausência de oposição, descadastro, reclamação, bounce permanente ou pedido de
  eliminação;
- ausência de interação nos últimos 15 dias e de outra sequência ativa;
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
- ausência de proveniência, coleta em fonte pública/raspada ou compartilhamento
  por terceiro sem documentação compatível;
- e-mail pessoal sem relação anterior e expectativa demonstráveis;
- finalidade original desconhecida ou incompatível;
- oposição, descadastro, reclamação, bounce permanente, pedido de eliminação ou
  outra supressão;
- identidade conflitante, endereço inválido ou dúvida razoável sobre a pessoa;
- interação nos últimos 15 dias, sequência concorrente ou tentativa ambígua;
- teste reprovado/inconclusivo, evidência expirada ou incerteza jurídica.

O sistema deve falhar fechado: dúvida não é aprovação.

## Evidência mínima para um evento `APPROVED`

Não existe aprovação em massa por atualização direta. Para cada pessoa ou coorte
homogênea, o responsável deve preservar um documento imutável e então inserir
um novo evento append-only em `lead_contact_permission_event`, sem alterar ou
apagar o histórico anterior. A evidência deve conter:

- referência da decisão do controlador e versão do teste;
- responsável/revisor e instante da decisão;
- finalidade `COMMERCIAL_REACTIVATION` e hipótese legal escolhida;
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

## Piloto permitido somente após os gates externos

O piloto continua proibido enquanto o SES estiver no sandbox ou não houver
decisão formal do controlador. Depois de ambos os gates:

1. selecionar no máximo cinco contatos genuínos com evidência individual
   recuperável e sem qualquer desqualificador;
2. aprovar uma única versão de conteúdo e um único curso;
3. registrar os eventos `APPROVED` com `expires_at` de no máximo 30 dias em
   `America/Sao_Paulo`, versões/digests imutáveis e digest da coorte;
4. executar dry-run, rejeitar evidência ausente/vencida e revisar os reason codes;
5. manter o schedule desligado, liberar um único lote manual no horário permitido
   e parar após o primeiro passo;
6. conferir entrega, respostas, descadastros, bounces, complaints, timeline,
   Telegram e DLQs antes de qualquer expansão;
7. ao encerrar ou vencer o piloto, registrar o evento append-only `UNKNOWN` ou
   `BLOCKED` correspondente antes de considerar uma nova decisão.

Sem evidência suficiente, a ação correta é obter consentimento por um canal
legítimo já existente ou não realizar a reativação.
