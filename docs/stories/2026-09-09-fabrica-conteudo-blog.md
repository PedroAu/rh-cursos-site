# Story: Fábrica de conteúdo para o blog da RH Cursos

## Status

Ready for Review

## Story

**Como** responsável pelo marketing da RH Cursos,
**quero** uma operação editorial ligada aos cursos prioritários,
**para que** o blog atraia profissionais de órgãos públicos e os encaminhe para a pré-inscrição adequada.

## Critérios de aceite

- [ ] A operação editorial possui calendário com 12 pautas distribuídas entre eSocial, folha de pagamento e departamento pessoal.
- [ ] Cada pauta aponta para um dos três cursos prioritários e define objetivo, etapa da jornada e CTA.
- [ ] As 12 pautas existem como rascunhos na tabela `post_blog`, sem aparecer no blog público.
- [ ] O blog expõe as categorias eSocial, Folha de Pagamento e Departamento Pessoal na busca e no administrativo.
- [ ] Há uma instrução durável para a automação semanal gerar dois novos rascunhos com fontes oficiais e sem publicação automática.

## Tasks / Subtasks

- [x] Criar calendário editorial e regras de qualidade.
- [x] Criar migration idempotente com os 12 rascunhos iniciais.
- [x] Atualizar a taxonomia do blog público e administrativo.
- [x] Cobrir a categoria nova com teste e executar os checks aplicáveis.

## Dev Notes

- O escopo cria rascunhos; publicação exige revisão editorial e técnica, especialmente para conteúdo que trate de eSocial, obrigações acessórias ou legislação.
- Cursos vinculados: `course-2026-esocial-s13-publico`, `course-2026-auditoria-folha` e `course-2026-dp-completo-publica`.

## Dev Agent Record

### Agent Model Used

GPT-5

### File List

- `docs/content-factory/README.md`
- `docs/content-factory/calendar.md`
- `docs/content-factory/triagem-inicial.md`
- `supabase/migrations/20260909090000_seed_content_factory_drafts.sql`
- `src/types/index.ts`
- `src/views/public/Blog.tsx`
- `src/lib/admin-resource-configs.tsx`
- `src/lib/supabase/mappers.ts`
- `src/__tests__/views/public/blog.test.tsx`
- `src/__tests__/lib/admin-resource-configs.test.ts`
- `supabase/tests/database/content-factory-blog.test.sql`

### Completion Notes List

- Calendário editorial criado com 12 pautas e CTAs ligados aos três cursos prioritários.
- Migration idempotente prepara os 12 artigos em `Rascunho`; a policy pública continua expondo somente `Publicado`.
- O blog e o administrativo passam a oferecer a categoria `Folha de Pagamento`.
- A automação semanal `Fábrica semanal de conteúdo RH Cursos` foi ativada no Codex para produzir dois rascunhos por vez e nunca publicar automaticamente.
- Os 12 rascunhos iniciais passaram por `$triagem-vicios-ia`; a automação executa essa mesma etapa antes de salvar futuros textos.
- A migration passou a tolerar catálogos locais que ainda não contenham os três cursos prioritários: mantém o vínculo quando o curso existe e deixa o campo disponível para vinculação administrativa quando não existe.
- `npm run test:db` aplicou a migration no Supabase local e passou nos 119 testes de banco, incluindo 6 asserções específicas da fábrica de conteúdo e o isolamento dos rascunhos por RLS.
- `npm run lint`, `npm run typecheck`, o build de produção local, 808 testes unitários e os 16 testes focados do blog e da configuração administrativa passaram.
- A rota pública `/blog` passou no gate Playwright de acessibilidade WCAG 2.1 A/AA. O cenário E2E administrativo autenticado não iniciou porque o Supabase local completo não ficou saudável no serviço Realtime; a configuração administrativa ficou coberta por teste unitário.
- Nenhum endpoint, credencial ou banco de produção foi acessado ou alterado durante a validação.

### Change Log

| Data | Alteração |
| --- | --- |
| 2026-09-09 | Story criada a partir da solicitação de construir a fábrica de conteúdo para os três cursos prioritários. |
| 2026-09-09 | Rascunhos revisados com a skill de triagem e automação atualizada para tornar a revisão obrigatória. |
| 2026-09-10 | Migration tornada segura para catálogos sem os cursos prioritários; cobertura de banco, filtros públicos e taxonomia administrativa adicionada; story movida para revisão. |
