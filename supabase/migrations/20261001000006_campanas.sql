-- =====================================================================
--  Campañas: nombre, origen (opcional) y rango de fechas.
--  Un lead pertenece a una campaña si se registró entre inicio y fin
--  (hora de Lima) y, si la campaña tiene origen, si "nos conoció por" ese origen.
--  - campanas: las administra el admin; todos los usuarios del panel las ven.
--  - resumen_campanas(): leads, contactados, matriculados y perdidos por campaña
--    (security invoker: cada asesor ve solo las cifras de sus leads).
-- =====================================================================

create table public.campanas (
  id         bigint generated always as identity primary key,
  nombre     text not null check (length(trim(nombre)) between 1 and 80),
  origen     text check (origen is null or length(trim(origen)) between 1 and 60),
  inicio     date not null,
  fin        date not null,
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  check (fin >= inicio)
);

comment on table public.campanas is 'Campañas de captación con rango de fechas; agrupan leads por fecha de registro y origen.';

alter table public.campanas enable row level security;
revoke all on public.campanas from anon;
grant select, insert, update, delete on public.campanas to authenticated;

create policy "campanas: todos los usuarios del panel las ven"
on public.campanas for select to authenticated
using ((select public.mi_asesor_id()) is not null);

create policy "campanas: solo admin crea"
on public.campanas for insert to authenticated
with check ((select public.es_admin()));

create policy "campanas: solo admin edita"
on public.campanas for update to authenticated
using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "campanas: solo admin elimina"
on public.campanas for delete to authenticated
using ((select public.es_admin()));

create or replace function public.resumen_campanas()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'nombre', c.nombre, 'origen', c.origen, 'inicio', c.inicio, 'fin', c.fin, 'activa', c.activa,
    'total', coalesce(s.total, 0),
    'contactados', coalesce(s.contactados, 0),
    'matriculados', coalesce(s.matriculados, 0),
    'perdidos', coalesce(s.perdidos, 0)
  ) order by c.inicio desc, c.id desc), '[]'::jsonb)
  from public.campanas c
  left join lateral (
    select count(*)::int total,
           (count(*) filter (where l.estado in ('lead_contactado', 'lead_atendido', 'lead_inscrito', 'lead_matriculado')))::int contactados,
           (count(*) filter (where l.estado = 'lead_matriculado'))::int matriculados,
           (count(*) filter (where l.estado in ('lead_perdido', 'lead_no_interesado')))::int perdidos
    from public.leads l
    where (l.created_at at time zone 'America/Lima')::date between c.inicio and c.fin
      and (c.origen is null or l.origen_campana = c.origen)
  ) s on true
$$;

revoke execute on function public.resumen_campanas() from public, anon;
grant  execute on function public.resumen_campanas() to authenticated;
