-- =====================================================================
--  Notificaciones push del CRM (app instalada en el celular o la PC): cada
--  dispositivo donde el asesor activó los avisos guarda aquí su suscripción.
--  La función genesys les envía el aviso además del WhatsApp.
-- =====================================================================
create table if not exists public.push_suscripciones (
  id            bigint generated always as identity primary key,
  asesor_id     uuid not null references public.asesores (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  dispositivo   text,
  created_at    timestamptz not null default now(),
  ultimo_envio_at timestamptz
);
create index if not exists push_suscripciones_asesor_idx on public.push_suscripciones (asesor_id);
alter table public.push_suscripciones enable row level security;
revoke all on public.push_suscripciones from anon;
drop policy if exists "push: las propias" on public.push_suscripciones;
create policy "push: las propias" on public.push_suscripciones for all to authenticated
  using (asesor_id = (select public.mi_asesor_id()))
  with check (asesor_id = (select public.mi_asesor_id()));

-- Activar en este dispositivo: si el navegador ya estaba suscrito con otro usuario, pasa al actual
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo uuid := public.mi_asesor_id();
begin
  if v_yo is null then raise exception 'Tu usuario no está vinculado a un asesor'; end if;
  if p_endpoint !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Suscripción no válida';
  end if;
  insert into public.push_suscripciones (asesor_id, endpoint, p256dh, auth, dispositivo)
  values (v_yo, p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 120))
  on conflict (endpoint) do update
    set asesor_id = excluded.asesor_id, p256dh = excluded.p256dh, auth = excluded.auth,
        dispositivo = excluded.dispositivo, created_at = now();
end $$;
revoke execute on function public.registrar_push(text, text, text, text) from public, anon;
grant execute on function public.registrar_push(text, text, text, text) to authenticated;
