-- =====================================================================
--  Registrar leads: por defecto a nombre de quien registra.
--  - Módulo "repartir": permite repartir por igual entre los asesores
--    (el super admin decide a quién se lo da).
--  - importar_leads(..., p_repartir).
--  - eliminar_actividad(): solo el super admin y solo si nadie se registró.
-- =====================================================================

alter table public.asesores drop constraint if exists asesores_permisos_validos;
alter table public.asesores add constraint asesores_permisos_validos check (permisos <@ array[
  'pendientes', 'chats', 'leads', 'kanban', 'registrar', 'costos', 'actividades',
  'dashboard', 'campanas', 'exportar',
  'ver_todos', 'asignar', 'repartir', 'editar_celular', 'papelera',
  'usuarios', 'respuestas', 'gestionar_campanas',
  'conocimiento'
]::text[]);
-- Los administradores conservan todo
update public.asesores set permisos = array_append(permisos, 'repartir')
where rol = 'admin' and not ('repartir' = any (permisos));

drop function if exists public.importar_leads(jsonb, bigint, uuid, text, boolean);

create or replace function public.importar_leads(
  p_filas        jsonb,
  p_actividad_id bigint default null,
  p_asesor_id    uuid default null,
  p_origen       text default null,
  -- true: el aviso al asesor se junta con otros y sale en un resumen cada pocos minutos
  p_aviso_diferido boolean default false,
  -- true: repartir por igual entre los asesores (requiere el módulo "repartir" o "asignar")
  p_repartir     boolean default false
)
returns table (fila int, estado text, mensaje text, lead_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo        uuid := public.mi_asesor_id();
  v_asignar   boolean := public.tiene_permiso('asignar');
  v_act       public.actividades;
  v_asesor    uuid;
  v_f         jsonb;
  v_i         int := 0;
  v_nombre    text;
  v_tel       text;
  v_dni       text;
  v_carrera   text;
  v_cepre     boolean;
  v_res       jsonb;
  v_lead      uuid;
  v_ids       jsonb := '[]'::jsonb;
  v_quien     text;
begin
  if v_yo is null or not public.tiene_permiso('registrar') then
    raise exception 'No tienes permiso para registrar leads';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay alumnos para importar';
  end if;
  if jsonb_array_length(p_filas) > 500 then
    raise exception 'Máximo 500 alumnos por importación';
  end if;
  if p_actividad_id is not null then
    select * into v_act from public.actividades where id = p_actividad_id;
  end if;

  -- Por defecto, a nombre de quien registra. Repartir por igual: con el módulo "repartir" (o "asignar").
  -- Elegir un asesor en particular: solo con "asignar".
  v_asesor := case
    when p_repartir and (v_asignar or public.tiene_permiso('repartir')) then null
    when v_asignar and p_asesor_id is not null then p_asesor_id
    else v_yo
  end;
  if v_asesor is not null and not exists (select 1 from public.asesores where id = v_asesor and activo and rol = 'asesor' and eliminado_at is null) then
    v_asesor := null;  -- admin u otro que no recibe leads: rotación
  end if;

  perform set_config('crm.sin_aviso_asignacion', 'on', true);

  for v_f in select * from jsonb_array_elements(p_filas) loop
    v_i := v_i + 1;
    v_nombre  := nullif(regexp_replace(trim(coalesce(v_f->>'nombre', '')), '\s+', ' ', 'g'), '');
    v_tel     := regexp_replace(coalesce(v_f->>'celular', ''), '\D', '', 'g');
    v_dni     := nullif(regexp_replace(coalesce(v_f->>'dni', ''), '\D', '', 'g'), '');
    v_carrera := nullif(trim(coalesce(v_f->>'carrera', '')), '');
    v_cepre   := coalesce(v_carrera, '') ~* 'cepre';
    if v_tel ~ '^9[0-9]{8}$' then v_tel := '51' || v_tel; end if;

    if v_nombre is null or length(v_nombre) < 3 then
      fila := v_i; estado := 'error'; mensaje := 'Falta el nombre'; lead_id := null; return next; continue;
    end if;
    if v_tel !~ '^[0-9]{10,15}$' then
      fila := v_i; estado := 'error'; mensaje := 'Celular no válido'; lead_id := null; return next; continue;
    end if;
    if v_dni is not null and v_dni !~ '^[0-9]{8,12}$' then
      fila := v_i; estado := 'error'; mensaje := 'DNI no válido'; lead_id := null; return next; continue;
    end if;
    -- Un asesor no puede tomar un lead que ya es de otro asesor
    if not v_asignar and exists (
      select 1 from public.leads
      where (telefono = v_tel or (v_dni is not null and dni = v_dni))
        and asesor_id is not null and asesor_id <> v_yo and eliminado_at is null
    ) then
      fila := v_i; estado := 'omitido'; mensaje := 'Ya está registrado con otro asesor'; lead_id := null; return next; continue;
    end if;

    begin
      v_res := public.procesar_lead(
        p_telefono  => v_tel,
        p_dni       => v_dni,
        p_nombre    => v_nombre,
        p_carrera   => case when v_cepre then null else v_carrera end,
        p_modalidad => case when v_cepre then 'CEPRE' else null end,
        p_programa  => case when v_cepre then 'cepre' else 'pregrado' end,
        p_consulta  => case when v_act.id is not null then left('Registro en ' || v_act.nombre, 300) else 'Importado desde planilla' end,
        p_origen    => case when v_act.id is not null then 'actividad' else 'manual' end,
        p_asesor_id => v_asesor,
        p_asignar   => true,
        p_notificar => false
      );
      v_lead := (v_res->>'lead_id')::uuid;
      update public.leads
      set colegio        = coalesce(nullif(left(trim(v_f->>'colegio'), 120), ''), colegio),
          grado          = coalesce(nullif(left(trim(v_f->>'grado'), 40), ''), grado),
          actividad_id   = coalesce(v_act.id, actividad_id),
          origen_campana = coalesce(nullif(left(trim(coalesce(v_f->>'origen', p_origen)), 60), ''),
                                    case when v_act.id is not null then 'Feria / colegio' end, origen_campana),
          eliminado_at   = null,
          eliminado_por  = null
      where id = v_lead;
      if v_res->>'asesor_id' is not null then v_ids := v_ids || to_jsonb(v_lead); end if;
      fila := v_i;
      estado := case when v_res->>'status' = 'success' then 'nuevo' else 'actualizado' end;
      mensaje := coalesce('Asignado a ' || (v_res->>'asesor_nombre'), 'Sin asesor');
      lead_id := v_lead;
      return next;
    exception when others then
      fila := v_i; estado := 'error'; mensaje := left(sqlerrm, 200); lead_id := null; return next;
    end;
  end loop;

  -- Registro rápido de fichas: el aviso se junta y sale en un resumen (enviar_avisos_pendientes)
  if p_aviso_diferido and jsonb_array_length(v_ids) > 0 then
    insert into public.avisos_pendientes (lead_id, creado_por, actividad)
    select (x #>> '{}')::uuid, v_yo, v_act.nombre from jsonb_array_elements(v_ids) x
    on conflict on constraint avisos_pendientes_pkey do nothing;
  -- Un solo aviso por asesor (Genesys agrupa: con más de 3 leads manda un resumen)
  elsif jsonb_array_length(v_ids) > 0 then
    select nombre into v_quien from public.asesores where id = v_yo;
    perform public.llamar_genesys('notificar', jsonb_build_object(
      'lead_ids', v_ids,
      'asignado_por', coalesce(v_quien, 'Importación') || case when v_act.id is not null then ' · ' || v_act.nombre else '' end
    ));
  end if;
  perform set_config('crm.sin_aviso_asignacion', 'off', true);
end $$;



revoke execute on function public.importar_leads(jsonb, bigint, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.importar_leads(jsonb, bigint, uuid, text, boolean, boolean) to authenticated;

-- Eliminar una actividad: solo el super admin y solo si ningún alumno se registró con ella
create or replace function public.eliminar_actividad(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_registrados int;
begin
  if not public.es_superadmin() then
    raise exception 'Solo el super admin puede eliminar actividades';
  end if;
  select count(*) into v_registrados from public.leads where actividad_id = p_id;
  if v_registrados > 0 then
    raise exception 'No se puede eliminar: tiene % alumno(s) registrado(s). Ciérrala en su lugar.', v_registrados;
  end if;
  delete from public.actividades where id = p_id;
  if not found then
    raise exception 'La actividad no existe';
  end if;
end $$;

revoke execute on function public.eliminar_actividad(bigint) from public, anon;
grant execute on function public.eliminar_actividad(bigint) to authenticated;
