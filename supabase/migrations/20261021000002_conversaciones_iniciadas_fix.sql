-- Corrige la ambigüedad de asesor_id (columna de salida vs. columna de leads) en conversaciones_iniciadas.

create or replace function public.conversaciones_iniciadas(p_desde date default null, p_hasta date default null)
returns table(asesor_id uuid, asesor text, mensajes_enviados bigint, conversaciones bigint,
              iniciadas bigint, iniciadas_respondidas bigint, iniciadas_por_alumno bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_desde timestamptz := (coalesce(p_desde, date '2000-01-01')::timestamp at time zone 'America/Lima');
  v_hasta timestamptz := ((coalesce(p_hasta, date '2100-01-01') + 1)::timestamp at time zone 'America/Lima');
begin
  if not public.es_superadmin() then
    raise exception 'Solo el super admin puede ver esta información.' using errcode = '42501';
  end if;
  return query
  with primeros as (
    select p.* from public.primeros_mensajes_chat() p
    join public.leads l on l.id = p.lead_id and l.eliminado_at is null
    where p.created_at >= v_desde and p.created_at < v_hasta
  ),
  enviados as (
    select i.autor_id, count(*) as mensajes, count(distinct i.lead_id) as chats
    from public.lead_interacciones i
    join public.leads l on l.id = i.lead_id and l.eliminado_at is null
    where i.tipo = 'mensaje_asesor' and i.autor_id is not null and i.estado_envio is distinct from 'error'
      and i.created_at >= v_desde and i.created_at < v_hasta
    group by i.autor_id
  ),
  iniciadas as (
    select p.autor_id, count(*) as total,
           count(*) filter (where exists (
             select 1 from public.lead_interacciones r
             where r.lead_id = p.lead_id and r.tipo = 'mensaje_lead' and r.created_at > p.created_at)) as respondidas
    from primeros p where p.tipo = 'mensaje_asesor' and p.autor_id is not null
    group by p.autor_id
  ),
  del_alumno as (
    -- Chats que empezó el alumno, según el asesor que tiene hoy el lead
    select l.asesor_id, count(*) as total
    from primeros p join public.leads l on l.id = p.lead_id
    where p.tipo = 'mensaje_lead'
    group by l.asesor_id
  ),
  asesores as (
    select autor_id as id from enviados union select autor_id from iniciadas union select asesor_id from del_alumno
  )
  select x.id, coalesce(a.nombre, 'Sin asesor (Genesys)'),
         coalesce(e.mensajes, 0), coalesce(e.chats, 0),
         coalesce(n.total, 0), coalesce(n.respondidas, 0), coalesce(d.total, 0)
  from asesores x
  left join public.asesores a on a.id = x.id
  left join enviados e on e.autor_id is not distinct from x.id
  left join iniciadas n on n.autor_id is not distinct from x.id
  left join del_alumno d on d.asesor_id is not distinct from x.id
  order by coalesce(n.total, 0) desc, coalesce(e.mensajes, 0) desc;
end;
$$;
revoke all on function public.conversaciones_iniciadas(date, date) from public, anon;
grant execute on function public.conversaciones_iniciadas(date, date) to authenticated;
