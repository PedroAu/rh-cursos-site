# Arquitetura editorial do blog

## Fluxo de publicação

O módulo administrativo usa uma máquina de estados explícita:

`Rascunho → Em revisão → Agendado → Publicado → Arquivado`

Um artigo arquivado pode ser restaurado para `Rascunho`. O agendamento exige
uma data futura; a publicação registra `publicado_em` e o autor da ação. A
alteração de status não acontece pelo formulário genérico: cada transição é
validada no RPC `admin_transition_blog_post`, com lock da linha, permissão e
auditoria.

Quando `pg_cron` está habilitado, o job `publish-due-blog-posts` executa a cada
minuto e promove posts vencidos de `Agendado` para `Publicado` de forma
idempotente. Em ambientes locais sem `pg_cron`, a mesma função pode ser
executada pelo scheduler da aplicação.

## Conteúdo e histórico

- Autosave mantém rascunhos incompletos sem torná-los públicos.
- O conteúdo aceita texto simples ou Markdown seguro; HTML e scripts são
  rejeitados na validação do cliente e da Edge Function.
- Cada publicação, agendamento, revisão, arquivamento e edição de conteúdo
  gera um snapshot em `post_blog_revision` e um evento em
  `post_blog_audit_event`.
- O salvamento de conteúdo usa o RPC `admin_save_blog_post_content`, que grava
  post, revisão e auditoria na mesma transação.
- SEO (título, descrição, canonical e Open Graph), texto alternativo e formato
  ficam no próprio post e alimentam metadata, sitemap e JSON-LD `BlogPosting`.

## Segurança

- A listagem pública só enxerga posts não excluídos com status `Publicado`,
  `publicado_em` preenchido e data menor ou igual ao momento atual.
- A gestão usa a Edge Function `admin-resources`, sessão administrativa e
  permissões por capacidade (`edit`, `review`, `schedule`, `publish`, `archive`).
- Exclusão continua sendo soft-delete; nenhum dado de produção é tocado pelos
  testes locais.

## Testar localmente

```bash
supabase start
supabase db reset --local
supabase test db --local
npm run dev
```

Para recriar o administrador local após um reset:

```bash
eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export ADMIN_EMAIL=admin@rhcursos.com.br ADMIN_PASSWORD='RHCursosLocal#2026!'
node scripts/seed-admin.js
node scripts/promote-admin.js
```

Abra `/admin/blog`, crie um artigo, aguarde o autosave, envie para revisão,
agende/publice e confirme o preview. O site público só exibirá o artigo depois
da publicação e da data de corte.
