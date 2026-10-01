-- =====================================================================
--  Migración 14: pausa real del bot (blacklist de BuilderBot) y webhook de mensajes
--  - leads.en_blacklist: el número está en la blacklist de BuilderBot (el bot no le responde).
--    La Edge Function "genesys/sincronizar-bot" agrega o quita números según la regla:
--    pausado (asesor conversando 5 h) o esperando a su asesor -> blacklist; si no, fuera.
--  - Cada cambio de estado / pausa / asesor pide la sincronización al instante (pg_net),
--    y un cron cada 5 minutos levanta las pausas vencidas.
--  - webhook_eventos: copia cruda de lo que envía el webhook de BuilderBot (diagnóstico).
-- =====================================================================

alter table public.leads add column en_blacklist boolean not null default false;

create table public.webhook_eventos (
  id          bigint generated always as identity primary key,
  recibido_at timestamptz not null default now(),
  payload     jsonb not null,
  procesado   text            -- resumen de lo que hizo la API con el evento
);
create index idx_webhook_eventos_fecha on public.webhook_eventos (recibido_at desc);

-- Solo la Edge Function (service_role) usa esta tabla
alter table public.webhook_eventos enable row level security;
revoke all on public.webhook_eventos from anon, authenticated;

-- ---------------------------------------------------------------------
-- Sincronización con la blacklist de BuilderBot
-- ---------------------------------------------------------------------
-- Llama a la Edge Function de forma asíncrona (pg_net). Usa los secretos de Vault
-- "genesys_url" y "genesys_token" (los mismos del cron de recordatorios).
create or replace function public.solicitar_sync_bot(p_lead_id uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url   text;
  v_token text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault') then
    return;
  end if;

  execute $q$ select
      (select decrypted_secret from vault.decrypted_secrets where name = 'genesys_url'),
      (select decrypted_secret from vault.decrypted_secrets where name = 'genesys_token') $q$
    into v_url, v_token;
  if v_url is null or v_token is null then
    return;
  end if;

  execute $q$ select net.http_post(
      url     := $1 || '/sincronizar-bot',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-genesys-token', $2),
      body    := jsonb_build_object('lead_id', $3)
    ) $q$
    using v_url, v_token, p_lead_id;
end $$;

revoke execute on function public.solicitar_sync_bot(uuid) from public, anon, authenticated;

create or replace function public.fn_leads_sync_bot()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado
     or new.bot_pausado_hasta is distinct from old.bot_pausado_hasta
     or new.asesor_id is distinct from old.asesor_id then
    perform public.solicitar_sync_bot(new.id);
  end if;
  return new;
end $$;

create trigger trg_leads_sync_bot
after update of estado, bot_pausado_hasta, asesor_id on public.leads
for each row execute function public.fn_leads_sync_bot();

revoke execute on function public.fn_leads_sync_bot() from public, anon, authenticated;

-- Cron cada 5 minutos: levanta las pausas vencidas (y corrige cualquier desfase)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$ select cron.unschedule('genesys-sincronizar-bot')
                where exists (select 1 from cron.job where jobname = 'genesys-sincronizar-bot') $q$;
    execute $q$ select cron.schedule('genesys-sincronizar-bot', '*/5 * * * *',
                 'select public.solicitar_sync_bot(null)') $q$;
  end if;
end $$;
