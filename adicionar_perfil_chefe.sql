-- IXHEI - PERFIL CHEFE / ADMINISTRADOR
-- Execute no Supabase > SQL Editor.
-- IMPORTANTE: depois, troque o email no último comando pelo e-mail da conta que será Chefe.

-- 1) Adiciona função/cargo ao perfil.
alter table public.profiles
add column if not exists role text not null default 'user';

-- Impede valores inesperados.
alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('user','admin'));

-- 2) Função segura para verificar se o usuário atual é admin.
create or replace function public.is_ixhei_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

grant execute on function public.is_ixhei_admin() to anon, authenticated;

-- 3) Policies da tabela ITEMS:
-- mantém as existentes e adiciona permissão do admin.
drop policy if exists "Admin atualiza qualquer item" on public.items;
drop policy if exists "Admin exclui qualquer item" on public.items;

create policy "Admin atualiza qualquer item"
on public.items
for update
to authenticated
using (public.is_ixhei_admin())
with check (public.is_ixhei_admin());

create policy "Admin exclui qualquer item"
on public.items
for delete
to authenticated
using (public.is_ixhei_admin());

-- 4) Admin pode alterar o nome público de qualquer perfil.
drop policy if exists "Admin atualiza qualquer perfil" on public.profiles;

create policy "Admin atualiza qualquer perfil"
on public.profiles
for update
to authenticated
using (
  auth.uid() = id
  or public.is_ixhei_admin()
)
with check (
  auth.uid() = id
  or public.is_ixhei_admin()
);

-- 5) Segurança importante:
-- usuários comuns NÃO conseguem mudar o próprio role pelo site.
-- A tabela continua sem UI para editar role.
-- Para promover um admin, faça manualmente via SQL.

-- 6) PROMOVER SUA CONTA PARA CHEFE:
-- TROQUE o e-mail abaixo pelo e-mail da conta Google/e-mail que será Chefe.
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('carloseduardojesusf@gmail.com');

-- 7) Conferência
select
  u.email,
  p.display_name,
  p.role
from public.profiles p
join auth.users u on u.id = p.id
order by p.role desc, p.display_name;


-- 8) Chefe pode visualizar todas as conversas para moderação.
drop policy if exists "Admin ve todas conversas" on public.conversations;
drop policy if exists "Admin ve todas mensagens" on public.messages;

create policy "Admin ve todas conversas"
on public.conversations
for select
to authenticated
using (public.is_ixhei_admin());

create policy "Admin ve todas mensagens"
on public.messages
for select
to authenticated
using (public.is_ixhei_admin());

-- O login continua sendo o login normal do IXHEI.
-- A conta recebe o Painel Chefe automaticamente quando role = 'admin'.
