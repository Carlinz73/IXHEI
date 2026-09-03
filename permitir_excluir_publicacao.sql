-- IXHEI - permitir que o dono apague sua própria publicação
-- Execute uma vez no SQL Editor do Supabase.

alter table public.items enable row level security;

drop policy if exists "Usuarios excluem seus itens" on public.items;

create policy "Usuarios excluem seus itens"
on public.items
for delete
to authenticated
using (auth.uid() = user_id);

-- Conferência: mostra as políticas da tabela items
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'items'
order by policyname;
