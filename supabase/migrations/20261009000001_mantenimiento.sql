-- =====================================================================
--  Mantenimiento (sin cambiar el funcionamiento):
--  1. Índices para las relaciones entre tablas que no tenían (recomendación
--     del Security/Performance Advisor de Supabase) y para la búsqueda de
--     contactos con número oculto (@lid) en el registro de eventos.
--  2. puede_programar_ausencia: solo para usuarios con sesión.
--  3. Limpieza del registro de eventos (webhook_eventos): se borran los de más
--     de 90 días, salvo los mensajes entrantes de contactos @lid (con ellos se
--     reconoce a esos contactos para responderles a la dirección correcta).
--  4. Alertas de error: si el bot falla, se avisa a los super admin por WhatsApp
--     (máximo un aviso por hora para el mismo error).
-- =====================================================================

-- 1. Índices
create index if not exists tareas_creada_por_idx              on public.tareas (creada_por);
create index if not exists conocimiento_updated_por_idx       on public.conocimiento (updated_por);
create index if not exists lead_interacciones_autor_idx       on public.lead_interacciones (autor_id);
create index if not exists revision_bot_revisada_por_idx      on public.revision_bot (revisada_por);
create index if not exists leads_eliminado_por_idx            on public.leads (eliminado_por);
create index if not exists proformas_asesor_idx               on public.proformas (asesor_id);
create index if not exists actividades_responsable_idx        on public.actividades (responsable_id);
create index if not exists avisos_pendientes_creado_por_idx   on public.avisos_pendientes (creado_por);
create index if not exists leads_registrado_por_idx           on public.leads (registrado_por);
create index if not exists prerregistros_lead_idx             on public.prerregistros (lead_id);
create index if not exists flujos_bot_actualizado_por_idx     on public.flujos_bot (actualizado_por);
create index if not exists genesys_fichas_actualizado_por_idx on public.genesys_fichas (actualizado_por);
create index if not exists genesys_versiones_creado_por_idx   on public.genesys_versiones (creado_por);
create index if not exists asesores_ausente_reemplazo_idx     on public.asesores (ausente_reemplazo);
-- Búsqueda de contactos @lid (esContactoLid)
create index if not exists webhook_eventos_remote_jid_idx
  on public.webhook_eventos ((payload->'cuerpo'->'data'->'key'->>'remoteJid'))
  where (payload->'cuerpo'->'data'->'key'->>'remoteJid') is not null;

-- 2. Permiso
revoke execute on function public.puede_programar_ausencia(uuid) from public, anon;
grant execute on function public.puede_programar_ausencia(uuid) to authenticated;

-- 3. Limpieza del registro de eventos
create or replace function public.limpiar_webhook_eventos()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_borrados integer;
begin
  delete from public.webhook_eventos
  where recibido_at < now() - interval '90 days'
    and coalesce(payload->'cuerpo'->'data'->'key'->>'remoteJid', '') not like '%@lid';
  get diagnostics v_borrados = row_count;
  return v_borrados;
end $$;
revoke execute on function public.limpiar_webhook_eventos() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'limpiar-webhook-eventos';
    -- Domingo 3:00 am (hora de Perú)
    perform cron.schedule('limpiar-webhook-eventos', '0 8 * * 0', $c$select public.limpiar_webhook_eventos()$c$);
  end if;
end $do$;

-- 4. Alertas de error
create table if not exists public.alertas_sistema (
  clave       text primary key,
  conteo      integer not null default 0,
  detalle     text,
  primera_at  timestamptz not null default now(),
  ultima_at   timestamptz not null default now(),
  avisado_at  timestamptz
);
alter table public.alertas_sistema enable row level security;
revoke all on public.alertas_sistema from anon, authenticated;

/** Registra un error; devuelve true si toca avisar (primer aviso o pasó una hora del anterior). */
create or replace function public.registrar_error(p_clave text, p_detalle text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_avisar boolean;
begin
  insert into public.alertas_sistema (clave, conteo, detalle)
  values (left(p_clave, 120), 1, left(p_detalle, 1000))
  on conflict (clave) do update
    set conteo = public.alertas_sistema.conteo + 1, detalle = excluded.detalle, ultima_at = now();
  update public.alertas_sistema set avisado_at = now()
  where clave = left(p_clave, 120) and (avisado_at is null or avisado_at < now() - interval '1 hour')
  returning true into v_avisar;
  return coalesce(v_avisar, false);
end $$;
revoke execute on function public.registrar_error(text, text) from public, anon, authenticated;
grant execute on function public.registrar_error(text, text) to service_role;
