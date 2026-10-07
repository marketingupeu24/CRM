-- =====================================================================
--  Flujos de BuilderBot (Genesys): copia en el CRM de cada flujo del bot
--  (cómo se activa, palabras clave y su prompt) para revisarlos y guardar
--  la versión mejorada lista para pegar en BuilderBot.
--  Lo ven y editan quienes tienen el módulo "conocimiento".
-- =====================================================================

create table if not exists public.flujos_bot (
  id                 bigint generated always as identity primary key,
  nombre             text not null check (length(trim(nombre)) between 2 and 80),
  disparador         text not null default 'palabras' check (disparador in ('general', 'accion', 'palabras')),
  palabras           text[] not null default '{}',
  prompt             text not null default '' check (length(prompt) <= 20000),
  prompt_mejorado    text not null default '' check (length(prompt_mejorado) <= 20000),
  notas              text not null default '' check (length(notas) <= 4000),
  orden              int not null default 100,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  actualizado_por    uuid references public.asesores (id) on delete set null
);

create or replace function public.fn_flujos_bot_actualizado()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.actualizado_por := coalesce(public.mi_asesor_id(), new.actualizado_por);
  return new;
end $$;
drop trigger if exists trg_flujos_bot_actualizado on public.flujos_bot;
create trigger trg_flujos_bot_actualizado before insert or update on public.flujos_bot
for each row execute function public.fn_flujos_bot_actualizado();

alter table public.flujos_bot enable row level security;
revoke all on public.flujos_bot from anon;
grant select, insert, update, delete on public.flujos_bot to authenticated;

create policy "flujos_bot: con permiso conocimiento" on public.flujos_bot
for all to authenticated
using ((select public.tiene_permiso('conocimiento')))
with check ((select public.tiene_permiso('conocimiento')));

-- Los flujos que hoy tiene Genesys en BuilderBot (palabras visibles; el resto se completa en el panel)
insert into public.flujos_bot (nombre, disparador, palabras, orden, notas)
select v.nombre, v.disparador, v.palabras, v.orden, v.notas
from (values
  ('INFORMACIÓN', 'general', '{}'::text[], 10, 'Asistente de IA principal (intención GENERAL). Aquí van las instrucciones de Genesys.'),
  ('Base de datos', 'accion', '{}'::text[], 20, 'ACCIÓN que dispara la IA para registrar al alumno en el CRM (/genesys/webhook). Sospecha del bucle de confirmaciones repetidas.'),
  ('Modalidad', 'palabras', '{Modalidad,traslado,discapacidad}'::text[], 30, ''),
  ('Agradecimiento', 'palabras', '{Gracias,ok,"de acuerdo"}'::text[], 40, 'Revisar si incluye "sí": choca con la confirmación de datos.'),
  ('CARRERAS', 'palabras', '{carreras,carrera,info}'::text[], 50, ''),
  ('COSTOS', 'palabras', '{costo,cuesta,mensualidad}'::text[], 60, ''),
  ('Silencio', 'palabras', '{zz_silencio_crm}'::text[], 70, 'Lo usa el CRM para callar al bot cuando un asesor atiende al alumno.')
) as v (nombre, disparador, palabras, orden, notas)
where not exists (select 1 from public.flujos_bot);
