-- =====================================================================
--  Migración 3: vistas para reportes de leads
--  security_invoker = true: las vistas respetan el RLS de quien consulta.
--  Así el asesor ve solo sus números y el administrador ve todo.
--  "Lead interesado" = llegó alguna vez a lead_interesado (fecha_interesado no nula),
--  aunque luego haya avanzado o se haya perdido.
-- =====================================================================

create or replace view public.vista_leads_por_estado
with (security_invoker = true) as
select estado, count(*)::int as total_leads
from public.leads
group by estado
order by estado;

create or replace view public.vista_leads_por_carrera
with (security_invoker = true) as
select
  coalesce(carrera_interes, 'Sin carrera')                          as carrera,
  count(*)::int                                                     as total_leads,
  (count(*) filter (where estado = 'lead_no_interesado'))::int      as leads_no_interesados,
  (count(*) filter (where fecha_interesado is not null))::int       as leads_interesados,
  (count(*) filter (where estado = 'lead_matriculado'))::int        as leads_matriculados
from public.leads
group by 1
order by total_leads desc;

create or replace view public.vista_leads_por_asesor
with (security_invoker = true) as
select
  a.id                                                              as asesor_id,
  a.nombre                                                          as asesor,
  count(l.id)::int                                                  as leads_asignados,
  (count(l.id) filter (where l.estado = 'lead_asignado'))::int      as leads_sin_contactar,
  (count(l.id) filter (where l.estado = 'lead_contactado'))::int    as leads_contactados,
  (count(l.id) filter (where l.estado = 'lead_inscrito'))::int      as leads_inscritos,
  (count(l.id) filter (where l.estado = 'lead_matriculado'))::int   as leads_matriculados,
  (count(l.id) filter (where l.estado = 'lead_perdido'))::int       as leads_perdidos
from public.asesores a
left join public.leads l on l.asesor_id = a.id
where a.rol = 'asesor'
group by a.id, a.nombre
order by leads_asignados desc;

-- Embudo: lead -> lead interesado -> lead matriculado (tasas en %)
create or replace view public.vista_embudo_conversion
with (security_invoker = true) as
with t as (
  select
    count(*)::int                                                  as total_leads,
    (count(*) filter (where fecha_interesado is not null))::int    as leads_interesados,
    (count(*) filter (where estado = 'lead_matriculado'))::int     as leads_matriculados
  from public.leads
)
select
  total_leads,
  leads_interesados,
  leads_matriculados,
  round(100.0 * leads_interesados  / nullif(total_leads, 0), 1)       as tasa_interes,
  round(100.0 * leads_matriculados / nullif(leads_interesados, 0), 1) as tasa_matricula,
  round(100.0 * leads_matriculados / nullif(total_leads, 0), 1)       as tasa_global
from t;

-- Leads nuevos por día (últimos 30 días), para el gráfico del dashboard
create or replace view public.vista_leads_por_dia
with (security_invoker = true) as
select
  (created_at at time zone 'America/Lima')::date as dia,
  count(*)::int                                  as total_leads
from public.leads
where created_at >= now() - interval '30 days'
group by 1
order by 1;
