-- =====================================================================
--  Ausencia temporal de un asesor (viaje, permiso, enfermedad): por horas o días.
--  La programa el propio usuario (Mi cuenta) o un admin (Usuarios).
--  Mientras dure:
--  - No recibe leads nuevos (sale del reparto: "Recibe leads" se apaga y al
--    terminar vuelve como estaba).
--  - Sus leads SIGUEN siendo suyos. Si eligió un reemplazo, este los ve como
--    apoyo (ficha y chat, puede escribirles) y le llegan los avisos de sus mensajes.
--  - Genesys sabe que su asesor está ausente y quién lo cubre.
--  aplicar_ausencias() empieza y termina las ausencias (cron cada 5 minutos).
-- =====================================================================

alter table public.asesores
  add column if not exists ausente_desde     timestamptz,
  add column if not exists ausente_hasta     timestamptz,
  add column if not exists ausente_reemplazo uuid references public.asesores (id) on delete set null,
  add column if not exists ausente_motivo    text,
  add column if not exists ausencia_activa   boolean not null default false,
  add column if not exists activo_antes      boolean;
comment on column public.asesores.ausencia_activa is 'La ausencia está en curso: no recibe leads; su reemplazo cubre sus leads';
comment on column public.asesores.activo_antes is 'Cómo estaba "Recibe leads" antes de la ausencia (se restaura al terminar)';

create or replace function public.aplicar_ausencias()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Terminan (o vencieron antes de empezar): vuelve "Recibe leads" como estaba
  update public.asesores
  set activo            = case when ausencia_activa then coalesce(activo_antes, activo) else activo end,
      ausencia_activa   = false,
      activo_antes      = null,
      ausente_desde     = null,
      ausente_hasta     = null,
      ausente_reemplazo = null,
      ausente_motivo    = null
  where ausente_hasta is not null and ausente_hasta <= now();

  -- Empiezan
  update public.asesores
  set activo_antes    = activo,
      activo          = false,
      ausencia_activa = true
  where not ausencia_activa and ausente_desde <= now() and ausente_hasta > now();
end $$;
revoke execute on function public.aplicar_ausencias() from public, anon, authenticated;

/** ¿Puedo programar la ausencia de este asesor? (la propia, o la de otro con el módulo "usuarios") */
create or replace function public.puede_programar_ausencia(p_asesor_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_asesor_id = public.mi_asesor_id()
      or (public.tiene_permiso('usuarios')
          and (not coalesce((select superadmin from public.asesores where id = p_asesor_id), false) or public.es_superadmin()))
$$;

create or replace function public.programar_ausencia(
  p_asesor_id uuid, p_desde timestamptz, p_hasta timestamptz, p_reemplazo uuid default null, p_motivo text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_asesor    public.asesores;
  v_reemplazo public.asesores;
  v_desde     timestamptz := greatest(coalesce(p_desde, now()), now() - interval '1 minute');
begin
  if not public.puede_programar_ausencia(p_asesor_id) then
    raise exception 'No puedes programar la ausencia de este usuario';
  end if;
  select * into v_asesor from public.asesores where id = p_asesor_id and eliminado_at is null;
  if v_asesor.id is null then raise exception 'Usuario no encontrado'; end if;
  if p_hasta is null or p_hasta <= v_desde then raise exception 'La ausencia debe terminar después de empezar'; end if;
  if p_hasta <= now() then raise exception 'La fecha de regreso ya pasó'; end if;
  if p_hasta > v_desde + interval '60 days' then raise exception 'La ausencia puede durar como máximo 60 días'; end if;
  if p_reemplazo is not null then
    if p_reemplazo = p_asesor_id then raise exception 'El reemplazo debe ser otra persona'; end if;
    select * into v_reemplazo from public.asesores where id = p_reemplazo and eliminado_at is null;
    if v_reemplazo.id is null then raise exception 'Reemplazo no válido'; end if;
    if v_reemplazo.ausencia_activa or (v_reemplazo.ausente_desde < p_hasta and v_reemplazo.ausente_hasta > v_desde) then
      raise exception '% también estará ausente en esas fechas: elige a otra persona', v_reemplazo.nombre;
    end if;
  end if;

  update public.asesores
  set ausente_desde     = case when ausencia_activa then ausente_desde else v_desde end,
      ausente_hasta     = p_hasta,
      ausente_reemplazo = p_reemplazo,
      ausente_motivo    = nullif(left(trim(coalesce(p_motivo, '')), 120), '')
  where id = p_asesor_id;
  perform public.aplicar_ausencias();

  -- Aviso al reemplazo (si lo hay y cambió)
  if p_reemplazo is not null and p_reemplazo is distinct from v_asesor.ausente_reemplazo then
    perform public.llamar_genesys('ausencia', jsonb_build_object('asesor_id', p_asesor_id));
  end if;
  return jsonb_build_object('ok', true, 'activa', (select ausencia_activa from public.asesores where id = p_asesor_id));
end $$;
revoke execute on function public.programar_ausencia(uuid, timestamptz, timestamptz, uuid, text) from public, anon;
grant execute on function public.programar_ausencia(uuid, timestamptz, timestamptz, uuid, text) to authenticated;

create or replace function public.terminar_ausencia(p_asesor_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.puede_programar_ausencia(p_asesor_id) then
    raise exception 'No puedes cambiar la ausencia de este usuario';
  end if;
  update public.asesores set ausente_hasta = now() where id = p_asesor_id and ausente_hasta is not null;
  perform public.aplicar_ausencias();
end $$;
revoke execute on function public.terminar_ausencia(uuid) from public, anon;
grant execute on function public.terminar_ausencia(uuid) to authenticated;

/** Compañeros que pueden cubrir una ausencia (cualquier usuario puede verlos para elegir). */
create or replace function public.posibles_reemplazos()
returns table (id uuid, nombre text)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.nombre from public.asesores a
  where a.eliminado_at is null and a.user_id is not null and a.telefono is not null
    and (a.rol = 'asesor' or a.activo or a.ausencia_activa)
  order by a.nombre
$$;
revoke execute on function public.posibles_reemplazos() from public, anon;
grant execute on function public.posibles_reemplazos() to authenticated;

-- El reemplazo es apoyo de todos los leads del ausente mientras dure la ausencia
create or replace function public.es_apoyo(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.lead_apoyo where lead_id = p_lead_id and asesor_id = public.mi_asesor_id())
      or exists (select 1 from public.leads l join public.asesores a on a.id = l.asesor_id
                 where l.id = p_lead_id and a.ausencia_activa and a.ausente_reemplazo = public.mi_asesor_id())
$$;

do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute $p$ drop policy if exists "adjuntos: quien ve el lead" on storage.objects $p$;
    execute $p$ create policy "adjuntos: quien ve el lead" on storage.objects for select to authenticated
      using (bucket_id = 'adjuntos'
             and (exists (select 1 from public.leads l where l.id::text = (storage.foldername(name))[1])
                  or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.es_apoyo(((storage.foldername(name))[1])::uuid)))) $p$;
  end if;
end $do$;

drop function if exists public.mis_leads_apoyo();
create or replace function public.mis_leads_apoyo()
returns table (id uuid, nombre text, telefono text, asesor text, motivo text, desde timestamptz, ultimo_contacto timestamptz, cubriendo boolean)
language sql stable security definer set search_path = ''
as $$
  (select l.id, l.nombre, l.telefono, a.nombre, ap.motivo, ap.created_at, l.ultimo_contacto, false
   from public.lead_apoyo ap
   join public.leads l on l.id = ap.lead_id and l.eliminado_at is null
   left join public.asesores a on a.id = l.asesor_id
   where ap.asesor_id = public.mi_asesor_id()
   order by ap.created_at desc
   limit 50)
  union all
  (select l.id, l.nombre, l.telefono, a.nombre,
          'lo cubres hasta ' || to_char(a.ausente_hasta at time zone 'America/Lima', 'DD/MM HH24:MI'),
          a.ausente_desde, l.ultimo_contacto, true
   from public.asesores a
   join public.leads l on l.asesor_id = a.id and l.eliminado_at is null
   where a.ausencia_activa and a.ausente_reemplazo = public.mi_asesor_id()
     and l.estado not in ('lead_perdido', 'lead_no_interesado', 'lead_matriculado')
   order by l.sin_responder desc, l.ultimo_contacto desc nulls last
   limit 200)
$$;
revoke execute on function public.mis_leads_apoyo() from public, anon;
grant execute on function public.mis_leads_apoyo() to authenticated;

do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'aplicar-ausencias';
    perform cron.schedule('aplicar-ausencias', '*/5 * * * *', $c$select public.aplicar_ausencias()$c$);
  end if;
end $do$;
