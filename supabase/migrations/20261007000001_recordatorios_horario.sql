-- =====================================================================
--  Recordatorios a los asesores según el horario de atención:
--  - Resumen de apertura (lunes a viernes 8:00): leads que llegaron con la
--    oficina cerrada y los que siguen sin contactar. Ya no sale sábado/domingo.
--  - Próxima acción: cuando vence una tarea, WhatsApp al asesor (si vence
--    fuera de horario, al abrir). Cada 10 min; una vez por tarea.
-- =====================================================================

alter table public.tareas add column if not exists recordatorio_enviado_at timestamptz;

-- Si se pospone (cambia la fecha), se vuelve a recordar
create or replace function public.fn_tareas_reiniciar_recordatorio()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.vence_at is distinct from old.vence_at then
    new.recordatorio_enviado_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_tareas_reiniciar_recordatorio on public.tareas;
create trigger trg_tareas_reiniciar_recordatorio before update on public.tareas
for each row execute function public.fn_tareas_reiniciar_recordatorio();

-- Último cierre de la oficina antes de un momento (para "llegaron con la oficina cerrada")
create or replace function public.ultimo_cierre(p_momento timestamptz default now())
returns timestamptz
language sql stable set search_path = ''
as $$
  select max(f.fin)
  from generate_series((p_momento at time zone 'America/Lima')::date - 8, (p_momento at time zone 'America/Lima')::date, interval '1 day') d,
       lateral public.franjas_atencion(d::date) f
  where f.fin <= p_momento
$$;
grant execute on function public.ultimo_cierre(timestamptz) to authenticated, service_role;

do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    -- Resumen de apertura: lunes a viernes 8:00 de Lima (13:00 UTC)
    perform cron.alter_job(jobid, schedule := '0 13 * * 1-5') from cron.job where jobname = 'genesys-recordatorios';
    perform cron.unschedule(jobid) from cron.job where jobname = 'genesys-recordar-tareas';
    perform cron.schedule('genesys-recordar-tareas', '*/10 * * * *', $c$select public.llamar_genesys('recordar-tareas')$c$);
  end if;
end $do$;
