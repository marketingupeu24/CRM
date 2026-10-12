-- La limpieza semanal también borra el historial de las tareas automáticas (cron) de más de 7 días:
-- pg_cron guarda una fila por ejecución (~2 000 por día) y no se usa para nada más.
create or replace function public.limpiar_webhook_eventos()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_borrados integer;
begin
  delete from public.webhook_eventos
  where recibido_at < now() - interval '90 days'
    and coalesce(payload->'cuerpo'->'data'->'key'->>'remoteJid', '') not like '%@lid';
  get diagnostics v_borrados = row_count;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute $q$delete from cron.job_run_details where end_time < now() - interval '7 days'$q$;
  end if;
  return v_borrados;
end $$;
revoke execute on function public.limpiar_webhook_eventos() from public, anon, authenticated;
