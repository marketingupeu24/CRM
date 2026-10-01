-- =====================================================================
--  Migración 13: tiempo de primera respuesta del asesor
--  primer_contacto_asesor_at = primer mensaje enviado desde el CRM, o el momento en que
--  el lead pasó a contactado (o más adelante) si el asesor lo contactó por otro medio.
--  El dashboard muestra la mediana (asignación -> primer contacto) por asesor.
-- =====================================================================

alter table public.leads add column primer_contacto_asesor_at timestamptz;

-- Primer mensaje enviado por el asesor desde el chat
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
        ultimo_mensaje_at    = new.created_at,
        bot_pausado_hasta    = greatest(coalesce(bot_pausado_hasta, now()), now() + interval '5 hours'),
        primer_contacto_asesor_at = coalesce(primer_contacto_asesor_at, new.created_at)
    where id = new.lead_id;
  end if;
  return new;
end $$;

-- Paso a contactado (o más adelante) sin mensaje del chat: cuenta como primer contacto
create or replace function public.fn_leads_pausa_bot()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'lead_contactado' then
      new.bot_pausado_hasta := greatest(coalesce(new.bot_pausado_hasta, now()), now() + interval '5 hours');
    elsif new.estado in ('lead_atendido', 'lead_matriculado', 'lead_perdido') then
      new.bot_pausado_hasta := null;
    end if;

    if new.primer_contacto_asesor_at is null and new.asesor_id is not null
       and new.estado in ('lead_contactado', 'lead_atendido', 'lead_inscrito', 'lead_matriculado') then
      new.primer_contacto_asesor_at := now();
    end if;
  end if;
  return new;
end $$;

-- Datos existentes: primer mensaje enviado o primer paso a contactado
update public.leads l
set primer_contacto_asesor_at = x.primero
from (
  select lead_id, min(created_at) as primero
  from public.lead_interacciones
  where (tipo = 'mensaje_asesor' and estado_envio = 'enviado')
     or (tipo = 'cambio_estado' and contenido like '% -> lead_contactado')
  group by lead_id
) x
where x.lead_id = l.id and l.primer_contacto_asesor_at is null;

-- ---------------------------------------------------------------------
-- Dashboard: tiempo de primera respuesta (mediana en minutos) y leads sin contactar
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
