-- Alinha a fonte de autorização editorial (profiles.role) ao papel admin
-- já validado no Supabase Auth. Não altera usuários nem promove perfis sem
-- a claim administrativa existente em auth.users.

insert into public.profiles (id, role)
select u.id, 'admin'
from auth.users u
where u.raw_app_meta_data ->> 'role' = 'admin'
on conflict (id) do update
set role = 'admin',
    updated_at = now();
-- Novas contas criadas com a claim administrativa devem receber o mesmo papel
-- na camada de profiles, consumida pelas RLS policies e pelo fluxo editorial.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (
    new.id,
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
