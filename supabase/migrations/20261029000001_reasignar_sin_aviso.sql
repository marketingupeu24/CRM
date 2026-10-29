-- Reasignación automática SIN aviso por WhatsApp (tras el bloqueo de Meta del 28/10):
-- los asesores contactan desde su número personal y ven sus leads en el panel.
-- El cron llama directo a la base (ya no a /genesys/reasignar, que enviaba "🔁 LEAD REASIGNADO A TI").
-- El aviso queda "omitida" para que el reintento de avisos no lo envíe después.

create or replace function public.reasignar_sin_aviso(p_horas integer default 4, p_maximo integer default 4)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_cambios jsonb;
begin
  v_cambios := public.reasignar_sin_contacto(p_horas, p_maximo, true);
  update public.leads
  set notificacion_estado = 'omitida'
  where id in (select (e->>'lead_id')::uuid from jsonb_array_elements(v_cambios) e);
  return v_cambios;
end $function$;

revoke all on function public.reasignar_sin_aviso(integer, integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('genesys-reasignar', '*/15 * * * *', 'select public.reasignar_sin_aviso()');
    perform cron.alter_job((select jobid from cron.job where jobname = 'genesys-reasignar'), active := true);
  end if;
end $$;
