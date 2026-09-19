-- Vincula os rascunhos aprofundados ao curso de eSocial ativo no catálogo local.
-- Não cria nem altera curso; só corrige a referência quando o post ainda é Rascunho.

update public.post_blog p
set curso_id = c.id
from public.curso c
where p.id in ('post-fabrica-esocial-01', 'post-fabrica-esocial-02')
  and p.status = 'Rascunho'
  and p.curso_id is null
  and c.slug = 'esocial-na-pratica-revisao-orientada-antes-do-envio'
  and c.status in ('Ativo', 'Destaque')
  and c.deleted_at is null;
update public.post_blog
set conteudo = replace(
  replace(conteudo,
    '/cursos/curso-pratico-atualizacao-esocial-novo-leiaute-1-3-orgaos-publicos',
    '/cursos/esocial-na-pratica-revisao-orientada-antes-do-envio'),
    'Curso Prático de Atualização do eSocial: Novo Leiaute 1.3 para Órgãos Públicos',
    'eSocial na prática: revisão orientada antes do envio'
  )
where id in ('post-fabrica-esocial-01', 'post-fabrica-esocial-02')
  and status = 'Rascunho';
