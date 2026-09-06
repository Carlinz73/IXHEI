-- IXHEI - adicionar Pátio e Corredor
-- Execute UMA VEZ no Supabase > SQL Editor.
-- Converte "room" para texto para aceitar 1..14, patio e corredor.
alter table public.items
alter column room type text
using room::text;
