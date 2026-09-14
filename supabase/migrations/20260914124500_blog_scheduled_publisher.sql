-- Publica automaticamente posts agendados quando pg_cron estiver disponível.

create or replace function public.publish_due_blog_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.post_blog;
  v_count integer := 0;
begin
  for v_post in
    select *
    from public.post_blog
    where deleted_at is null
      and status = 'Agendado'
      and agendado_em is not null
      and agendado_em <= now()
    for update skip locked
  loop
    update public.post_blog
    set status = 'Publicado',
        publicado_em = coalesce(v_post.agendado_em, now()),
        agendado_em = null,
        atualizado_por = null,
        revisao_atual = revisao_atual + 1
    where id = v_post.id
    returning * into v_post;

    insert into public.post_blog_revision (post_id, numero, snapshot, motivo)
    values (v_post.id, v_post.revisao_atual, to_jsonb(v_post), 'scheduled-publish');

    insert into public.post_blog_audit_event (post_id, action, from_status, to_status, metadata)
    values (v_post.id, 'scheduled-publish', 'Agendado', 'Publicado', jsonb_build_object('published_at', v_post.publicado_em));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.publish_due_blog_posts() from public, anon, authenticated;
grant execute on function public.publish_due_blog_posts() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'publish-due-blog-posts',
      '* * * * *',
      'select public.publish_due_blog_posts()'
    );
  end if;
exception when others then
  -- Desenvolvimento local sem pg_cron continua permitindo publicação manual.
  null;
end;
$$;
