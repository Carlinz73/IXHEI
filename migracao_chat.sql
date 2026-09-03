-- USE APENAS se você já tinha a versão antiga do IXHEI em testes.
-- Isto remove somente o chat antigo e recria o chat novo.
-- As publicações em "items" permanecem.

drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  item_owner_id uuid not null references auth.users(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(item_id, requester_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body varchar(500) not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Participantes veem conversas"
on public.conversations for select to authenticated
using (auth.uid() = item_owner_id or auth.uid() = requester_id);

create policy "Usuario inicia conversa"
on public.conversations for insert to authenticated
with check (auth.uid() = requester_id and auth.uid() <> item_owner_id);

create policy "Participantes veem mensagens"
on public.messages for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
);

create policy "Participantes enviam mensagens"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
);

create policy "Participantes marcam mensagens"
on public.messages for update to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and (c.item_owner_id = auth.uid() or c.requester_id = auth.uid())
  )
);

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end; $$;

create trigger trg_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation();
