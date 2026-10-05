-- =====================================================================
--  Formulario del QR: el DNI vuelve a ser opcional.
--  Con DNI, el alumno se identifica por su DNI; sin DNI, por su celular
--  (procesar_lead busca primero por DNI y luego por celular).
-- =====================================================================

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
  v_act        public.actividades;
  v_tel        text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_dni        text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_nombre     text := nullif(regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_cepre      boolean := coalesce(p_carrera, '') ~* 'cepre';
  v_carrera    text := nullif(trim(coalesce(p_carrera, '')), '');
  v_asesor     uuid;
  v_res        jsonb;
  v_lead       uuid;
  v_restaurado boolean;
begin
  select * into v_act from public.actividades where codigo = lower(trim(p_codigo));
  if not found or not v_act.activa then
    raise exception 'Este formulario ya no está disponible';
  end if;
  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 120 then
    raise exception 'Escribe tu nombre completo';
  end if;
  -- DNI opcional: si viene, es el identificador; si no, lo es el celular
  if v_dni is not null and v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe tener 8 dígitos (o déjalo vacío)';
  end if;
  if v_tel ~ '^9[0-9]{8}$' then v_tel := '51' || v_tel; end if;
  if v_tel !~ '^[0-9]{10,15}$' then
    raise exception 'Revisa tu número de celular';
  end if;
  if (select count(*) from public.leads where actividad_id = v_act.id and ultimo_registro_at > now() - interval '1 minute') >= 60 then
    raise exception 'Demasiados registros seguidos. Intenta en un minuto.';
  end if;
  if v_carrera is not null and v_carrera ~* '^(aun|aún) no' then v_carrera := null; end if;

  if v_act.asignacion = 'responsable' then
    select id into v_asesor from public.asesores
    where id = v_act.responsable_id and activo and rol = 'asesor' and eliminado_at is null;
  end if;

  -- procesar_lead busca primero por DNI (si lo hay) y luego por celular: nunca duplica
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
  select eliminado_at is not null into v_restaurado from public.leads where id = v_lead;

  update public.leads
  set actividad_id   = v_act.id,
      colegio        = coalesce(nullif(left(trim(p_colegio), 120), ''), colegio),
      grado          = coalesce(nullif(left(trim(p_grado), 40), ''), grado),
      origen_campana = coalesce(origen_campana, 'Feria / colegio'),
      eliminado_at   = null,
      eliminado_por  = null
  where id = v_lead;

  if v_restaurado then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead, 'sistema', 'Restaurado de la papelera: volvió a registrarse con un QR');
  end if;
  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead, 'sistema', 'Se registró con el QR de "' || v_act.nombre || '"'
          || coalesce(' (' || nullif(trim(p_colegio), '') || ')', ''));

  -- Solo se avisa al asesor; al alumno no se le escribe (él inicia el chat)
  perform public.llamar_genesys('notificar', jsonb_build_object(
    'lead_ids', jsonb_build_array(v_lead),
    'asignado_por', 'QR: ' || v_act.nombre
  ));

  return jsonb_build_object(
    'ok', true,
    'actividad', v_act.nombre,
    'whatsapp', (select valor from public.ajustes where clave = 'whatsapp_genesys')
  );
end $$;

revoke execute on function public.registrar_lead_actividad(text, text, text, text, text, text, text) from public;
grant execute on function public.registrar_lead_actividad(text, text, text, text, text, text, text) to anon, authenticated;
