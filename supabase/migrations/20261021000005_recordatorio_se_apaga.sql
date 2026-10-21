-- Recordatorios en fecha: al terminar de enviar a todos se apagan solos (activo = false) y quedan como completados.

create or replace function public.reservar_recordatorios(p_limite integer default 10)
returns table(recordatorio_id bigint, titulo text, mensaje text, lead_id uuid, telefono text, nombre text, carrera text, asesor text)
language plpgsql
security definer
set search_path = ''
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
    -- En fecha: ya no queda nadie por enviar -> terminado y apagado
    if r.dias_sin_contacto is null and not exists (select 1 from public.destinatarios_recordatorio(r.id)) then
      update public.recordatorios_alumnos set completado_at = now(), activo = false where id = r.id;
    end if;
  end loop;
end $$;
