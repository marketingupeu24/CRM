-- =====================================================================
--  Avisos al asesor que fallaron (BuilderBot a veces responde "Bot endpoint
--  timed out"): se reintentan cada 10 minutos, hasta 3 intentos por lead.
--  Antes solo se reintentaban una vez al día con los recordatorios.
-- =====================================================================
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'genesys-reintentar-avisos';
    perform cron.schedule('genesys-reintentar-avisos', '*/10 * * * *', $c$select public.llamar_genesys('reintentar-avisos')$c$);
  end if;
end $do$;
