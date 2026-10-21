-- QR del asesor: distinguir a quien se registró escaneando el QR (presencial) de quien abrió el enlace
-- que el asesor le envió por WhatsApp (?via=enlace). Solo cambia el origen y los textos; lo demás es igual.

drop function if exists public.registrar_lead_asesor(text, text, text, text, text, text, text);

create function public.registrar_lead_asesor(p_codigo text, p_nombre text, p_telefono text, p_dni text DEFAULT NULL::text, p_colegio text DEFAULT NULL::text, p_grado text DEFAULT NULL::text, p_carrera text DEFAULT NULL::text, p_via text DEFAULT 'qr')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_asesor     public.asesores;
  v_tel        text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_dni        text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_nombre     text := nullif(regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_carrera    text := nullif(trim(coalesce(p_carrera, '')), '');
  v_cepre      boolean;
  v_existente  public.leads;
  v_res        jsonb;
  v_lead       uuid;
  v_suyo       boolean;
  -- Por dónde llegó: escaneó el QR en persona o abrió el enlace que el asesor le envió por WhatsApp
  v_enlace     boolean := coalesce(p_via, '') = 'enlace';
begin
  select * into v_asesor from public.asesores where codigo_qr = upper(trim(p_codigo)) and eliminado_at is null;
  if v_asesor.id is null then
    raise exception 'Este QR ya no está disponible. Pide a tu asesor(a) uno nuevo.';
  end if;
  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 120 then
    raise exception 'Escribe tu nombre completo';
  end if;
  if v_dni is not null and v_dni !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe tener 8 dígitos (o déjalo vacío)';
  end if;
  if v_tel ~ '^9[0-9]{8}$' then v_tel := '51' || v_tel; end if;
  if v_tel !~ '^[0-9]{10,15}$' then
    raise exception 'Revisa tu número de celular';
  end if;
  if (select count(*) from public.leads where registrado_por = v_asesor.id and ultimo_registro_at > now() - interval '1 minute') >= 30 then
    raise exception 'Demasiados registros seguidos. Intenta en un minuto.';
  end if;
  if v_carrera is not null and v_carrera ~* '^(aun|aún) no' then v_carrera := null; end if;
  v_cepre := coalesce(v_carrera, '') ~* 'cepre';

  -- Si ya es lead de otro asesor, se respeta (se actualizan sus datos)
  select * into v_existente from public.leads
  where (v_dni is not null and dni = v_dni) or telefono = v_tel
  order by (dni = v_dni) desc nulls last limit 1;
  v_suyo := v_existente.id is null or v_existente.asesor_id is null or v_existente.asesor_id = v_asesor.id;

  v_res := public.procesar_lead(
    p_telefono  => v_tel,
    p_dni       => v_dni,
    p_nombre    => v_nombre,
    p_carrera   => case when v_cepre then null else v_carrera end,
    p_modalidad => case when v_cepre then 'CEPRE' else null end,
    p_programa  => case when v_cepre then 'cepre' else 'pregrado' end,
    p_consulta  => left(case when v_enlace then 'Registro por el enlace de ' else 'Registro presencial con ' end || v_asesor.nombre
                        || coalesce(' · ' || nullif(trim(p_colegio), ''), '')
                        || coalesce(' · ' || nullif(trim(p_grado), ''), ''), 300),
    p_origen    => 'manual',
    p_asesor_id => case when v_suyo then v_asesor.id end,
    p_asignar   => v_suyo,
    p_notificar => false
  );
  v_lead := (v_res->>'lead_id')::uuid;

  perform set_config('crm.asignacion_sistema', 'on', true);
  update public.leads
  set colegio        = coalesce(nullif(left(trim(p_colegio), 120), ''), colegio),
      grado          = coalesce(nullif(left(trim(p_grado), 40), ''), grado),
      origen_campana = coalesce(origen_campana, case when v_enlace then 'Enlace del asesor (WhatsApp)' else 'Presencial (QR del asesor)' end),
      registrado_por = case when v_suyo then v_asesor.id else registrado_por end,
      -- Lo está atendiendo en persona: ya contactado
      estado         = case when v_suyo and estado in ('lead_nuevo', 'lead_en_conversacion', 'lead_interesado', 'lead_no_interesado', 'lead_perdido', 'lead_asignado')
                            then 'lead_contactado'::public.lead_estado else estado end,
      eliminado_at   = null,
      eliminado_por  = null
  where id = v_lead;

  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead, 'sistema', case when v_enlace then 'Llenó el formulario del enlace de ' || v_asesor.nombre || ' (enviado por WhatsApp)' else 'Llenó el formulario del QR de ' || v_asesor.nombre || ' (atención presencial)' end
          || case when v_suyo then '' else ': ya era lead de otro asesor, no se cambió' end);

  if not v_suyo then
    perform public.avisar_visita(v_lead, v_asesor.id, 'llenó el formulario de su QR');
  end if;

  if v_suyo then
    perform public.llamar_genesys('notificar', jsonb_build_object(
      'lead_ids', jsonb_build_array(v_lead),
      'asignado_por', case when v_enlace then 'tu enlace · formulario por WhatsApp' else 'tu QR · formulario presencial' end
    ));
  end if;

  return jsonb_build_object(
    'ok', true,
    'asesor', array_to_string((regexp_split_to_array(trim(v_asesor.nombre), '\s+'))[1:2], ' '),
    'whatsapp', (select valor from public.ajustes where clave = 'whatsapp_genesys'),
    'ref', left(v_lead::text, 6)
  );
end $function$;

revoke all on function public.registrar_lead_asesor(text, text, text, text, text, text, text, text) from public;
grant execute on function public.registrar_lead_asesor(text, text, text, text, text, text, text, text) to anon, authenticated, service_role;
