-- Corrige o CTA dos rascunhos apenas quando eles estiverem vinculados
-- ao curso de eSocial existente no catálogo de produção.

update public.post_blog p
set conteudo = replace(
  replace(p.conteudo,
    '/cursos/esocial-na-pratica-revisao-orientada-antes-do-envio',
    '/cursos/curso-de-esocial-pratico-para-orgaos-publicos-atualizado-com-o-novo-leiaute-1-3'),
    'eSocial na prática: revisão orientada antes do envio',
    'Curso Prático de Atualização do eSocial para Órgãos Públicos'
  )
from public.curso c
where p.id in ('post-fabrica-esocial-01', 'post-fabrica-esocial-02')
  and p.status = 'Rascunho'
  and p.curso_id = c.id
  and c.slug = 'curso-de-esocial-pratico-para-orgaos-publicos-atualizado-com-o-novo-leiaute-1-3'
  and c.deleted_at is null;
