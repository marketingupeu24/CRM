-- =====================================================================
--  Fichas del prompt de Genesys con fecha de vencimiento.
--  - vence_el: último día en que la información vale (ej. el examen de la
--    campaña). Al día siguiente la ficha se desactiva sola (sale del prompt).
--  - vencida_at: cuándo se desactivó por vencer. Mientras sea posterior a la
--    última versión pegada en BuilderBot, el bot sigue con la información
--    vieja: el CRM avisa todos los días hasta que se pegue el prompt nuevo
--    ("✓ Ya lo pegué").
-- =====================================================================

alter table public.genesys_fichas add column if not exists vence_el date;
alter table public.genesys_fichas add column if not exists vencida_at timestamptz;
comment on column public.genesys_fichas.vence_el is 'Último día en que la ficha vale; al día siguiente sale sola del prompt.';
comment on column public.genesys_fichas.vencida_at is 'Cuándo se desactivó por vencer (para avisar hasta que se pegue el prompt nuevo en BuilderBot).';

-- Desactiva las fichas vencidas (hora de Lima). Devuelve cuántas.
create or replace function public.vencer_fichas_genesys()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_n int;
begin
  update public.genesys_fichas
  set activo = false, vencida_at = now(), updated_at = now()
  where activo and vence_el is not null and vence_el < (now() at time zone 'America/Lima')::date;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.vencer_fichas_genesys() from public, anon, authenticated;

-- Estado para las alertas: vencidas que BuilderBot aún tiene y las que vencen pronto.
create or replace function public.estado_prompt_genesys()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with ultima as (select max(created_at) as m from public.genesys_versiones),
  hoy as (select (now() at time zone 'America/Lima')::date as d)
  select jsonb_build_object(
    'ultima_version', (select m from ultima),
    'vencidas', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'titulo', f.titulo, 'parte', f.parte, 'vence_el', f.vence_el) order by f.vence_el, f.titulo)
      from public.genesys_fichas f, ultima
      where f.vencida_at is not null and (ultima.m is null or f.vencida_at > ultima.m)
    ), '[]'::jsonb),
    'por_vencer', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'titulo', f.titulo, 'parte', f.parte, 'vence_el', f.vence_el, 'dias', f.vence_el - hoy.d) order by f.vence_el, f.titulo)
      from public.genesys_fichas f, hoy
      where f.activo and f.vence_el between hoy.d and hoy.d + 7
    ), '[]'::jsonb)
  )
  where (select public.mi_asesor_id()) is not null or auth.uid() is null
$$;
revoke execute on function public.estado_prompt_genesys() from public, anon;
grant execute on function public.estado_prompt_genesys() to authenticated;

-- 00:05 de Lima: salen del prompt las vencidas. 8:05 (lunes a sábado): alerta a quien administra el prompt.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('genesys-vencer-fichas', '5 5 * * *', $c$select public.vencer_fichas_genesys()$c$);
    perform cron.schedule('genesys-revisar-prompt', '5 13 * * 1-6', $c$select public.llamar_genesys('revisar-prompt')$c$);
  end if;
end $$;
