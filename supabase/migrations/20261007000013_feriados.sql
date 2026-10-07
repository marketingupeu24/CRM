-- =====================================================================
--  Feriados: días sin atención. franjas_atencion no devuelve franjas ese día,
--  así no hay reasignación automática ni resumen de apertura, las horas
--  hábiles no cuentan y Genesys sabe que la oficina está cerrada.
-- =====================================================================
create table if not exists public.feriados (
  fecha   date primary key,
  nombre  text not null check (length(trim(nombre)) between 2 and 80)
);
alter table public.feriados enable row level security;
revoke all on public.feriados from anon;
grant select, insert, delete on public.feriados to authenticated;
create policy "feriados: leer" on public.feriados for select to authenticated using ((select public.mi_asesor_id()) is not null);
create policy "feriados: editar con permiso" on public.feriados for all to authenticated
  using ((select public.tiene_permiso('conocimiento'))) with check ((select public.tiene_permiso('conocimiento')));

insert into public.feriados (fecha, nombre) values
  ('2026-10-08', 'Combate de Angamos'),
  ('2026-11-01', 'Día de Todos los Santos'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-09', 'Batalla de Ayacucho'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-03-25', 'Jueves Santo'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-05-01', 'Día del Trabajo'),
  ('2027-06-07', 'Batalla de Arica y Día de la Bandera'),
  ('2027-06-29', 'San Pedro y San Pablo'),
  ('2027-07-23', 'Día de la Fuerza Aérea'),
  ('2027-07-28', 'Fiestas Patrias'),
  ('2027-07-29', 'Fiestas Patrias'),
  ('2027-08-06', 'Batalla de Junín'),
  ('2027-08-30', 'Santa Rosa de Lima'),
  ('2027-10-08', 'Combate de Angamos'),
  ('2027-11-01', 'Día de Todos los Santos'),
  ('2027-12-08', 'Inmaculada Concepción'),
  ('2027-12-09', 'Batalla de Ayacucho'),
  ('2027-12-25', 'Navidad')
on conflict (fecha) do nothing;

create or replace function public.franjas_atencion(p_dia date)
returns table (inicio timestamptz, fin timestamptz)
language sql stable set search_path = ''
as $$
  select (p_dia + f.desde) at time zone 'America/Lima', (p_dia + f.hasta) at time zone 'America/Lima'
  from (values
    (time '08:00', time '12:30', 1, 4),
    (time '14:00', time '18:00', 1, 4),
    (time '08:00', time '13:00', 5, 5)
  ) as f (desde, hasta, dia_desde, dia_hasta)
  where extract(isodow from p_dia) between f.dia_desde and f.dia_hasta
    and not exists (select 1 from public.feriados fe where fe.fecha = p_dia)
$$;
