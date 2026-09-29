-- =====================================================================
--  CRM DE LEADS - UNIVERSIDAD
--  Migración 1: tipos y tablas
--  Regla principal: TODA persona que escribe al bot Genesys es un LEAD.
--  El estado del lead indica en qué punto del embudo está.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estados del lead (embudo). El orden importa: se usa en los reportes.
-- ---------------------------------------------------------------------
create type public.lead_estado as enum (
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

-- Rol del usuario del panel
create type public.asesor_rol as enum ('asesor', 'admin');

-- Tipos de registro en el historial del lead
create type public.interaccion_tipo as enum (
  'mensaje_lead', 'respuesta_bot', 'cambio_estado', 'nota_asesor'
);

-- ---------------------------------------------------------------------
-- 2. Asesores (y administradores) del panel
-- ---------------------------------------------------------------------
create table public.asesores (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid unique references auth.users (id) on delete set null, -- cuenta del panel
  email                  text unique,                   -- se usa para vincular la cuenta del panel
  nombre                 text not null,
  telefono               text not null unique,          -- formato 51999999999 (sin +)
  rol                    public.asesor_rol not null default 'asesor',
  carreras               text[] not null default '{}',  -- carreras de las que recibe leads
  activo                 boolean not null default true, -- si es false no recibe leads nuevos
  ultimo_lead_asignado   timestamptz,                   -- para repartir leads por turnos
  created_at             timestamptz not null default now()
);

comment on table public.asesores is 'Asesores de admisión. rol=admin ve todos los leads y no recibe asignaciones.';

-- ---------------------------------------------------------------------
-- 3. Leads (un registro por número de WhatsApp)
-- ---------------------------------------------------------------------
create table public.leads (
  id                   uuid primary key default gen_random_uuid(),
  telefono             text not null unique,            -- ctx.from de BuilderBot
  nombre               text,
  carrera_interes      text,
  modalidad            text,                            -- presencial / semipresencial / virtual
  sede                 text,
  fecha_postulacion    text,                            -- "2027-I", "este año", etc.
  estado               public.lead_estado not null default 'lead_nuevo',
  origen               text not null default 'whatsapp_genesys',
  asesor_id            uuid references public.asesores (id) on delete set null,
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

create index idx_leads_estado     on public.leads (estado);
create index idx_leads_carrera    on public.leads (carrera_interes);
create index idx_leads_asesor     on public.leads (asesor_id);
create index idx_leads_created_at on public.leads (created_at desc);

-- ---------------------------------------------------------------------
-- 4. Historial de cada lead (mensajes, cambios de estado, notas)
-- ---------------------------------------------------------------------
create table public.lead_interacciones (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references public.leads (id) on delete cascade,
  tipo        public.interaccion_tipo not null,
  contenido   text,
  autor_id    uuid references public.asesores (id) on delete set null, -- null = bot / sistema
  created_at  timestamptz not null default now()
);

create index idx_interacciones_lead on public.lead_interacciones (lead_id, created_at);
