-- =====================================================================
--  Avisos a los asesores solo en horario de atención.
--  Fuera de horario (noches, fines de semana, feriados y el almuerzo) no se envía
--  el WhatsApp de "NUEVO PROSPECTO" ni el de "Nuevo mensaje": el lead queda con
--  notificacion_estado = 'fuera_horario' y entra en el resumen de apertura:
--  - 8:00 am de lunes a viernes (lo que llegó desde el cierre anterior), y
--  - 2:00 pm de lunes a jueves (lo que llegó durante el almuerzo).
-- =====================================================================

alter table public.leads drop constraint if exists leads_notificacion_valida;
alter table public.leads add constraint leads_notificacion_valida
  check (notificacion_estado is null or notificacion_estado in ('pendiente', 'notificado', 'error', 'omitida', 'fuera_horario'));

/** Aviso al asesor que se guarda para el resumen de apertura (no cuenta como intento fallido). */
create or replace function public.diferir_notificacion(p_lead_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.leads
  set notificacion_estado = 'fuera_horario', notificacion_error = null
  where id = p_lead_id and notificacion_estado is distinct from 'fuera_horario';
  if found then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (p_lead_id, 'sistema', 'Llegó con la oficina cerrada: el asesor lo verá en el resumen de apertura');
  end if;
end $$;
revoke execute on function public.diferir_notificacion(uuid) from public, anon, authenticated;
grant execute on function public.diferir_notificacion(uuid) to service_role;

-- Resumen de la tarde (2:00 pm, lunes a jueves): lo que llegó durante el almuerzo
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'genesys-recordatorios-tarde';
    perform cron.schedule('genesys-recordatorios-tarde', '0 19 * * 1-4', $c$select public.llamar_genesys('recordatorios')$c$);
  end if;
end $do$;
