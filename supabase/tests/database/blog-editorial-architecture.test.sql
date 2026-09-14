-- Blog editorial architecture — public isolation and additive schema contract.

begin;

select plan(13);

insert into public.post_blog (
  id, titulo, slug, resumo, conteudo, categoria, autor, status,
  publicado_em, agendado_em
)
values
  ('blog-editorial-publicado', 'Publicado', 'blog-editorial-publicado', 'Resumo público válido.', 'Conteúdo público válido.', 'Tecnologia', 'Teste', 'Publicado', now() - interval '1 hour', null),
  ('blog-editorial-futuro', 'Publicado futuro', 'blog-editorial-futuro', 'Resumo futuro válido.', 'Conteúdo futuro válido.', 'Tecnologia', 'Teste', 'Publicado', now() + interval '1 hour', null),
  ('blog-editorial-agendado', 'Agendado', 'blog-editorial-agendado', 'Resumo agendado válido.', 'Conteúdo agendado válido.', 'Tecnologia', 'Teste', 'Agendado', null, now() + interval '1 hour'),
  ('blog-editorial-revisao', 'Em revisão', 'blog-editorial-revisao', 'Resumo revisão válido.', 'Conteúdo revisão válido.', 'Tecnologia', 'Teste', 'Em revisão', null, null),
  ('blog-editorial-rascunho', 'Rascunho', 'blog-editorial-rascunho', 'Resumo rascunho válido.', 'Conteúdo rascunho válido.', 'Tecnologia', 'Teste', 'Rascunho', null, null),
  ('blog-editorial-arquivado', 'Arquivado', 'blog-editorial-arquivado', 'Resumo arquivado válido.', 'Conteúdo arquivado válido.', 'Tecnologia', 'Teste', 'Arquivado', now() - interval '1 day', null);

select ok(to_regclass('public.post_blog_revision') is not null, 'tabela de revisões existe');
select ok(to_regclass('public.post_blog_audit_event') is not null, 'tabela de auditoria editorial existe');
select ok(to_regclass('public.post_blog_permission') is not null, 'tabela de capacidades editoriais existe');
select ok(to_regprocedure('public.admin_save_blog_post_content(character varying,uuid,jsonb)') is not null, 'RPC de salvamento atômico existe');
select ok(to_regprocedure('public.publish_due_blog_posts()') is not null, 'RPC de publicação agendada existe');
select ok(exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'post_blog' and column_name = 'seo_titulo'), 'post_blog possui título SEO');
select ok(exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'post_blog' and column_name = 'agendado_em'), 'post_blog possui data de agendamento');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select ok(exists(select 1 from public.post_blog where id = 'blog-editorial-publicado'), 'anon vê publicação já disponível');
select ok(not exists(select 1 from public.post_blog where id = 'blog-editorial-futuro'), 'anon não vê publicação futura');
select ok(not exists(select 1 from public.post_blog where id = 'blog-editorial-agendado'), 'anon não vê post agendado');
select ok(not exists(select 1 from public.post_blog where id = 'blog-editorial-revisao'), 'anon não vê post em revisão');
select ok(not exists(select 1 from public.post_blog where id = 'blog-editorial-rascunho'), 'anon não vê rascunho');
select ok(not exists(select 1 from public.post_blog where id = 'blog-editorial-arquivado'), 'anon não vê post arquivado');

select * from finish();
rollback;
