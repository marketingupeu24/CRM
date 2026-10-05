-- =====================================================================
--  Importar varios alumnos a la vez (planilla, pegar desde Excel o CSV).
--  - importar_leads(): cada fila pasa por procesar_lead (sin duplicados por
--    DNI o celular, asignación) y devuelve el resultado por alumno.
--  - A los alumnos no se les escribe; los asesores reciben un solo aviso
--    al final (el trigger de aviso se pausa durante la importación).
--  - La rotación usa clock_timestamp(): los importados se reparten por igual.
-- =====================================================================

-- Rotación pareja también dentro de una importación (reparte por igual entre los asesores)
create or replace function public.asignar_asesor_lead(p_lead_id uuid)
returns public.asesores
language plpgsql set search_path = ''
as $$
declare
  v_lead   public.leads;
  v_asesor public.asesores;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead % no existe', p_lead_id;
  end if;

  if v_lead.asesor_id is not null then
    select * into v_asesor from public.asesores where id = v_lead.asesor_id;
    return v_asesor;
  end if;

  select * into v_asesor
  from public.asesores
  where activo and rol = 'asesor'
    and case when v_lead.programa = 'cepre' then 'CEPRE' = any (carreras)
             else v_lead.carrera_interes = any (carreras) end
  order by ultimo_lead_asignado nulls first, created_at, nombre
  limit 1
  for update skip locked;

  if v_asesor.id is null then
    select * into v_asesor
    from public.asesores
    where activo and rol = 'asesor' and carreras = '{}'
    order by ultimo_lead_asignado nulls first, created_at, nombre
    limit 1
    for update skip locked;
  end if;

  if v_asesor.id is null then
    select * into v_asesor
    from public.asesores
    where activo and rol = 'asesor'
    order by ultimo_lead_asignado nulls first, created_at, nombre
    limit 1
    for update skip locked;
  end if;

  if v_asesor.id is null then
    raise exception 'No hay asesores activos para asignar leads';
  end if;

  perform set_config('crm.asignacion_sistema', 'on', true);
  -- clock_timestamp(): avanza dentro de la transacción (en una importación now() es siempre el mismo y la rotación se trababa en un asesor)
  update public.asesores set ultimo_lead_asignado = clock_timestamp() where id = v_asesor.id;
  update public.leads set asesor_id = v_asesor.id, estado = 'lead_asignado' where id = p_lead_id;

  return v_asesor;
end $$;

-- El aviso de asignación respeta la pausa de la importación
create or replace function public.avisar_asignacion_panel()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo   uuid := public.mi_asesor_id();
  v_ids  jsonb;
  v_por  text;
begin
  -- La importación en lote avisa una sola vez al final (no un mensaje por fila)
  if auth.uid() is null or current_setting('crm.sin_aviso_asignacion', true) = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    select jsonb_agg(n.id) into v_ids
    from nuevos n
    where n.asesor_id is not null and n.asesor_id is distinct from v_yo;
  else
    select jsonb_agg(n.id) into v_ids
    from nuevos n join viejos v on v.id = n.id
    where n.asesor_id is not null
      and n.asesor_id is distinct from v.asesor_id
      and n.asesor_id is distinct from v_yo;
  end if;

  if v_ids is null then
    return null;
  end if;

  select nombre into v_por from public.asesores where id = v_yo;
  perform public.llamar_genesys('notificar', jsonb_build_object('lead_ids', v_ids, 'asignado_por', v_por));
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Importación de varios alumnos (planilla, pegado de Excel o CSV)
-- p_filas: [{nombre, celular, dni, carrera, colegio, grado, origen}, ...]
-- Devuelve una fila de resultado por alumno (nuevo / actualizado / omitido / error).
-- ---------------------------------------------------------------------
create or replace function public.importar_leads(
  p_filas        jsonb,
  p_actividad_id bigint default null,
  p_asesor_id    uuid default null,
  p_origen       text default null
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

  -- Quien no puede asignar, registra para sí mismo; quien puede, elige asesor o rotación (null)
  v_asesor := case when v_asignar then p_asesor_id else v_yo end;
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

  -- Un solo aviso por asesor (Genesys agrupa: con más de 3 leads manda un resumen)
  if jsonb_array_length(v_ids) > 0 then
    select nombre into v_quien from public.asesores where id = v_yo;
    perform public.llamar_genesys('notificar', jsonb_build_object(
      'lead_ids', v_ids,
      'asignado_por', coalesce(v_quien, 'Importación') || case when v_act.id is not null then ' · ' || v_act.nombre else '' end
    ));
  end if;
  perform set_config('crm.sin_aviso_asignacion', 'off', true);
end $$;

revoke execute on function public.importar_leads(jsonb, bigint, uuid, text) from public, anon;
grant execute on function public.importar_leads(jsonb, bigint, uuid, text) to authenticated;
