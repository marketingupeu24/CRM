-- =====================================================================
--  Migración 16: origen del lead y reasignación automática
--  - leads.origen_campana: cómo nos conoció (Facebook, TikTok, recomendación, feria...).
--  - Reasignación: lead asignado que su asesor no contactó en N horas pasa al
--    siguiente asesor de la rotación (máximo de veces configurable, solo en horario
--    de oficina). La Edge Function "genesys/reasignar" lo ejecuta y avisa al nuevo asesor.
-- =====================================================================

alter table public.leads
  add column origen_campana text,
  add column reasignaciones int not null default 0;

create index idx_leads_origen_campana on public.leads (origen_campana);

-- ---------------------------------------------------------------------
-- Reasigna los leads sin contactar. Devuelve los cambios para avisar a los nuevos asesores.
-- ---------------------------------------------------------------------
create or replace function public.reasignar_sin_contacto(p_horas int default 4, p_maximo int default 2, p_solo_horario boolean default true)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_lead      public.leads;
  v_anterior  public.asesores;
  v_nuevo     public.asesores;
  v_cambios   jsonb := '[]'::jsonb;
begin
  -- Solo en horario de oficina (8:00 a 20:00 en Lima)
  if p_solo_horario and extract(hour from now() at time zone 'America/Lima') not between 8 and 19 then
    return v_cambios;
  end if;

  perform set_config('crm.asignacion_sistema', 'on', true);

  for v_lead in
    select * from public.leads
    where estado = 'lead_asignado'
      and asesor_id is not null
      and primer_contacto_asesor_at is null
      and fecha_asignado < now() - make_interval(hours => p_horas)
      and reasignaciones < p_maximo
    order by fecha_asignado
    for update skip locked
  loop
    select * into v_anterior from public.asesores where id = v_lead.asesor_id;

    -- Mismo reparto que asignar_asesor_lead, sin el asesor actual
    select * into v_nuevo from public.asesores
    where activo and rol = 'asesor' and id <> v_lead.asesor_id
      and case when v_lead.programa = 'cepre' then 'CEPRE' = any (carreras)
               else v_lead.carrera_interes = any (carreras) end
    order by ultimo_lead_asignado nulls first, created_at, nombre
    limit 1 for update skip locked;

    if v_nuevo.id is null then
      select * into v_nuevo from public.asesores
      where activo and rol = 'asesor' and id <> v_lead.asesor_id and carreras = '{}'
      order by ultimo_lead_asignado nulls first, created_at, nombre
      limit 1 for update skip locked;
    end if;

    continue when v_nuevo.id is null;   -- no hay a quién pasarlo

    update public.asesores set ultimo_lead_asignado = now() where id = v_nuevo.id;
    update public.leads
    set asesor_id = v_nuevo.id,
        fecha_asignado = now(),
        reasignaciones = reasignaciones + 1,
        notificacion_estado = 'pendiente'
    where id = v_lead.id;

    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'sistema',
            format('Reasignado automáticamente de %s a %s: no fue contactado en %s h', v_anterior.nombre, v_nuevo.nombre, p_horas));

    v_cambios := v_cambios || jsonb_build_object(
      'lead_id', v_lead.id, 'asesor_anterior', v_anterior.nombre,
      'asesor_nuevo', v_nuevo.nombre, 'asesor_telefono', v_nuevo.telefono);
  end loop;

  return v_cambios;
end $$;

revoke execute on function public.reasignar_sin_contacto(int, int, boolean) from public, anon, authenticated;
grant  execute on function public.reasignar_sin_contacto(int, int, boolean) to service_role;

-- ---------------------------------------------------------------------
-- Llamada genérica a la API de Genesys desde la base (pg_net + secretos de Vault)
-- ---------------------------------------------------------------------
create or replace function public.llamar_genesys(p_accion text, p_cuerpo jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url   text;
  v_token text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault') then
    return;
  end if;
  execute $q$ select
      (select decrypted_secret from vault.decrypted_secrets where name = 'genesys_url'),
      (select decrypted_secret from vault.decrypted_secrets where name = 'genesys_token') $q$
    into v_url, v_token;
  if v_url is null or v_token is null then return; end if;
  execute $q$ select net.http_post(
      url := $1 || '/' || $2,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-genesys-token', $3),
      body := $4) $q$
    using v_url, p_accion, v_token, p_cuerpo;
end $$;

revoke execute on function public.llamar_genesys(text, jsonb) from public, anon, authenticated;

-- Cron cada 15 minutos
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$ select cron.unschedule('genesys-reasignar')
                where exists (select 1 from cron.job where jobname = 'genesys-reasignar') $q$;
    execute $q$ select cron.schedule('genesys-reasignar', '*/15 * * * *', 'select public.llamar_genesys(''reasignar'')') $q$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Dashboard: leads por origen (y matriculados por origen) y leads reasignados
-- ---------------------------------------------------------------------
create or replace function public.resumen_dashboard(
  p_desde        date default null,
  p_hasta        date default null,
  p_convocatoria text default null,
  p_asesor_id    uuid default null
)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with
  rango as (
    select coalesce(p_desde, (select min(created_at at time zone 'America/Lima')::date from public.leads),
                    (now() at time zone 'America/Lima')::date) as desde,
           coalesce(p_hasta, (now() at time zone 'America/Lima')::date) as hasta
  ),
  l as (
    select *
    from public.leads
    where (p_desde is null or created_at >= (p_desde::timestamp at time zone 'America/Lima'))
      and (p_hasta is null or created_at <  ((p_hasta + 1)::timestamp at time zone 'America/Lima'))
      and (p_convocatoria is null or convocatoria = p_convocatoria)
      and (p_asesor_id is null or asesor_id = p_asesor_id)
  ),
  -- Más de 92 días: se agrupa por semana para que el gráfico siga siendo legible
  unidad as (
    select case when (select hasta - desde from rango) > 92 then 'semana' else 'dia' end as u
  ),
  periodos as (
    select g::date as periodo
    from rango, unidad,
         generate_series(
           case when u = 'semana' then date_trunc('week', desde) else desde end,
           hasta,
           case when u = 'semana' then interval '1 week' else interval '1 day' end
         ) g
  ),
  conteo_periodo as (
    select case when (select u from unidad) = 'semana'
                then date_trunc('week', created_at at time zone 'America/Lima')::date
                else (created_at at time zone 'America/Lima')::date end as periodo,
           count(*)::int as total
    from l
    group by 1
  )
  select jsonb_build_object(
    'total',        (select count(*)::int from l),
    'interesados',  (select count(*)::int from l where fecha_interesado is not null),
    'asignados',    (select count(*)::int from l where asesor_id is not null),
    'contactados',  (select count(*)::int from l where estado in ('lead_contactado', 'lead_atendido', 'lead_inscrito', 'lead_matriculado')),
    'matriculados', (select count(*)::int from l where estado = 'lead_matriculado'),
    'no_interesados', (select count(*)::int from l where estado = 'lead_no_interesado'),
    'perdidos',     (select count(*)::int from l where estado = 'lead_perdido'),
    'primera_respuesta_min', (
      select round((percentile_cont(0.5) within group (
               order by extract(epoch from primer_contacto_asesor_at - fecha_asignado) / 60))::numeric, 1)
      from l
      where primer_contacto_asesor_at is not null and fecha_asignado is not null
        and primer_contacto_asesor_at >= fecha_asignado
    ),
    'contactados_a_tiempo', (
      select count(*)::int from l
      where primer_contacto_asesor_at is not null and fecha_asignado is not null
        and primer_contacto_asesor_at <= fecha_asignado + interval '2 hours'
    ),
    'con_primer_contacto', (
      select count(*)::int from l where primer_contacto_asesor_at is not null and fecha_asignado is not null
    ),
    'sin_contactar_2h', (
      select count(*)::int from l where estado = 'lead_asignado' and fecha_asignado < now() - interval '2 hours'
    ),

    'por_estado', (
      select coalesce(jsonb_agg(jsonb_build_object('estado', estado, 'total', n) order by estado), '[]'::jsonb)
      from (select estado, count(*)::int n from l group by estado) s
    ),

    'por_carrera', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'carrera', carrera, 'total', n, 'interesados', i, 'matriculados', m) order by n desc, carrera), '[]'::jsonb)
      from (
        select case when programa = 'cepre' then 'CePre' else coalesce(carrera_interes, 'Sin carrera') end as carrera,
               count(*)::int n,
               (count(*) filter (where fecha_interesado is not null))::int i,
               (count(*) filter (where estado = 'lead_matriculado'))::int m
        from l group by 1
      ) s
    ),

    'por_asesor', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'asesor_id', id, 'asesor', nombre, 'activo', activo, 'total', total,
               'sin_contactar', sin_contactar, 'contactados', contactados, 'inscritos', inscritos,
               'matriculados', matriculados, 'perdidos', perdidos, 'primera_respuesta_min', primera_respuesta_min,
               'sin_contactar_2h', sin_contactar_2h) order by total desc, nombre), '[]'::jsonb)
      from (
        select a.id, a.nombre, a.activo,
               count(l.id)::int total,
               (count(l.id) filter (where l.estado in ('lead_interesado', 'lead_asignado')))::int sin_contactar,
               (count(l.id) filter (where l.estado in ('lead_contactado', 'lead_atendido')))::int contactados,
               (count(l.id) filter (where l.estado = 'lead_inscrito'))::int inscritos,
               (count(l.id) filter (where l.estado = 'lead_matriculado'))::int matriculados,
               (count(l.id) filter (where l.estado in ('lead_perdido', 'lead_no_interesado')))::int perdidos,
               round((percentile_cont(0.5) within group (
                 order by extract(epoch from l.primer_contacto_asesor_at - l.fecha_asignado) / 60)
                 filter (where l.primer_contacto_asesor_at >= l.fecha_asignado))::numeric, 1) primera_respuesta_min,
               (count(l.id) filter (where l.estado = 'lead_asignado' and l.fecha_asignado < now() - interval '2 hours'))::int sin_contactar_2h
        from public.asesores a
        left join l on l.asesor_id = a.id
        where a.rol = 'asesor'
        group by a.id, a.nombre, a.activo
      ) s
      where total > 0 or activo
    ),

    'por_motivo', (
      select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'total', n) order by n desc, motivo), '[]'::jsonb)
      from (
        select coalesce(nullif(trim(split_part(motivo_no_interes, ':', 1)), ''), 'Sin motivo') as motivo, count(*)::int n
        from l where estado in ('lead_perdido', 'lead_no_interesado')
        group by 1
      ) s
    ),

    'por_origen', (
      select coalesce(jsonb_agg(jsonb_build_object('origen', origen, 'total', n, 'matriculados', m) order by n desc, origen), '[]'::jsonb)
      from (
        select coalesce(nullif(trim(origen_campana), ''), 'Sin dato') as origen, count(*)::int n,
               (count(*) filter (where estado = 'lead_matriculado'))::int m
        from l group by 1
      ) s
    ),
    'reasignados', (select count(*)::int from l where reasignaciones > 0),

    'por_periodo', (
      select coalesce(jsonb_agg(jsonb_build_object('periodo', p.periodo, 'total', coalesce(c.total, 0)) order by p.periodo), '[]'::jsonb)
      from periodos p left join conteo_periodo c using (periodo)
    ),
    'unidad_periodo', (select u from unidad),
    'desde', (select desde from rango),
    'hasta', (select hasta from rango)
  )
$$;

revoke execute on function public.resumen_dashboard(date, date, text, uuid) from public, anon;
grant  execute on function public.resumen_dashboard(date, date, text, uuid) to authenticated;
