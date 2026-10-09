-- =====================================================================
--  Recordatorios automáticos a los alumnos ("faltan 3 días para el cierre de
--  inscripciones", "mañana es tu examen"). Cuidados para el número de Genesys
--  (conectado por QR, puede ser bloqueado si parece spam):
--  - Se crean APAGADOS; hay que activarlos a propósito.
--  - Solo a quien ya nos escribió, no se inscribió y no pidió dejar de recibirlos.
--  - Solo en horario de atención, de a pocos (10 cada 10 minutos, con pausas).
--  - Cada alumno recibe cada recordatorio una sola vez.
--  - Si responde "NO" después de un recordatorio, no recibe más (leads.no_recordatorios).
--  Variables del mensaje: {nombre}, {carrera}, {asesor}.
-- =====================================================================

alter table public.leads add column if not exists no_recordatorios boolean not null default false;
comment on column public.leads.no_recordatorios is 'Pidió no recibir recordatorios automáticos (respondió NO)';

create table if not exists public.recordatorios_alumnos (
  id               bigint generated always as identity primary key,
  titulo           text not null check (length(trim(titulo)) between 2 and 120),
  mensaje          text not null check (length(trim(mensaje)) between 10 and 1500),
  enviar_el        date not null,
  desde_hora       time not null default '09:00',
  carreras         text[] not null default '{}',   -- vacío = todas; si no, partes del nombre (ej. Enfermería)
  excluir_carreras text[] not null default '{Medicina}',
  solo_registrados boolean not null default true,  -- solo quienes dieron su documento
  activo           boolean not null default false,
  completado_at    timestamptz,
  creado_por       uuid references public.asesores (id) on delete set null default public.mi_asesor_id(),
  created_at       timestamptz not null default now()
);
create index if not exists recordatorios_alumnos_creado_por_idx on public.recordatorios_alumnos (creado_por);

create table if not exists public.recordatorios_envios (
  recordatorio_id bigint not null references public.recordatorios_alumnos (id) on delete cascade,
  lead_id         uuid not null references public.leads (id) on delete cascade,
  reservado_at    timestamptz not null default now(),
  enviado_at      timestamptz,
  error           text,
  primary key (recordatorio_id, lead_id)
);
create index if not exists recordatorios_envios_lead_idx on public.recordatorios_envios (lead_id, enviado_at desc);

alter table public.recordatorios_alumnos enable row level security;
alter table public.recordatorios_envios enable row level security;
revoke all on public.recordatorios_alumnos, public.recordatorios_envios from anon;
drop policy if exists "recordatorios: modulo conocimiento" on public.recordatorios_alumnos;
create policy "recordatorios: modulo conocimiento" on public.recordatorios_alumnos for all to authenticated
  using ((select public.tiene_permiso('conocimiento'))) with check ((select public.tiene_permiso('conocimiento')));
drop policy if exists "envios: modulo conocimiento" on public.recordatorios_envios;
create policy "envios: modulo conocimiento" on public.recordatorios_envios for select to authenticated
  using ((select public.tiene_permiso('conocimiento')));

/** Alumnos que deben recibir el recordatorio (y aún no lo recibieron). */
create or replace function public.destinatarios_recordatorio(p_id bigint)
returns setof public.leads
language sql stable security definer set search_path = ''
as $$
  select l.*
  from public.recordatorios_alumnos r
  join public.leads l on true
  where r.id = p_id
    and l.eliminado_at is null
    and not l.no_recordatorios
    and l.ultimo_mensaje_lead_at is not null                       -- ya nos escribió
    and l.estado not in ('lead_inscrito', 'lead_matriculado', 'lead_perdido', 'lead_no_interesado')
    and (not r.solo_registrados or l.dni is not null)
    and (cardinality(r.carreras) = 0
         or exists (select 1 from unnest(r.carreras) c where coalesce(l.carrera_interes, l.modalidad, '') ilike '%' || c || '%'))
    and not exists (select 1 from unnest(r.excluir_carreras) c where coalesce(l.carrera_interes, l.modalidad, '') ilike '%' || c || '%')
    and not exists (select 1 from public.recordatorios_envios e where e.recordatorio_id = r.id and e.lead_id = l.id)
$$;
revoke execute on function public.destinatarios_recordatorio(bigint) from public, anon, authenticated;

/** Para el panel: a cuántos les llegaría y a cuántos ya les llegó. */
create or replace function public.resumen_recordatorio(p_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.tiene_permiso('conocimiento') then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'pendientes', (select count(*) from public.destinatarios_recordatorio(p_id)),
    'enviados', (select count(*) from public.recordatorios_envios where recordatorio_id = p_id and enviado_at is not null),
    'errores', (select count(*) from public.recordatorios_envios where recordatorio_id = p_id and error is not null)
  );
end $$;
grant execute on function public.resumen_recordatorio(bigint) to authenticated;

/**
 * Reserva el siguiente lote a enviar (lo llama la función genesys desde el cron).
 * Solo en horario de atención y desde la hora indicada del día de envío.
 */
create or replace function public.reservar_recordatorios(p_limite int default 10)
returns table (recordatorio_id bigint, titulo text, mensaje text, lead_id uuid, telefono text, nombre text, carrera text, asesor text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.recordatorios_alumnos;
  v_quedan int := greatest(1, least(p_limite, 30));
  v_lima timestamp := now() at time zone 'America/Lima';
  v_n int;
begin
  if not public.en_horario_atencion() then return; end if;
  for r in
    select * from public.recordatorios_alumnos
    where activo and completado_at is null and enviar_el <= v_lima::date
      and (enviar_el < v_lima::date or desde_hora <= v_lima::time)
    order by enviar_el, id
  loop
    exit when v_quedan <= 0;
    return query
      with lote as (
        insert into public.recordatorios_envios (recordatorio_id, lead_id)
        select r.id, d.id from public.destinatarios_recordatorio(r.id) d
        order by d.ultimo_mensaje_lead_at desc
        limit v_quedan
        on conflict do nothing
        returning recordatorios_envios.lead_id
      )
      select r.id, r.titulo, r.mensaje, l.id, l.telefono, l.nombre, coalesce(l.carrera_interes, l.modalidad), a.nombre
      from lote join public.leads l on l.id = lote.lead_id left join public.asesores a on a.id = l.asesor_id;
    get diagnostics v_n = row_count;
    v_quedan := v_quedan - v_n;
    -- Sin más destinatarios: el recordatorio queda completo
    if not exists (select 1 from public.destinatarios_recordatorio(r.id)) then
      update public.recordatorios_alumnos set completado_at = now() where id = r.id;
    end if;
  end loop;
end $$;
revoke execute on function public.reservar_recordatorios(int) from public, anon, authenticated;
grant execute on function public.reservar_recordatorios(int) to service_role;

/** Resultado de cada envío (lo marca la función genesys) y nota en el historial del lead. */
create or replace function public.marcar_recordatorio(p_recordatorio_id bigint, p_lead_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.recordatorios_envios
  set enviado_at = case when p_ok then now() end, error = case when p_ok then null else left(p_error, 300) end
  where recordatorio_id = p_recordatorio_id and lead_id = p_lead_id;
  if p_ok then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    select p_lead_id, 'sistema', '⏰ Recordatorio automático enviado: ' || titulo
    from public.recordatorios_alumnos where id = p_recordatorio_id;
  end if;
end $$;
revoke execute on function public.marcar_recordatorio(bigint, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.marcar_recordatorio(bigint, uuid, boolean, text) to service_role;

/** El alumno respondió "NO" a un recordatorio (en los últimos 7 días): no recibe más. */
create or replace function public.baja_recordatorios(p_lead_id uuid, p_texto text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(p_texto, '') !~* '^\s*(no|baja|stop|ya no|no gracias|no deseo|no quiero)\s*[.!]*\s*$' then return false; end if;
  if not exists (select 1 from public.recordatorios_envios where lead_id = p_lead_id and enviado_at > now() - interval '7 days') then
    return false;
  end if;
  update public.leads set no_recordatorios = true where id = p_lead_id and not no_recordatorios;
  if found then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (p_lead_id, 'sistema', '🔕 Pidió no recibir más recordatorios automáticos');
  end if;
  return true;
end $$;
revoke execute on function public.baja_recordatorios(uuid, text) from public, anon, authenticated;
grant execute on function public.baja_recordatorios(uuid, text) to service_role;

-- Borradores (apagados) para la campaña 2027-1: revisa el texto y actívalos si quieres usarlos
insert into public.recordatorios_alumnos (titulo, mensaje, enviar_el, desde_hora, carreras, excluir_carreras, solo_registrados, creado_por)
select * from (values
  ('Cierre de inscripciones (Enfermería, Psicología, Ing. Civil)',
   E'¡Hola, {nombre}! 👋 Te recuerda Admisión de la Universidad Peruana Unión 🎓\n📝 Las inscripciones para *{carrera}* cierran el *13 de noviembre*\n📅 Examen de admisión: *22 de noviembre*\nTu asesor(a) {asesor} te ayuda a inscribirte por aquí 😊',
   date '2026-11-10', time '09:00', array['Enfermería', 'Psicología', 'Civil'], array['Medicina'], true, null::uuid),
  ('Cierre de inscripciones (demás carreras)',
   E'¡Hola, {nombre}! 👋 Te recuerda Admisión de la Universidad Peruana Unión 🎓\n📝 Las inscripciones para *{carrera}* cierran el *17 de noviembre*\n📅 Examen de admisión: *22 de noviembre*\nTu asesor(a) {asesor} te ayuda a inscribirte por aquí 😊',
   date '2026-11-14', time '09:00', '{}'::text[], array['Medicina', 'Enfermería', 'Psicología', 'Civil'], true, null::uuid)
) v
where not exists (select 1 from public.recordatorios_alumnos);

-- Cron: cada 10 minutos (la función solo envía en horario de atención)
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'genesys-recordar-alumnos';
    perform cron.schedule('genesys-recordar-alumnos', '*/10 * * * *', $c$select public.llamar_genesys('recordar-alumnos')$c$);
  end if;
end $do$;
