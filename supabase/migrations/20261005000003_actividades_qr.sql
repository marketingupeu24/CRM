-- =====================================================================
--  Actividades con QR (ferias, visitas a colegios, charlas).
--  - actividades: cada salida con su código público (QR -> /r/<codigo>).
--  - registrar_lead_actividad(): el alumno llena el formulario desde su
--    celular (sin sesión). Usa procesar_lead (sin duplicados por celular o
--    DNI), asigna al responsable o por rotación, avisa al asesor y, si la
--    actividad lo pide, Genesys le da la bienvenida por WhatsApp.
--  - Módulo "actividades" (crear actividades y QR): lo tienen los asesores.
-- =====================================================================

alter table public.asesores drop constraint if exists asesores_permisos_validos;
alter table public.asesores add constraint asesores_permisos_validos check (permisos <@ array[
  'pendientes', 'chats', 'leads', 'kanban', 'registrar', 'costos', 'actividades',
  'dashboard', 'campanas', 'exportar',
  'ver_todos', 'asignar', 'editar_celular', 'papelera',
  'usuarios', 'respuestas', 'gestionar_campanas',
  'conocimiento'
]::text[]);
alter table public.asesores alter column permisos
  set default '{pendientes,chats,leads,kanban,registrar,costos,actividades,dashboard,campanas,exportar}';
update public.asesores set permisos = array_append(permisos, 'actividades')
where 'leads' = any (permisos) and not ('actividades' = any (permisos));

-- Nueva fuente de leads
alter table public.leads drop constraint if exists leads_origen_valido;
alter table public.leads add constraint leads_origen_valido
  check (origen = any (array['whatsapp_genesys', 'manual', 'google_form', 'web', 'actividad']));

create table public.actividades (
  id             bigint generated always as identity primary key,
  codigo         text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  nombre         text not null check (length(trim(nombre)) between 3 and 120),
  tipo           text not null default 'feria' check (tipo in ('feria', 'colegio', 'charla', 'otro')),
  lugar          text check (lugar is null or length(lugar) <= 120),
  fecha          date,
  activa         boolean not null default true,
  asignacion     text not null default 'responsable' check (asignacion in ('responsable', 'rotacion')),
  responsable_id uuid references public.asesores (id) on delete set null default public.mi_asesor_id(),
  bienvenida     boolean not null default true,
  created_at     timestamptz not null default now()
);

comment on table public.actividades is 'Ferias, visitas a colegios y charlas con formulario por QR (/r/<codigo>).';

alter table public.leads
  add column if not exists actividad_id bigint references public.actividades (id) on delete set null,
  add column if not exists colegio text,
  add column if not exists grado text;

create index if not exists leads_actividad_idx on public.leads (actividad_id) where actividad_id is not null;

alter table public.actividades enable row level security;
revoke all on public.actividades from anon;
grant select, insert, update, delete on public.actividades to authenticated;

create policy "actividades: los usuarios del panel las ven"
on public.actividades for select to authenticated
using ((select public.mi_asesor_id()) is not null);

create policy "actividades: crear con el módulo"
on public.actividades for insert to authenticated
with check ((select public.tiene_permiso('actividades')));

create policy "actividades: editar las propias (o todas con ver_todos)"
on public.actividades for update to authenticated
using ((select public.tiene_permiso('actividades'))
       and (responsable_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('ver_todos'))))
with check ((select public.tiene_permiso('actividades')));

create policy "actividades: eliminar las propias (o todas con ver_todos)"
on public.actividades for delete to authenticated
using ((select public.tiene_permiso('actividades'))
       and (responsable_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('ver_todos'))));

-- Datos públicos de una actividad (para la página del formulario)
create or replace function public.actividad_publica(p_codigo text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('nombre', a.nombre, 'tipo', a.tipo, 'lugar', a.lugar, 'fecha', a.fecha, 'activa', a.activa)
  from public.actividades a where a.codigo = lower(trim(p_codigo))
$$;

-- Registro desde el formulario público
create or replace function public.registrar_lead_actividad(
  p_codigo   text,
  p_nombre   text,
  p_telefono text,
  p_dni      text default null,
  p_colegio  text default null,
  p_grado    text default null,
  p_carrera  text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_act      public.actividades;
  v_tel      text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_dni      text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_nombre   text := nullif(regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_cepre    boolean := coalesce(p_carrera, '') ~* 'cepre';
  v_carrera  text := nullif(trim(coalesce(p_carrera, '')), '');
  v_asesor   uuid;
  v_res      jsonb;
  v_lead     uuid;
begin
  select * into v_act from public.actividades where codigo = lower(trim(p_codigo));
  if not found or not v_act.activa then
    raise exception 'Este formulario ya no está disponible';
  end if;
  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 120 then
    raise exception 'Escribe tu nombre completo';
  end if;
  if v_tel ~ '^9[0-9]{8}$' then v_tel := '51' || v_tel; end if;
  if v_tel !~ '^[0-9]{10,15}$' then
    raise exception 'Revisa tu número de celular';
  end if;
  if v_dni is not null and v_dni !~ '^[0-9]{8,12}$' then
    raise exception 'El DNI debe tener 8 dígitos';
  end if;
  -- Freno contra abusos: máximo 60 registros por minuto en una actividad
  if (select count(*) from public.leads where actividad_id = v_act.id and ultimo_registro_at > now() - interval '1 minute') >= 60 then
    raise exception 'Demasiados registros seguidos. Intenta en un minuto.';
  end if;
  if v_carrera is not null and v_carrera ~* '^(aun|aún) no' then v_carrera := null; end if;

  if v_act.asignacion = 'responsable' then
    select id into v_asesor from public.asesores
    where id = v_act.responsable_id and activo and rol = 'asesor' and eliminado_at is null;
  end if;

  v_res := public.procesar_lead(
    p_telefono  => v_tel,
    p_dni       => v_dni,
    p_nombre    => v_nombre,
    p_carrera   => case when v_cepre then null else v_carrera end,
    p_modalidad => case when v_cepre then 'CEPRE' else null end,
    p_programa  => case when v_cepre then 'cepre' else 'pregrado' end,
    p_consulta  => left('Registro en ' || v_act.nombre
                        || coalesce(' · ' || nullif(trim(p_colegio), ''), '')
                        || coalesce(' · ' || nullif(trim(p_grado), ''), ''), 300),
    p_origen    => 'actividad',
    p_asesor_id => v_asesor,
    p_asignar   => true,
    p_notificar => false
  );
  v_lead := (v_res->>'lead_id')::uuid;

  update public.leads
  set actividad_id   = v_act.id,
      colegio        = coalesce(nullif(left(trim(p_colegio), 120), ''), colegio),
      grado          = coalesce(nullif(left(trim(p_grado), 40), ''), grado),
      origen_campana = coalesce(origen_campana, 'Feria / colegio')
  where id = v_lead;

  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead, 'sistema', 'Se registró con el QR de "' || v_act.nombre || '"'
          || coalesce(' (' || nullif(trim(p_colegio), '') || ')', ''));

  -- Aviso al asesor y bienvenida al alumno (Genesys)
  perform public.llamar_genesys('notificar', jsonb_build_object(
    'lead_ids', jsonb_build_array(v_lead),
    'asignado_por', 'QR: ' || v_act.nombre,
    'bienvenida', v_act.bienvenida,
    'actividad', v_act.nombre
  ));

  return jsonb_build_object('ok', true, 'actividad', v_act.nombre);
end $$;

revoke execute on function public.actividad_publica(text), public.registrar_lead_actividad(text, text, text, text, text, text, text) from public;
grant execute on function public.actividad_publica(text), public.registrar_lead_actividad(text, text, text, text, text, text, text) to anon, authenticated;

-- Resumen por actividad: registrados y cuántos avanzaron
create or replace function public.resumen_actividades()
returns table (actividad_id bigint, registrados int, contactados int, matriculados int)
language sql stable security definer set search_path = ''
as $$
  select l.actividad_id, count(*)::int,
         (count(*) filter (where l.estado in ('lead_contactado', 'lead_atendido', 'lead_inscrito', 'lead_matriculado')))::int,
         (count(*) filter (where l.estado = 'lead_matriculado'))::int
  from public.leads l
  where l.actividad_id is not null and l.eliminado_at is null and public.mi_asesor_id() is not null
  group by l.actividad_id
$$;

revoke execute on function public.resumen_actividades() from public, anon;
grant execute on function public.resumen_actividades() to authenticated;
