-- =====================================================================
--  Migración 9: chat de WhatsApp desde el CRM
--  - El asesor responde al lead desde el panel (sale por el número de Genesys).
--  - Cada mensaje queda en lead_interacciones con su estado de envío.
--  - Los leads guardan su último mensaje y si hay mensajes sin responder.
--  - Tiempo real: el panel recibe los mensajes nuevos al instante (respeta RLS).
-- =====================================================================

alter type public.interaccion_tipo add value if not exists 'mensaje_asesor';

-- ---------------------------------------------------------------------
-- 1. Estado de envío de los mensajes del asesor
-- ---------------------------------------------------------------------
alter table public.lead_interacciones
  add column estado_envio text,
  add column error_envio  text;

alter table public.lead_interacciones
  add constraint interacciones_estado_envio_valido
  check (estado_envio is null or estado_envio in ('enviado', 'error'));

-- ---------------------------------------------------------------------
-- 2. Resumen de la conversación en el lead (para la bandeja de chats)
-- ---------------------------------------------------------------------
alter table public.leads
  add column ultimo_mensaje_lead_at timestamptz,   -- último mensaje que escribió el lead
  add column ultima_respuesta_at    timestamptz,   -- último mensaje enviado por un asesor
  add column ultimo_mensaje_texto   text,          -- vista previa del último mensaje (lead o asesor)
  add column ultimo_mensaje_at      timestamptz;

-- Sin responder: el lead escribió después de ser asignado y el asesor aún no contestó
alter table public.leads
  add column sin_responder boolean generated always as (
    asesor_id is not null
    and ultimo_mensaje_lead_at is not null
    and ultimo_mensaje_lead_at > coalesce(greatest(ultima_respuesta_at, fecha_asignado), '-infinity'::timestamptz)
  ) stored;

create index idx_leads_ultimo_mensaje on public.leads (ultimo_mensaje_at desc nulls last);
create index idx_leads_sin_responder  on public.leads (asesor_id) where sin_responder;

create or replace function public.fn_interacciones_resumen_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.tipo = 'mensaje_lead' then
    update public.leads
    set ultimo_mensaje_lead_at = new.created_at,
        ultimo_mensaje_texto   = left(new.contenido, 160),
        ultimo_mensaje_at      = new.created_at
    where id = new.lead_id;
  elsif new.tipo = 'mensaje_asesor' and new.estado_envio = 'enviado' then
    update public.leads
    set ultima_respuesta_at  = new.created_at,
        ultimo_mensaje_texto = left(new.contenido, 160),
        ultimo_mensaje_at    = new.created_at
    where id = new.lead_id;
  end if;
  return new;
end $$;

create trigger trg_interacciones_resumen_chat
after insert on public.lead_interacciones
for each row execute function public.fn_interacciones_resumen_chat();

revoke execute on function public.fn_interacciones_resumen_chat() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Tiempo real para el historial (Supabase Realtime aplica el RLS de cada usuario)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_interacciones') then
    alter publication supabase_realtime add table public.lead_interacciones;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Completar el resumen de los leads que ya existen
-- ---------------------------------------------------------------------
update public.leads l
set ultimo_mensaje_lead_at = m.ultimo,
    ultimo_mensaje_at      = m.ultimo,
    ultimo_mensaje_texto   = left(m.texto, 160)
from (
  select distinct on (lead_id) lead_id, created_at as ultimo, contenido as texto
  from public.lead_interacciones
  where tipo = 'mensaje_lead'
  order by lead_id, created_at desc
) m
where m.lead_id = l.id;
