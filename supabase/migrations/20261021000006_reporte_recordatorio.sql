-- Reporte de envíos de un recordatorio: a quién se mandó, si llegó, si respondió o pidió no recibir más,
-- y quiénes faltan. Solo lectura.

create or replace function public.reporte_recordatorio(p_id bigint)
returns table(lead_id uuid, nombre text, telefono text, carrera text, asesor text, estado text,
              enviado_at timestamptz, error text, respondio_at timestamptz, respuesta text, baja boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('conocimiento') then raise exception 'Sin permiso'; end if;
  return query
  select l.id, l.nombre, l.telefono, coalesce(l.carrera_interes, l.modalidad), a.nombre,
         case when e.enviado_at is not null then 'enviado' when e.error is not null then 'error' else 'enviando' end,
         e.enviado_at, e.error, resp.created_at, left(resp.contenido, 160), l.no_recordatorios
  from public.recordatorios_envios e
  join public.leads l on l.id = e.lead_id
  left join public.asesores a on a.id = l.asesor_id
  left join lateral (
    select m.created_at, m.contenido from public.lead_interacciones m
    where m.lead_id = e.lead_id and m.tipo = 'mensaje_lead' and e.enviado_at is not null and m.created_at > e.enviado_at
    order by m.created_at limit 1
  ) resp on true
  where e.recordatorio_id = p_id
  union all
  select d.id, d.nombre, d.telefono, coalesce(d.carrera_interes, d.modalidad), a.nombre, 'pendiente',
         null, null, null, null, d.no_recordatorios
  from public.destinatarios_recordatorio(p_id) d
  left join public.asesores a on a.id = d.asesor_id;
end $$;
revoke all on function public.reporte_recordatorio(bigint) from public, anon;
grant execute on function public.reporte_recordatorio(bigint) to authenticated;
