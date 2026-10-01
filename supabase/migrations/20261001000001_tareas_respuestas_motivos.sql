-- =====================================================================
--  Migración 12: pendientes, respuestas rápidas y motivos de pérdida
--  - tareas: "próxima acción" del asesor sobre un lead (con fecha y hora).
--  - respuestas_rapidas: plantillas para el chat ({nombre}, {carrera}, {asesor}).
--  - resumen_dashboard: agrega los motivos de pérdida (ver final del archivo).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tareas / próxima acción
-- ---------------------------------------------------------------------
create table public.tareas (
  id            bigint generated always as identity primary key,
  lead_id       uuid not null references public.leads (id) on delete cascade,
  asesor_id     uuid not null references public.asesores (id) on delete cascade, -- responsable
  titulo        text not null check (length(trim(titulo)) between 1 and 300),
  vence_at      timestamptz not null,
  completada_at timestamptz,
  creada_por    uuid references public.asesores (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index idx_tareas_pendientes on public.tareas (asesor_id, vence_at) where completada_at is null;
create index idx_tareas_lead on public.tareas (lead_id);

alter table public.tareas enable row level security;
revoke all on public.tareas from anon;
grant select, insert, update, delete on public.tareas to authenticated;

create policy "tareas: el responsable o el admin las ven"
on public.tareas for select to authenticated
using (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()));

create policy "tareas: crear sobre leads visibles"
on public.tareas for insert to authenticated
with check (
  creada_por = (select public.mi_asesor_id())
  and (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()))
  and exists (
    select 1 from public.leads l
    where l.id = lead_id
      and (l.asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()))
  )
);

create policy "tareas: el responsable o el admin las modifican"
on public.tareas for update to authenticated
using (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()))
with check (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()));

create policy "tareas: el responsable o el admin las eliminan"
on public.tareas for delete to authenticated
using (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()));

-- Si el lead cambia de asesor, sus tareas pendientes pasan al nuevo asesor
create or replace function public.fn_leads_mover_tareas()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.asesor_id is distinct from old.asesor_id and new.asesor_id is not null then
    update public.tareas set asesor_id = new.asesor_id
    where lead_id = new.id and completada_at is null;
  end if;
  return new;
end $$;

create trigger trg_leads_mover_tareas
after update of asesor_id on public.leads
for each row execute function public.fn_leads_mover_tareas();

revoke execute on function public.fn_leads_mover_tareas() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Respuestas rápidas del chat
-- ---------------------------------------------------------------------
create table public.respuestas_rapidas (
  id         bigint generated always as identity primary key,
  titulo     text not null check (length(trim(titulo)) between 1 and 80),
  contenido  text not null check (length(trim(contenido)) between 1 and 1500),
  orden      int not null default 100,
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.respuestas_rapidas enable row level security;
revoke all on public.respuestas_rapidas from anon;
grant select, insert, update, delete on public.respuestas_rapidas to authenticated;

create policy "respuestas: todos los usuarios del panel las ven"
on public.respuestas_rapidas for select to authenticated
using ((select public.mi_asesor_id()) is not null);

create policy "respuestas: solo admin crea"
on public.respuestas_rapidas for insert to authenticated
with check ((select public.es_admin()));

create policy "respuestas: solo admin edita"
on public.respuestas_rapidas for update to authenticated
using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "respuestas: solo admin elimina"
on public.respuestas_rapidas for delete to authenticated
using ((select public.es_admin()));

-- Plantillas iniciales (sin datos específicos: el admin agrega costos, fechas, requisitos)
insert into public.respuestas_rapidas (titulo, contenido, orden) values
  ('Saludo', 'Hola {nombre}, soy {asesor} de la oficina de admisión. Vi tu consulta sobre {carrera}, ¿en qué te puedo ayudar?', 10),
  ('¿Te puedo llamar?', '{nombre}, ¿te parece si te llamo para explicarte mejor el proceso de admisión? ¿A qué hora te queda bien?', 20),
  ('Seguimiento', 'Hola {nombre}, te escribo para saber si pudiste revisar la información que te envié. ¿Tienes alguna duda?', 30),
  ('Despedida', 'Gracias por tu tiempo, {nombre}. Cualquier consulta me escribes por aquí. ¡Éxitos!', 40);

-- ---------------------------------------------------------------------
-- 3. Dashboard: motivos de pérdida ("Otro: detalle" se agrupa como "Otro")
-- ---------------------------------------------------------------------
create or replace function public.resumen_dashboard(
  p_desde        date default null,
  p_hasta        date default null,
  p_convocatoria text default null,
  p_asesor_id    uuid default null
)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with
  rango as (
    select coalesce(p_desde, (select min(created_at at time zone 'America/Lima')::date from public.leads),
                    (now() at time zone 'America/Lima')::date) as desde,
           coalesce(p_hasta, (now() at time zone 'America/Lima')::date) as hasta
  ),
  l as (
    select *
    from public.leads
    where (p_desde is null or created_at >= (p_desde::timestamp at time zone 'America/Lima'))
      and (p_hasta is null or created_at <  ((p_hasta + 1)::timestamp at time zone 'America/Lima'))
      and (p_convocatoria is null or convocatoria = p_convocatoria)
      and (p_asesor_id is null or asesor_id = p_asesor_id)
  ),
  -- Más de 92 días: se agrupa por semana para que el gráfico siga siendo legible
  unidad as (
    select case when (select hasta - desde from rango) > 92 then 'semana' else 'dia' end as u
  ),
  periodos as (
    select g::date as periodo
    from rango, unidad,
         generate_series(
           case when u = 'semana' then date_trunc('week', desde) else desde end,
           hasta,
           case when u = 'semana' then interval '1 week' else interval '1 day' end
         ) g
  ),
  conteo_periodo as (
    select case when (select u from unidad) = 'semana'
                then date_trunc('week', created_at at time zone 'America/Lima')::date
                else (created_at at time zone 'America/Lima')::date end as periodo,
           count(*)::int as total
    from l
    group by 1
  )
  select jsonb_build_object(
    'total',        (select count(*)::int from l),
    'interesados',  (select count(*)::int from l where fecha_interesado is not null),
    'asignados',    (select count(*)::int from l where asesor_id is not null),
    'contactados',  (select count(*)::int from l where estado in ('lead_contactado', 'lead_atendido', 'lead_inscrito', 'lead_matriculado')),
    'matriculados', (select count(*)::int from l where estado = 'lead_matriculado'),
    'no_interesados', (select count(*)::int from l where estado = 'lead_no_interesado'),
    'perdidos',     (select count(*)::int from l where estado = 'lead_perdido'),

    'por_estado', (
      select coalesce(jsonb_agg(jsonb_build_object('estado', estado, 'total', n) order by estado), '[]'::jsonb)
      from (select estado, count(*)::int n from l group by estado) s
    ),

    'por_carrera', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'carrera', carrera, 'total', n, 'interesados', i, 'matriculados', m) order by n desc, carrera), '[]'::jsonb)
      from (
        select case when programa = 'cepre' then 'CePre' else coalesce(carrera_interes, 'Sin carrera') end as carrera,
               count(*)::int n,
               (count(*) filter (where fecha_interesado is not null))::int i,
               (count(*) filter (where estado = 'lead_matriculado'))::int m
        from l group by 1
      ) s
    ),

    'por_asesor', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'asesor_id', id, 'asesor', nombre, 'activo', activo, 'total', total,
               'sin_contactar', sin_contactar, 'contactados', contactados, 'inscritos', inscritos,
               'matriculados', matriculados, 'perdidos', perdidos) order by total desc, nombre), '[]'::jsonb)
      from (
        select a.id, a.nombre, a.activo,
               count(l.id)::int total,
               (count(l.id) filter (where l.estado in ('lead_interesado', 'lead_asignado')))::int sin_contactar,
               (count(l.id) filter (where l.estado in ('lead_contactado', 'lead_atendido')))::int contactados,
               (count(l.id) filter (where l.estado = 'lead_inscrito'))::int inscritos,
               (count(l.id) filter (where l.estado = 'lead_matriculado'))::int matriculados,
               (count(l.id) filter (where l.estado in ('lead_perdido', 'lead_no_interesado')))::int perdidos
        from public.asesores a
        left join l on l.asesor_id = a.id
        where a.rol = 'asesor'
        group by a.id, a.nombre, a.activo
      ) s
      where total > 0 or activo
    ),

    'por_motivo', (
      select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'total', n) order by n desc, motivo), '[]'::jsonb)
      from (
        select coalesce(nullif(trim(split_part(motivo_no_interes, ':', 1)), ''), 'Sin motivo') as motivo, count(*)::int n
        from l where estado in ('lead_perdido', 'lead_no_interesado')
        group by 1
      ) s
    ),

    'por_periodo', (
      select coalesce(jsonb_agg(jsonb_build_object('periodo', p.periodo, 'total', coalesce(c.total, 0)) order by p.periodo), '[]'::jsonb)
      from periodos p left join conteo_periodo c using (periodo)
    ),
    'unidad_periodo', (select u from unidad),
    'desde', (select desde from rango),
    'hasta', (select hasta from rango)
  )
$$;

revoke execute on function public.resumen_dashboard(date, date, text, uuid) from public, anon;
grant  execute on function public.resumen_dashboard(date, date, text, uuid) to authenticated;
