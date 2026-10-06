-- =====================================================================
--  El lead que sube un asesor (Registrar lead, Varios alumnos) le pertenece:
--  la reasignación automática (no contactado en 4 h) ya no se lo quita.
--  leads.registrado_por = quién lo subió desde el panel. Si se lo asignó a sí
--  mismo, queda fijo; los que reparte a otros siguen la regla normal.
--  Un admin puede reasignarlo a mano desde el panel cuando lo decida.
-- =====================================================================

alter table public.leads add column if not exists registrado_por uuid references public.asesores (id) on delete set null;
comment on column public.leads.registrado_por is 'Asesor que subió el lead desde el panel; si es el mismo asesor asignado, no se reasigna automáticamente';

-- Los que ya subieron los asesores (origen manual con asesor): quedan como suyos
update public.leads set registrado_por = asesor_id
where origen = 'manual' and asesor_id is not null and registrado_por is null;

CREATE OR REPLACE FUNCTION public.importar_leads(p_filas jsonb, p_actividad_id bigint DEFAULT NULL::bigint, p_asesor_id uuid DEFAULT NULL::uuid, p_origen text DEFAULT NULL::text, p_aviso_diferido boolean DEFAULT false, p_repartir boolean DEFAULT false)
 RETURNS TABLE(fila integer, estado text, mensaje text, lead_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_asesor is not null and not exists (select 1 from public.asesores where id = v_asesor and activo and eliminado_at is null) then
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
          eliminado_por  = null,
          -- Quién lo subió (el primero): si se lo quedó él, la reasignación automática no lo toca
          registrado_por = coalesce(registrado_por, v_yo)
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
end $function$;

CREATE OR REPLACE FUNCTION public.reasignar_sin_contacto(p_horas integer DEFAULT 4, p_maximo integer DEFAULT 2, p_solo_horario boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lead      public.leads;
  v_anterior  public.asesores;
  v_nuevo     public.asesores;
  v_cambios   jsonb := '[]'::jsonb;
begin
  -- Solo en horario de oficina (8:00 a 20:00 en Lima)
  if p_solo_horario and extract(hour from now() at time zone 'America/Lima') not between 8 and 19 then
    return v_cambios;
  end if;

  perform set_config('crm.asignacion_sistema', 'on', true);

  for v_lead in
    select * from public.leads
    where estado = 'lead_asignado'
      and eliminado_at is null
      and asesor_id is not null
      and primer_contacto_asesor_at is null
      and fecha_asignado < now() - make_interval(hours => p_horas)
      and reasignaciones < p_maximo
      -- El lead que subió el propio asesor es suyo: no se reasigna
      and (registrado_por is null or registrado_por <> asesor_id)
    order by fecha_asignado
    for update skip locked
  loop
    select * into v_anterior from public.asesores where id = v_lead.asesor_id;

    -- Mismo reparto que asignar_asesor_lead, sin el asesor actual
    select * into v_nuevo from public.asesores
    where activo and id <> v_lead.asesor_id
      and case when v_lead.programa = 'cepre' then 'CEPRE' = any (carreras)
               else v_lead.carrera_interes = any (carreras) end
    order by ultimo_lead_asignado nulls first, created_at, nombre
    limit 1 for update skip locked;

    if v_nuevo.id is null then
      select * into v_nuevo from public.asesores
      where activo and id <> v_lead.asesor_id and carreras = '{}'
      order by ultimo_lead_asignado nulls first, created_at, nombre
      limit 1 for update skip locked;
    end if;

    continue when v_nuevo.id is null;   -- no hay a quién pasarlo

    update public.asesores set ultimo_lead_asignado = now() where id = v_nuevo.id;
    update public.leads
    set asesor_id = v_nuevo.id,
        fecha_asignado = now(),
        reasignaciones = reasignaciones + 1,
        notificacion_estado = 'pendiente'
    where id = v_lead.id;

    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'sistema',
            format('Reasignado automáticamente de %s a %s: no fue contactado en %s h', v_anterior.nombre, v_nuevo.nombre, p_horas));

    v_cambios := v_cambios || jsonb_build_object(
      'lead_id', v_lead.id, 'asesor_anterior', v_anterior.nombre,
      'asesor_nuevo', v_nuevo.nombre, 'asesor_telefono', v_nuevo.telefono);
  end loop;

  return v_cambios;
end $function$;
