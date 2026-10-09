-- =====================================================================
--  CRM DE LEADS - UNIVERSIDAD (Supabase / PostgreSQL)
--  Regla principal: TODA persona que escribe al bot Genesys es un LEAD.
--  El estado del lead indica en qué punto del embudo está.
--  Ejecutar en Supabase > SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estados del lead (embudo)
-- ---------------------------------------------------------------------
create type lead_estado as enum (
  'lead_nuevo',              -- escribió al bot, aún no se sabe si le interesa
  'lead_en_conversacion',    -- está preguntando, el bot le responde dudas
  'lead_no_interesado',      -- dijo que no quiere asesor / solo consultaba
  'lead_interesado',         -- confirmó interés y dio sus datos
  'lead_asignado',           -- el lead ya tiene asesor asignado
  'lead_contactado',         -- el asesor ya habló con el lead
  'lead_inscrito',           -- el lead se inscribió al proceso de admisión
  'lead_matriculado',        -- el lead se convirtió en alumno
  'lead_perdido'             -- el lead se enfrió o eligió otra universidad
);

-- ---------------------------------------------------------------------
-- 2. Asesores que reciben leads
-- ---------------------------------------------------------------------
create table asesores (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,
  telefono               text not null unique,          -- formato 51999999999
  carreras               text[] not null default '{}',  -- carreras de las que recibe leads
  activo                 boolean not null default true,
  ultimo_lead_asignado   timestamptz,                   -- para repartir leads por turnos
  created_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Leads (un registro por número de WhatsApp)
-- ---------------------------------------------------------------------
create table leads (
  id                   uuid primary key default gen_random_uuid(),
  telefono             text not null unique,            -- ctx.from de BuilderBot
  nombre               text,
  carrera_interes      text,
  modalidad            text,                            -- presencial / semipresencial / virtual
  sede                 text,
  fecha_postulacion    text,                            -- "2027-I", "este año", etc.
  estado               lead_estado not null default 'lead_nuevo',
  origen               text not null default 'whatsapp_genesys',
  asesor_id            uuid references asesores(id),
  motivo_no_interes    text,                            -- por qué el lead no siguió
  resumen              text,                            -- resumen de lo que preguntó el lead
  total_mensajes       int not null default 0,
  primer_contacto      timestamptz not null default now(),
  ultimo_contacto      timestamptz not null default now(),
  fecha_interesado     timestamptz,
  fecha_asignado       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_leads_estado  on leads (estado);
create index idx_leads_carrera on leads (carrera_interes);
create index idx_leads_asesor  on leads (asesor_id);

-- ---------------------------------------------------------------------
-- 4. Historial de cada lead (mensajes, cambios de estado, notas)
-- ---------------------------------------------------------------------
create table lead_interacciones (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references leads(id) on delete cascade,
  tipo        text not null check (tipo in
                ('mensaje_lead', 'respuesta_bot', 'cambio_estado', 'nota_asesor')),
  contenido   text,
  created_at  timestamptz not null default now()
);

create index idx_interacciones_lead on lead_interacciones (lead_id, created_at);

-- ---------------------------------------------------------------------
-- 5. updated_at automático + registro automático de cambios de estado del lead
-- ---------------------------------------------------------------------
create or replace function fn_leads_before_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.estado is distinct from old.estado then
    if new.estado = 'lead_interesado' and new.fecha_interesado is null then
      new.fecha_interesado := now();
    end if;
    if new.estado = 'lead_asignado' and new.fecha_asignado is null then
      new.fecha_asignado := now();
    end if;
  end if;
  return new;
end $$;

create trigger trg_leads_before_update
before update on leads
for each row execute function fn_leads_before_update();

create or replace function fn_leads_log_estado()
returns trigger language plpgsql as $$
begin
  if new.estado is distinct from old.estado then
    insert into lead_interacciones (lead_id, tipo, contenido)
    values (new.id, 'cambio_estado', old.estado || ' -> ' || new.estado);
  end if;
  return new;
end $$;

create trigger trg_leads_log_estado
after update on leads
for each row execute function fn_leads_log_estado();

-- ---------------------------------------------------------------------
-- 6. Registrar lead cuando escribe (crea el lead o actualiza su último contacto)
--    Nunca baja el estado de un lead existente.
-- ---------------------------------------------------------------------
create or replace function registrar_lead(p_telefono text, p_mensaje text default null)
returns leads language plpgsql as $$
declare
  v_lead leads;
begin
  insert into leads (telefono)
  values (p_telefono)
  on conflict (telefono) do update
    set ultimo_contacto = now(),
        total_mensajes  = leads.total_mensajes + 1
  returning * into v_lead;

  if p_mensaje is not null then
    insert into lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'mensaje_lead', p_mensaje);
  end if;

  return v_lead;
end $$;

-- ---------------------------------------------------------------------
-- 7. Asignar asesor al lead (por carrera + por turnos / round-robin)
--    Si ningún asesor tiene la carrera, se asigna al asesor activo con más tiempo sin leads.
-- ---------------------------------------------------------------------
create or replace function asignar_asesor_lead(p_lead_id uuid)
returns asesores language plpgsql as $$
declare
  v_lead   leads;
  v_asesor asesores;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then
    raise exception 'Lead % no existe', p_lead_id;
  end if;

  -- Si el lead ya tiene asesor, se devuelve el mismo (evita reasignar leads)
  if v_lead.asesor_id is not null then
    select * into v_asesor from asesores where id = v_lead.asesor_id;
    return v_asesor;
  end if;

  select * into v_asesor
  from asesores
  where activo and v_lead.carrera_interes = any (carreras)
  order by ultimo_lead_asignado nulls first
  limit 1
  for update skip locked;

  if v_asesor.id is null then
    select * into v_asesor
    from asesores
    where activo
    order by ultimo_lead_asignado nulls first
    limit 1
    for update skip locked;
  end if;

  if v_asesor.id is null then
    raise exception 'No hay asesores activos para asignar leads';
  end if;

  update asesores set ultimo_lead_asignado = now() where id = v_asesor.id;
  update leads set asesor_id = v_asesor.id, estado = 'lead_asignado' where id = p_lead_id;

  return v_asesor;
end $$;

-- ---------------------------------------------------------------------
-- 8. Vistas para reportes de leads
-- ---------------------------------------------------------------------
create or replace view vista_leads_por_estado as
select estado, count(*) as total_leads
from leads
group by estado
order by estado;

create or replace view vista_leads_por_carrera as
select
  coalesce(carrera_interes, 'Sin carrera') as carrera,
  count(*)                                                        as total_leads,
  count(*) filter (where estado = 'lead_no_interesado')           as leads_no_interesados,
  count(*) filter (where estado >= 'lead_interesado'
                     and estado <> 'lead_perdido')                as leads_interesados,
  count(*) filter (where estado = 'lead_matriculado')             as leads_matriculados
from leads
group by 1
order by total_leads desc;

create or replace view vista_leads_por_asesor as
select
  a.nombre as asesor,
  count(l.id)                                                  as leads_asignados,
  count(l.id) filter (where l.estado = 'lead_asignado')        as leads_sin_contactar,
  count(l.id) filter (where l.estado = 'lead_matriculado')     as leads_matriculados
from asesores a
left join leads l on l.asesor_id = a.id
group by a.nombre;

-- ---------------------------------------------------------------------
-- 9. Seguridad: RLS activado. El bot usa la service_role key (solo en el servidor),
--    que ignora RLS. Para un panel web de asesores, crear políticas aparte.
-- ---------------------------------------------------------------------
alter table asesores           enable row level security;
alter table leads              enable row level security;
alter table lead_interacciones enable row level security;

-- ---------------------------------------------------------------------
-- 10. Datos de ejemplo (editar con los asesores reales)
-- ---------------------------------------------------------------------
insert into asesores (nombre, telefono, carreras) values
  ('Asesor Sistemas',       '51999111111', array['Ingeniería de Sistemas', 'Ingeniería Civil']),
  ('Asesor Administración', '51999222222', array['Administración', 'Contabilidad']),
  ('Asesor Salud',          '51999333333', array['Enfermería', 'Psicología', 'Nutrición']);
