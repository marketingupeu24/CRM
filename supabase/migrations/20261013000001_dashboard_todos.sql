-- =====================================================================
--  Permiso nuevo: "Dashboard de todo el equipo" (dashboard_todos).
--  Con él, el Dashboard y el embudo muestran los números de todos los asesores
--  (y el filtro por asesor); sin él, solo los de sus propios leads. Es aparte de
--  "Ver leads de todo el equipo" (que sigue decidiendo qué leads ve en las listas).
--  Para no cambiar lo que cada uno ve hoy, se da a quienes ya tenían ver_todos.
--  Las funciones pasan a SECURITY DEFINER y filtran ellas mismas (antes lo hacía el RLS).
-- =====================================================================

alter table public.asesores drop constraint if exists asesores_permisos_validos;
alter table public.asesores add constraint asesores_permisos_validos check (permisos <@ array[
  'pendientes', 'chats', 'leads', 'kanban', 'registrar', 'costos', 'actividades', 'qr_asesor', 'dashboard', 'dashboard_todos', 'campanas', 'exportar',
  'ver_todos', 'asignar', 'repartir', 'editar_celular', 'papelera',
  'usuarios', 'respuestas', 'gestionar_campanas', 'conocimiento'
]);

update public.asesores set permisos = array_append(permisos, 'dashboard_todos')
where 'ver_todos' = any (permisos) and not ('dashboard_todos' = any (permisos));

CREATE OR REPLACE FUNCTION public.resumen_dashboard(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_convocatoria text DEFAULT NULL::text, p_asesor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with
  rango as (
    select coalesce(p_desde, (select min(created_at at time zone 'America/Lima')::date from public.leads),
                    (now() at time zone 'America/Lima')::date) as desde,
           coalesce(p_hasta, (now() at time zone 'America/Lima')::date) as hasta
  ),
  l as (
    select *
    from public.leads
    where eliminado_at is null
      -- Dashboard de todo el equipo (permiso dashboard_todos) o solo sus leads
      and (public.tiene_permiso('dashboard_todos') or asesor_id = public.mi_asesor_id())
      and (p_desde is null or created_at >= (p_desde::timestamp at time zone 'America/Lima'))
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
        where (a.rol = 'asesor' or a.activo)
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
$function$
;

CREATE OR REPLACE FUNCTION public.embudo_por_origen(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_convocatoria text DEFAULT NULL::text, p_asesor_id uuid DEFAULT NULL::uuid, p_por text DEFAULT 'origen'::text)
 RETURNS TABLE(grupo text, escribieron integer, registrados integer, contactados integer, inscritos integer, matriculados integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with l as (
    select *
    from public.leads
    where eliminado_at is null
      -- Dashboard de todo el equipo (permiso dashboard_todos) o solo sus leads
      and (public.tiene_permiso('dashboard_todos') or asesor_id = public.mi_asesor_id())
      and (p_desde is null or created_at >= (p_desde::timestamp at time zone 'America/Lima'))
      and (p_hasta is null or created_at <  ((p_hasta + 1)::timestamp at time zone 'America/Lima'))
      and (p_convocatoria is null or convocatoria = p_convocatoria)
      and (p_asesor_id is null or asesor_id = p_asesor_id)
  )
  select coalesce(case when p_por = 'canal' then canal_entrada else origen_campana end, 'Sin dato') as grupo,
         count(*)::int,
         count(*) filter (where dni is not null or estado not in ('lead_nuevo', 'lead_en_conversacion', 'lead_no_interesado'))::int,
         count(*) filter (where primer_contacto_asesor_at is not null
                             or estado in ('lead_contactado', 'lead_atendido', 'lead_inscrito', 'lead_matriculado'))::int,
         count(*) filter (where estado in ('lead_inscrito', 'lead_matriculado'))::int,
         count(*) filter (where estado = 'lead_matriculado')::int
  from l
  group by 1
  order by 2 desc
$function$
;
