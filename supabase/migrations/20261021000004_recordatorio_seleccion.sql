-- Recordatorios a alumnos: elegir a quiénes se manda.
-- solo_leads: null = a todos los que cumplan los filtros (también a los que se sumen después);
-- con ids = solo a esos alumnos (siempre que sigan cumpliendo los filtros y no lo hayan recibido).

alter table public.recordatorios_alumnos add column if not exists solo_leads uuid[];

-- p_ignorar_seleccion: para listar a todos los candidatos (con su casilla) aunque haya una selección guardada
drop function if exists public.destinatarios_recordatorio(bigint);
create function public.destinatarios_recordatorio(p_id bigint, p_ignorar_seleccion boolean default false)
returns setof public.leads
language sql
stable
security definer
set search_path = ''
as $$
  select l.*
  from public.recordatorios_alumnos r
  join public.leads l on true
  where r.id = p_id
    and l.eliminado_at is null
    and not l.no_recordatorios
    and l.ultimo_mensaje_lead_at is not null                       -- ya nos escribió
    and l.estado not in ('lead_inscrito', 'lead_matriculado', 'lead_perdido', 'lead_no_interesado')
    and (not r.solo_registrados or l.dni is not null)
    and (cardinality(r.carreras) = 0
         or exists (select 1 from unnest(r.carreras) c where coalesce(l.carrera_interes, l.modalidad, '') ilike '%' || c || '%'))
    and not exists (select 1 from unnest(r.excluir_carreras) c where coalesce(l.carrera_interes, l.modalidad, '') ilike '%' || c || '%')
    and (p_ignorar_seleccion or r.solo_leads is null or l.id = any(r.solo_leads))
    and not exists (select 1 from public.recordatorios_envios e where e.recordatorio_id = r.id and e.lead_id = l.id)
    -- Automático por inactividad
    and (r.dias_sin_contacto is null or (
      l.asesor_id is not null
      -- último contacto: mensajes del chat (alumno o asesor), su último mensaje al bot o una llamada / "ya le respondí"
      and coalesce(greatest(l.ultimo_mensaje_at, l.ultimo_contacto, l.atendido_at), l.created_at)
          between now() - make_interval(days => r.dias_maximo) and now() - make_interval(days => r.dias_sin_contacto)
      -- el asesor ya agendó contactarlo
      and not exists (select 1 from public.tareas t where t.lead_id = l.id and t.completada_at is null and t.vence_at > now())
      -- una sola vez por alumno entre todos los recordatorios automáticos
      and not exists (select 1 from public.recordatorios_envios e join public.recordatorios_alumnos r2 on r2.id = e.recordatorio_id
                      where e.lead_id = l.id and r2.dias_sin_contacto is not null)
    ))
$$;
revoke all on function public.destinatarios_recordatorio(bigint, boolean) from public, anon, authenticated;

-- Para el panel: candidatos de un recordatorio y si están marcados
create or replace function public.candidatos_recordatorio(p_id bigint)
returns table(id uuid, nombre text, telefono text, carrera text, asesor text, ultimo_mensaje_at timestamptz, marcado boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('conocimiento') then raise exception 'Sin permiso'; end if;
  return query
  select d.id, d.nombre, d.telefono, coalesce(d.carrera_interes, d.modalidad), a.nombre, d.ultimo_mensaje_at,
         (r.solo_leads is null or d.id = any(r.solo_leads))
  from public.destinatarios_recordatorio(p_id, true) d
  join public.recordatorios_alumnos r on r.id = p_id
  left join public.asesores a on a.id = d.asesor_id
  order by d.ultimo_mensaje_at desc nulls last
  limit 2000;
end $$;
revoke all on function public.candidatos_recordatorio(bigint) from public, anon;
grant execute on function public.candidatos_recordatorio(bigint) to authenticated;
