-- Fábrica de conteúdo do blog — valida a carga inicial e o isolamento público.

begin;

select plan(6);

select is(
  (select count(*)::int from public.post_blog where id like 'post-fabrica-%'),
  12,
  'migration cria os 12 rascunhos editoriais'
);

select is(
  (
    select count(*)::int
    from public.post_blog
    where id like 'post-fabrica-%'
      and status = 'Rascunho'
  ),
  12,
  'todos os artigos da fabrica permanecem em Rascunho'
);

select is(
  (select count(*)::int from public.post_blog where id like 'post-fabrica-esocial-%'),
  4,
  'calendario inclui quatro pautas de eSocial'
);

select is(
  (select count(*)::int from public.post_blog where id like 'post-fabrica-folha-%'),
  4,
  'calendario inclui quatro pautas de folha de pagamento'
);

select is(
  (select count(*)::int from public.post_blog where id like 'post-fabrica-dp-%'),
  4,
  'calendario inclui quatro pautas de departamento pessoal'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*)::int from public.post_blog where id like 'post-fabrica-%'),
  0,
  'visitante anonimo nao enxerga os rascunhos da fabrica'
);

reset role;

select * from finish();
rollback;
