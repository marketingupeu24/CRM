-- =====================================================================
--  Recordatorio automático por inactividad ("seguimiento a los 7 días").
--  Un recordatorio con dias_sin_contacto no tiene fecha fija: cada día (en
--  horario de atención) le escribe a quien cumple N días sin contacto.
--  Cuidados para el número de Genesys (no parecer spam):
--  - UNA SOLA VEZ POR ALUMNO, para siempre (aunque no responda; aunque haya
--    varios recordatorios de inactividad).
--  - Solo a quien ya nos escribió, tiene asesor, no está inscrito, matriculado,
--    perdido ni no interesado, y no pidió dejar de recibirlos ("NO").
--  - No si el asesor ya agendó una tarea a futuro (lo va a contactar él).
--  - Solo entre N y dias_maximo días sin contacto (por defecto 7 a 30): al
--    activarlo no se le escribe a contactos muy antiguos.
--  - Se crean APAGADOS; el envío sigue siendo de a pocos y en horario de atención.
-- =====================================================================

alter table public.recordatorios_alumnos add column if not exists dias_sin_contacto int
  check (dias_sin_contacto is null or dias_sin_contacto between 2 and 90);
alter table public.recordatorios_alumnos add column if not exists dias_maximo int not null default 30
  check (dias_maximo between 3 and 365);
comment on column public.recordatorios_alumnos.dias_sin_contacto is 'Si tiene valor: automático, a quien lleva estos días sin contacto (una sola vez por alumno).';
comment on column public.recordatorios_alumnos.dias_maximo is 'Automático: no escribe a quien lleva más de estos días sin contacto.';

create or replace function public.destinatarios_recordatorio(p_id bigint)
returns setof public.leads
language sql stable security definer set search_path = ''
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
revoke execute on function public.destinatarios_recordatorio(bigint) from public, anon, authenticated;

-- El automático nunca queda "completo": cada día aparecen alumnos nuevos que cumplen los días
create or replace function public.reservar_recordatorios(p_limite int default 10)
returns table (recordatorio_id bigint, titulo text, mensaje text, lead_id uuid, telefono text, nombre text, carrera text, asesor text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.recordatorios_alumnos;
  v_quedan int := greatest(1, least(p_limite, 30));
  v_lima timestamp := now() at time zone 'America/Lima';
  v_n int;
begin
  if not public.en_horario_atencion() then return; end if;
  for r in
    select * from public.recordatorios_alumnos
    where activo and completado_at is null and enviar_el <= v_lima::date
      and (enviar_el < v_lima::date or desde_hora <= v_lima::time)
    order by enviar_el, id
  loop
    exit when v_quedan <= 0;
    return query
      with lote as (
        insert into public.recordatorios_envios (recordatorio_id, lead_id)
        select r.id, d.id from public.destinatarios_recordatorio(r.id) d
        order by d.ultimo_mensaje_lead_at desc
        limit v_quedan
        on conflict do nothing
        returning recordatorios_envios.lead_id
      )
      select r.id, r.titulo, r.mensaje, l.id, l.telefono, l.nombre, coalesce(l.carrera_interes, l.modalidad), a.nombre
      from lote join public.leads l on l.id = lote.lead_id left join public.asesores a on a.id = l.asesor_id;
    get diagnostics v_n = row_count;
    v_quedan := v_quedan - v_n;
    if r.dias_sin_contacto is null and not exists (select 1 from public.destinatarios_recordatorio(r.id)) then
      update public.recordatorios_alumnos set completado_at = now() where id = r.id;
    end if;
  end loop;
end $$;
revoke execute on function public.reservar_recordatorios(int) from public, anon, authenticated;
grant execute on function public.reservar_recordatorios(int) to service_role;

-- Borrador apagado: revisar el texto y activarlo desde Recordatorios a alumnos
insert into public.recordatorios_alumnos (titulo, mensaje, enviar_el, desde_hora, carreras, excluir_carreras, solo_registrados, dias_sin_contacto, dias_maximo, activo)
select 'Seguimiento: 7 días sin contacto',
       E'¡Hola, {nombre}! 👋 Soy {asesor}, de Admisión de la Universidad Peruana Unión 🎓\n¿Pudiste avanzar con tu postulación a *{carrera}*? Si tienes alguna duda, escríbeme por aquí y con gusto te ayudo 😊',
       (now() at time zone 'America/Lima')::date, '09:00', '{}', '{}', false, 7, 30, false
where not exists (select 1 from public.recordatorios_alumnos where dias_sin_contacto is not null);
