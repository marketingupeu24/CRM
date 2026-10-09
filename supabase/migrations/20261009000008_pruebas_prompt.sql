-- =====================================================================
--  Pruebas del prompt de Genesys: preguntas reales con lo que la respuesta
--  DEBE incluir y lo que NO debe decir. El panel las revisa antes de pegar el
--  prompt en BuilderBot:
--  - Cobertura (sin IA): ¿el prompt tiene los datos que cada pregunta necesita?
--  - Con IA (si hay clave en Vercel): ¿la respuesta real cumple?
--  Se edita con el módulo "conocimiento".
-- =====================================================================
create table if not exists public.genesys_pruebas (
  id               bigint generated always as identity primary key,
  pregunta         text not null check (length(trim(pregunta)) between 2 and 500),
  debe_incluir     text[] not null default '{}',
  no_debe_incluir  text[] not null default '{}',
  activo           boolean not null default true,
  orden            int not null default 100,
  ultima_respuesta text,
  ultimo_resultado boolean,
  ultimo_detalle   text,
  probado_at       timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.genesys_pruebas enable row level security;
revoke all on public.genesys_pruebas from anon;
drop policy if exists "pruebas: modulo conocimiento" on public.genesys_pruebas;
create policy "pruebas: modulo conocimiento" on public.genesys_pruebas for all to authenticated
  using ((select public.tiene_permiso('conocimiento')))
  with check ((select public.tiene_permiso('conocimiento')));

insert into public.genesys_pruebas (orden, pregunta, debe_incluir, no_debe_incluir) values
  (10, 'Hola', '{Genesys}', '{}'),
  (20, '¿Hasta cuándo me puedo inscribir para Enfermería?', '{13 de noviembre}', '{}'),
  (21, '¿Hasta qué día son las inscripciones para Administración?', '{17 de noviembre}', '{}'),
  (22, '¿Cuándo es el examen de admisión?', '{22 de noviembre}', '{}'),
  (23, '¿Cuánto cuesta el examen de admisión?', '{110}', '{}'),
  (24, '¿El examen es virtual?', '{asesor}', '{es virtual,modalidad virtual,desde tu casa,desde la comodidad}'),
  (25, '¿Qué cursos vienen en el examen?', '{asesor}', '{matemática,razonamiento,comunicación}'),
  (26, '¿Hay examen físico para Educación Física?', '{asesor}', '{no incluye una prueba física,no hay prueba física,sí hay prueba física}'),
  (27, '¿Cómo es el proceso de admisión?', '{entrevista}', '{}'),
  (28, '¿Qué requisitos necesito para postular?', '{certificado}', '{}'),
  (30, 'Costo de la carrera de Psicología', '{"3,800",950}', '{}'),
  (31, '¿Cuánto es la mensualidad de Enfermería?', '{997.50}', '{}'),
  (32, 'Quiero saber los pagos de Ingeniería Civil', '{971.25}', '{}'),
  (33, 'Información de la carrera de Derecho', '{Derecho}', '{S/}'),
  (34, '¿Cuánto sube la mensualidad en los siguientes ciclos?', '{créditos}', '{}'),
  (35, '¿Cuánto cuesta el internado?', '{asesor}', '{}'),
  (40, 'Precio de Medicina Humana', '{"15,600"}', '{}'),
  (41, '¿Cuándo es el examen para Medicina?', '{enero}', '{22 de noviembre}'),
  (42, '¿Cuánto cuesta el CEPRE de Medicina?', '{"2,400"}', '{}'),
  (43, '¿Habrá CEPRE de verano para Ingeniería Civil?', '{asesor}', '{no habrá}'),
  (50, '¿Tienen maestrías o diplomados?', '{Posgrado}', '{no ofrecemos,no tenemos}'),
  (51, '¿Tienen la carrera de Educación Lingüística e Inglés?', '{Inglés}', '{no está,no ofrecemos,no tenemos}'),
  (52, '¿Tienen la carrera de Farmacia?', '{}', '{}'),
  (53, 'Quiero estudiar Psicología semipresencial', '{Lima}', '{}'),
  (54, 'Dejé la carrera en el ciclo I, ¿puedo volver a estudiar?', '{reingreso}', '{}'),
  (55, '¿Cuánto dura la carrera de Derecho?', '{12 semestres}', '{}'),
  (56, '¿Qué modalidades de ingreso hay?', '{Tercio Superior}', '{}'),
  (57, 'Fui primer puesto de mi colegio, ¿doy examen?', '{entrevista}', '{}'),
  (58, '¿Hay becas o descuentos?', '{asesor}', '{}'),
  (60, '¿Dónde queda la universidad?', '{Chullunquiani}', '{}'),
  (61, 'Mándame la ubicación en Google Maps', '{maps.app.goo.gl}', '{no puedo enviar}'),
  (62, '¿Hoy atienden en las oficinas de Chullunquiani?', '{Chullunquiani}', '{}'),
  (63, '¿Cuál es el horario de atención?', '{8:00 am}', '{}'),
  (64, '¿A qué hora me va a llamar el asesor?', '{}', '{no tengo acceso}'),
  (65, '¿Tienen convenios de intercambio con otras universidades?', '{asesor}', '{}')
on conflict do nothing;
