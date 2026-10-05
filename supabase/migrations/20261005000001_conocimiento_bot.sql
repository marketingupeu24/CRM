-- =====================================================================
--  Base de conocimiento de Genesys y revisión de sus respuestas.
--  - conocimiento: reglas y datos oficiales (carreras, costos, fechas...)
--    que el equipo mantiene en el CRM. El panel arma con ellos el texto
--    para pegar en el asistente de BuilderBot. Todos los usuarios del panel
--    lo leen; lo edita quien tenga el módulo "conocimiento".
--  - preguntas_sin_respuesta(): respuestas del bot del tipo "no tengo
--    información" o "malentendido" junto con la pregunta del lead, para
--    saber qué agregar. revision_bot guarda cuáles ya se atendieron.
-- =====================================================================

-- Nuevo módulo de permisos
alter table public.asesores drop constraint if exists asesores_permisos_validos;
alter table public.asesores add constraint asesores_permisos_validos check (permisos <@ array[
  'pendientes', 'chats', 'leads', 'kanban', 'registrar',
  'dashboard', 'campanas', 'exportar',
  'ver_todos', 'asignar', 'editar_celular', 'papelera',
  'usuarios', 'respuestas', 'gestionar_campanas',
  'conocimiento'
]::text[]);
update public.asesores set permisos = array_append(permisos, 'conocimiento')
where rol = 'admin' and not ('conocimiento' = any (permisos));

create table public.conocimiento (
  id          bigint generated always as identity primary key,
  categoria   text not null check (categoria in ('reglas', 'carreras', 'costos', 'becas', 'admision', 'requisitos', 'cepre', 'campus', 'otros')),
  titulo      text not null check (length(trim(titulo)) between 1 and 120),
  contenido   text not null check (length(trim(contenido)) between 1 and 6000),
  -- false = "Por completar": se ve en el CRM pero no entra al texto para Genesys
  activo      boolean not null default true,
  orden       int not null default 100,
  updated_at  timestamptz not null default now(),
  updated_por uuid references public.asesores (id) on delete set null
);

comment on table public.conocimiento is 'Reglas y datos oficiales para Genesys (se copian al asistente de BuilderBot).';

create or replace function public.conocimiento_actualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_por := coalesce(public.mi_asesor_id(), new.updated_por);
  return new;
end $$;

create trigger conocimiento_actualizado
before insert or update on public.conocimiento
for each row execute function public.conocimiento_actualizado();

alter table public.conocimiento enable row level security;
revoke all on public.conocimiento from anon;
grant select, insert, update, delete on public.conocimiento to authenticated;

create policy "conocimiento: todos los usuarios del panel lo leen"
on public.conocimiento for select to authenticated
using ((select public.mi_asesor_id()) is not null);

create policy "conocimiento: crear con permiso"
on public.conocimiento for insert to authenticated
with check ((select public.tiene_permiso('conocimiento')));

create policy "conocimiento: editar con permiso"
on public.conocimiento for update to authenticated
using ((select public.tiene_permiso('conocimiento'))) with check ((select public.tiene_permiso('conocimiento')));

create policy "conocimiento: eliminar con permiso"
on public.conocimiento for delete to authenticated
using ((select public.tiene_permiso('conocimiento')));

-- Respuestas del bot ya revisadas
create table public.revision_bot (
  interaccion_id bigint primary key references public.lead_interacciones (id) on delete cascade,
  revisada_por   uuid references public.asesores (id) on delete set null,
  revisada_at    timestamptz not null default now()
);

alter table public.revision_bot enable row level security;
revoke all on public.revision_bot from anon;
grant select, insert, delete on public.revision_bot to authenticated;

create policy "revision: con permiso"
on public.revision_bot for all to authenticated
using ((select public.tiene_permiso('conocimiento'))) with check ((select public.tiene_permiso('conocimiento')));

-- Respuestas en las que Genesys no supo contestar, con la pregunta del lead
create or replace function public.preguntas_sin_respuesta(p_dias int default 30)
returns table (
  interaccion_id bigint, lead_id uuid, lead_nombre text, lead_telefono text,
  pregunta text, respuesta text, respondida_at timestamptz, revisada boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.tiene_permiso('conocimiento') then
    raise exception 'No tienes permiso para revisar las respuestas del bot';
  end if;
  return query
  select b.id, l.id, l.nombre, l.telefono,
         (select m.contenido from public.lead_interacciones m
          where m.lead_id = b.lead_id and m.tipo = 'mensaje_lead' and m.created_at <= b.created_at
          order by m.created_at desc limit 1),
         b.contenido, b.created_at,
         exists (select 1 from public.revision_bot r where r.interaccion_id = b.id)
  from public.lead_interacciones b
  join public.leads l on l.id = b.lead_id and l.eliminado_at is null
  where b.tipo = 'respuesta_bot'
    and b.created_at > now() - make_interval(days => greatest(1, least(p_dias, 365)))
    and b.contenido ~* '(no tengo (la )?informaci|no cuento con|no dispongo|lamentablemente|malentendido|no puedo (ayudarte|enviar|brindar)|no estoy segur|no tengo datos|no está incluid)'
  order by b.created_at desc
  limit 300;
end $$;

revoke execute on function public.preguntas_sin_respuesta(int) from public, anon;
grant execute on function public.preguntas_sin_respuesta(int) to authenticated;

-- ---------------------------------------------------------------------
-- Contenido inicial (lo que Genesys ya respondía + reglas recomendadas)
-- ---------------------------------------------------------------------
insert into public.conocimiento (categoria, titulo, contenido, activo, orden) values
('reglas', 'Quién eres', 'Eres Genesys, la asesora virtual de admisión de la Universidad Peruana Unión (UPeU), campus Juliaca. Tu objetivo es resolver dudas y registrar a cada interesado (nombre, DNI y carrera) para que su asesor(a) lo contacte. Trato amable, cercano y profesional, en español, de "tú".', true, 10),
('reglas', 'Forma de responder', '- Responde en UN SOLO mensaje por turno: máximo 3 oraciones o una lista corta.
- No envíes emojis sueltos como mensaje aparte; como máximo uno dentro del texto.
- Escribe las horas como "8:00 am – 12:30 pm" (sin puntos en am/pm) y evita abreviaturas con punto.
- No repitas el saludo si ya saludaste en esta conversación.', true, 20),
('reglas', 'Registro de datos', '- Pide el nombre completo y el DNI UNA sola vez. Si ya los tienes, no los vuelvas a pedir.
- Si el usuario responde "sí", "ok", "de acuerdo" o similar, continúa con el paso en el que estabas (no te despidas).
- Muestra el resumen de datos para confirmar una sola vez y envía la confirmación de registro una sola vez.', true, 30),
('reglas', 'Cuando no sabes algo', '- Nunca digas "lamentablemente" ni "no tengo información".
- Si no tienes un dato (costos, descuentos, convenios, casos especiales), responde: "Ese dato te lo envía tu asesor(a) en breve, ya le avisé 😊" y, si aún no está registrado, pide sus datos para asignarle uno.
- No inventes precios, fechas ni requisitos: usa solo la información de este documento.', true, 40),
('carreras', 'Carreras del campus Juliaca', 'Modalidad presencial:
- Ingeniería de Sistemas
- Ingeniería Ambiental
- Ingeniería de Industrias Alimentarias
- Ingeniería Civil
- Arquitectura y Urbanismo
- Contabilidad, Gestión Tributaria y Aduanera
- Administración
- Educación (Inglés y Español)
- Educación Inicial y Puericultura
- Educación Primaria y Pedagogía Terapéutica
- Educación – Ciencias Naturales y Tecnología
- Educación – Matemática, Análisis de Datos y Computación
- Enfermería
- Nutrición Humana
- Psicología
- Derecho

Carreras nuevas 2027-1:
- Medicina Humana
- Tecnología Médica en Laboratorio Clínico y Anatomía Patológica
- Tecnología Médica en Terapia Física y Rehabilitación

Modalidad a distancia: Administración; Contabilidad, Gestión Tributaria y Aduanera.
Modalidad semipresencial: Psicología; Ingeniería Ambiental.', true, 10),
('cepre', 'CEPRE UPeU – Primavera 2027-1', 'Modalidad presencial:
- Costo: S/ 660
- Fechas: del 14 de septiembre al 6 de noviembre
- Horario: lunes a jueves de 2:30 pm a 7:15 pm
- Lugar: Colegio Adventista del Titicaca
- Áreas: Biomédicas, Ingenierías, Sociales y Derecho', true, 10),
('campus', 'Horario de atención de Admisión', 'Lunes a jueves: 8:00 am – 12:30 pm y 2:00 pm – 6:00 pm
Viernes: 8:00 am – 1:00 pm', true, 10),
('campus', 'Ubicación del campus', 'Campus Juliaca: Av. Héroes de la Guerra del Pacífico, Juliaca, Puno.
Google Maps: (pega aquí el enlace oficial del campus)', false, 20),
('costos', 'Pensiones por carrera', 'Por completar: costo de matrícula y de la pensión mensual de cada carrera, cuántas cuotas hay por ciclo y si cambia según la categoría o el colegio de procedencia.', false, 10),
('becas', 'Becas, descuentos y convenios', 'Por completar: becas por rendimiento, descuentos por hermanos o por pago adelantado y convenios con colegios o instituciones.', false, 10),
('admision', 'Examen de admisión 2027-1', 'Por completar: fechas de inscripción y del examen, costo de la inscripción, modalidades de ingreso (examen general, primeros puestos, traslados, CEPRE) y dónde se rinde.', false, 10),
('requisitos', 'Requisitos de inscripción', 'Por completar: documentos que se presentan (DNI, certificado de estudios, fotos, etc.) y cómo se envían.', false, 10);

-- ---------------------------------------------------------------------
-- Celulares de asesores en la blacklist de BuilderBot: así Genesys no le
-- responde a las respuestas automáticas de su WhatsApp ante los avisos.
-- ---------------------------------------------------------------------
alter table public.asesores add column if not exists en_blacklist boolean not null default false;

-- Los leads que se crearon con el celular de un asesor (por esas respuestas automáticas)
-- van a la papelera; se pueden restaurar desde el CRM si alguno era real.
update public.leads l set eliminado_at = now()
where l.eliminado_at is null
  and exists (select 1 from public.asesores a where a.telefono = l.telefono and a.rol = 'asesor' and a.eliminado_at is null)
  and l.nombre is null;
