-- IXHEI - REPARO COMPLETO DO CHAT
-- Execute este arquivo no SQL Editor do Supabase.
-- Não apaga a tabela items nem as publicações.

create extension if not exists "pgcrypto";

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  item_owner_id uuid not null references auth.users(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(item_id, requester_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body varchar(500) not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Participantes veem conversas" on public.conversations;
drop policy if exists "Usuario inicia conversa" on public.conversations;
drop policy if exists "Participantes veem mensagens" on public.messages;
drop policy if exists "Participantes enviam mensagens" on public.messages;
drop policy if exists "Participantes marcam mensagens" on public.messages;

create policy "Participantes veem conversas"
on public.conversations
for select
to authenticated
using (
  auth.uid() = item_owner_id
  or auth.uid() = requester_id
);

create policy "Usuario inicia conversa"
on public.conversations
for insert
to authenticated
with check (
  auth.uid() = requester_id
  and auth.uid() <> item_owner_id
  and exists (
    select 1
    from public.items i
    where i.id = item_id
      and i.user_id = item_owner_id
  )
);

create policy "Participantes veem mensagens"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.item_owner_id = auth.uid()
        or c.requester_id = auth.uid()
      )
  )
);

create policy "Participantes enviam mensagens"
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.item_owner_id = auth.uid()
        or c.requester_id = auth.uid()
      )
  )
);

create policy "Participantes marcam mensagens"
on public.messages
for update
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.item_owner_id = auth.uid()
        or c.requester_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.item_owner_id = auth.uid()
        or c.requester_id = auth.uid()
      )
  )
);

create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation on public.messages;

create trigger trg_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation();

-- Ativa messages no Supabase Realtime sem dar erro se já estiver ativada.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Índices para o chat ficar mais rápido.
create index if not exists idx_conversations_owner
on public.conversations(item_owner_id);

create index if not exists idx_conversations_requester
on public.conversations(requester_id);

create index if not exists idx_conversations_item
on public.conversations(item_id);

create index if not exists idx_messages_conversation_created
on public.messages(conversation_id, created_at);

-- Verificação final
select
  'conversations' as tabela,
  count(*) as registros
from public.conversations
union all
select
  'messages' as tabela,
  count(*) as registros
from public.messages;
