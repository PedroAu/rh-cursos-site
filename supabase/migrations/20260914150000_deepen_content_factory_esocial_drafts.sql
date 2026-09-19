-- Aprofunda dois rascunhos da fábrica sem publicar nem alterar o vínculo de curso.
-- Só atualiza registros ainda em Rascunho; conteúdo revisado em outro status é preservado.

update public.post_blog
set
  resumo = 'Entenda o que a versão S-1.3 muda na operação de um órgão público e use um roteiro para mapear dados, responsáveis, eventos e evidências antes do fechamento.',
  conteudo = $content$
# O que muda na rotina dos órgãos públicos com o eSocial S-1.3?

## Resposta curta

O S-1.3 não é apenas uma troca de versão no sistema. Para o órgão público, a mudança precisa aparecer no cadastro, na folha, na integração, na conferência e no arquivo que comprova cada decisão. O leiaute S-1.3 foi aprovado pela Portaria Conjunta RFB/MPS/MTE nº 13, de 25 de junho de 2024. A implantação em produção ocorreu em 2 de dezembro de 2024; durante a convivência, os eventos S-1210, S-5002 e S-2501 passaram a exigir atenção específica, com envio exclusivamente em S-1.3 a partir do período de apuração 01/2025.

Este artigo mostra como transformar a versão do leiaute em um plano de trabalho. Ele não substitui a leitura do Manual de Orientação do eSocial (MOS), a Nota Técnica aplicável ou a análise do caso concreto do órgão.

## 1. Comece pelo mapa de responsabilidades

Antes de pedir uma atualização ao fornecedor, reúna RH/DP, folha, contabilidade, tecnologia e controle interno. Registre quatro respostas:

1. **Qual dado muda ou passa a ser exigido?** Consulte o leiaute vigente e marque o campo, grupo ou regra afetado.
2. **Onde a informação nasce?** Identifique o documento, formulário ou sistema de origem.
3. **Quem valida e quem corrige?** Separe o responsável pelo dado do responsável pela transmissão.
4. **Que evidência fica arquivada?** Defina relatório, recibo, protocolo, log ou ata que permita refazer a conferência.

O resultado pode ser uma tabela simples: dado | sistema de origem | responsável | validação | evidência | prazo. Sem essa tabela, a equipe tende a corrigir o último erro percebido, sem tratar a causa.

## 2. Confira o que sustenta os eventos

Faça uma amostra de trabalhadores e percorra a cadeia completa:

- **S-1000 e S-1005:** confirme identificação do órgão, estabelecimentos, unidades e períodos de validade;
- **S-1010:** compare código, descrição, natureza e incidências das rubricas com a regra aprovada e a parametrização da folha;
- **S-1020:** confira lotações tributárias e a correspondência com unidades e vínculos;
- **S-1200 e S-1202:** valide remuneração de trabalhador do RGPS e de servidor do RPPS, conforme o regime e o caso;
- **S-1210:** reconcilie pagamentos com a remuneração informada;
- **S-1299 e totalizadores:** guarde o resultado do fechamento e a conferência dos valores retornados.

Não presuma que uma rejeição aponta para o evento que a exibiu. A origem pode estar em cadastro, validade, rubrica, integração ou evento anterior. Registre a hipótese, a consulta feita e a correção aprovada.

## 3. Use um fechamento em três passagens

**Passagem A — origem.** Congele a competência, extraia alterações funcionais, admissões, afastamentos, férias e rescisões. Compare a lista com os documentos recebidos pelo DP.

**Passagem B — processamento.** Execute a folha e a integração em ambiente controlado. Liste rejeições por código, trabalhador, evento e causa provável; não sobrescreva o arquivo original.

**Passagem C — transmissão e retorno.** Confirme os recibos, totalizadores e pendências. Um segundo profissional deve revisar uma amostra e assinar a evidência do fechamento.

## 4. Checklist de implantação e manutenção

- [ ] Leiaute e MOS vigentes salvos com data de consulta.
- [ ] Nota Técnica aplicável avaliada pelo responsável técnico.
- [ ] Ambiente de teste atualizado e versão registrada.
- [ ] Tabelas S-1000, S-1005, S-1010 e S-1020 conferidas.
- [ ] Amostra de S-1200/S-1202 e S-1210 reconciliada.
- [ ] Regras de procuração, certificado e perfis de acesso testadas.
- [ ] Rejeições classificadas e responsáveis nomeados.
- [ ] Recibos, totalizadores e decisão sobre exceções arquivados.
- [ ] Calendário de revisão para a próxima competência definido.

## Limites da orientação

O leiaute não decide, sozinho, o regime previdenciário, a incidência de uma rubrica, a validade de um ato funcional ou o tratamento de uma decisão judicial. Esses pontos dependem da legislação aplicável, dos documentos do órgão e, quando necessário, de validação jurídica, contábil, previdenciária ou do fornecedor. O roteiro serve para organizar a pergunta e a evidência; não para autorizar um lançamento sem análise.

## Fontes oficiais

- [Leiautes do eSocial S-1.3 (consolidação disponível no portal)](https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-v-1.3)
- [Notícia oficial de publicação da S-1.3 e do MOS](https://www.gov.br/esocial/pt-br/noticias/publicacao-da-versao-s-1-3-dos-leiautes-do-esocial-e-da-nota-tecnica-no-04-2024-revisada/)
- [Documentação técnica do eSocial](https://www.gov.br/esocial/pt-br/documentacao-tecnica)

Se a sua equipe precisa transformar esse roteiro em conferência de eventos, parametrização e tratamento de rejeições no contexto de órgãos públicos, conheça o [Curso Prático de Atualização do eSocial: Novo Leiaute 1.3 para Órgãos Públicos](/cursos/curso-pratico-atualizacao-esocial-novo-leiaute-1-3-orgaos-publicos). O curso trabalha os eventos e as decisões de conferência com casos aplicados; a turma e a programação devem ser confirmadas no catálogo vigente.
  $content$,
  tags = '["esocial","S-1.3","órgão público","MOS","conferência de eventos"]'::jsonb,
  tempo_leitura = '10 min'
where id = 'post-fabrica-esocial-01'
  and status = 'Rascunho';
update public.post_blog
set
  resumo = 'Checklist operacional para preparar equipe, acessos, cadastros, rubricas, integrações e evidências antes de uma mudança ou revisão do eSocial.',
  conteudo = $content$
# Checklist para preparar a equipe antes da atualização do eSocial

Uma atualização do eSocial fica mais segura quando cada tarefa tem dono, prazo e evidência. O checklist abaixo pode ser usado antes de uma mudança de leiaute, de uma atualização do sistema ou de uma nova competência. Ele complementa o MOS e as Notas Técnicas publicados no portal oficial; não substitui a validação do caso concreto.

## Como usar

Abra uma planilha ou quadro com as colunas **frente, tarefa, responsável, prazo, evidência, pendência e decisão necessária**. Faça uma reunião curta para distribuir os itens e uma revisão final antes do fechamento. Não marque “concluído” apenas porque alguém executou uma ação: anexe o resultado que outra pessoa consiga conferir.

## Checklist em seis frentes

### 1. Pessoas e governança

- [ ] Nomeie um coordenador do ciclo e um substituto.
- [ ] Liste responsáveis por cadastro, folha, transmissão, contabilidade, tecnologia e controle interno.
- [ ] Defina quem aprova exceções e quem pode solicitar suporte ao fornecedor.
- [ ] Reserve uma janela para revisão independente antes do envio.

**Evidência:** ata ou plano com nomes, prazos, competência e canal de escalonamento.

### 2. Acessos e ambientes

- [ ] Confirme certificado, procurações, perfis e validade dos acessos.
- [ ] Registre a versão do sistema de folha, do integrador e do ambiente do eSocial.
- [ ] Execute um teste controlado sem substituir os arquivos de produção.
- [ ] Verifique se os recibos e retornos podem ser consultados por mais de uma pessoa.

**Evidência:** inventário de acessos, captura ou relatório do teste e responsável pela guarda.

### 3. Cadastros e vínculos

- [ ] Compare trabalhadores ativos, admissões, desligamentos, afastamentos e férias com os documentos do período.
- [ ] Revise matrícula, categoria, regime previdenciário, lotação, cargo/função e datas de validade.
- [ ] Identifique campos vazios, duplicidades e alterações funcionais ainda não refletidas.
- [ ] Separe uma amostra de RGPS e RPPS quando o órgão possuir os dois regimes.

**Evidência:** relatório de divergências, amostra usada e aceite da área que corrige a origem.

### 4. Rubricas e regras da folha

- [ ] Exporte a tabela de rubricas e compare natureza, incidências e bases com a regra vigente.
- [ ] Marque rubricas novas, alteradas, extraordinárias e sem uso recente.
- [ ] Teste férias, adicionais, descontos, rescisões e pagamentos que alimentam o S-1210.
- [ ] Não ajuste incidência por tentativa: encaminhe dúvidas legais, previdenciárias ou contábeis para validação formal.

**Evidência:** matriz rubrica-regra-incidência, resultado do teste e decisão aprovada.

### 5. Integração e eventos

- [ ] Confirme o caminho do dado desde o formulário ou sistema de origem até o XML.
- [ ] Teste eventos de tabela (S-1000, S-1005, S-1010 e S-1020) antes dos eventos periódicos.
- [ ] Reconcile S-1200/S-1202 com a folha e S-1210 com os pagamentos.
- [ ] Classifique retornos por código, causa, trabalhador, evento e prazo de correção.

**Evidência:** protocolo, recibo, XML ou relatório de integração; preserve o arquivo original e a versão corrigida.

### 6. Fechamento e continuidade

- [ ] Defina datas para receber movimentações, processar, conferir, corrigir e transmitir.
- [ ] Compare totais com a competência anterior e investigue variações relevantes.
- [ ] Guarde totalizadores, recibos, pendências abertas e a decisão sobre cada exceção.
- [ ] Agende a verificação do que foi corrigido na competência seguinte.

**Evidência:** termo ou relatório de fechamento assinado pelos responsáveis.

## O que fazer quando um item falhar

Pare no ponto de origem, descreva o sintoma e reúna a evidência. Depois classifique a pendência: **dado ausente**, **regra ou parametrização**, **integração**, **acesso** ou **decisão que exige especialista**. Essa classificação evita corrigir o valor final e deixar a causa intacta. Se o prazo de transmissão estiver próximo, registre a decisão de contingência e quem a aprovou.

## Limites e atualização

O checklist organiza a operação, mas não informa se uma verba é devida, qual regime deve ser aplicado ou como cumprir uma decisão judicial. Consulte o MOS, o leiaute e a Nota Técnica vigentes na data do fechamento. O portal do eSocial mantém versões consolidadas e comunicados; a equipe deve registrar a data da consulta porque regras e orientações podem ser atualizadas.

## Fontes oficiais

- [Documentação técnica do eSocial](https://www.gov.br/esocial/pt-br/documentacao-tecnica)
- [Leiautes S-1.3](https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-v-1.3)
- [Publicação oficial da versão S-1.3 e do MOS](https://www.gov.br/esocial/pt-br/noticias/publicacao-da-versao-s-1-3-dos-leiautes-do-esocial-e-da-nota-tecnica-no-04-2024-revisada/)

Para transformar este checklist em uma rotina acompanhada, com leitura do leiaute, conferência de eventos e casos de órgãos públicos, veja o [Curso Prático de Atualização do eSocial: Novo Leiaute 1.3 para Órgãos Públicos](/cursos/curso-pratico-atualizacao-esocial-novo-leiaute-1-3-orgaos-publicos). Consulte no catálogo a programação disponível antes de solicitar a inscrição.
  $content$,
  tags = '["esocial","checklist","S-1.3","cadastro","rubricas","órgão público"]'::jsonb,
  tempo_leitura = '9 min'
where id = 'post-fabrica-esocial-02'
  and status = 'Rascunho';
