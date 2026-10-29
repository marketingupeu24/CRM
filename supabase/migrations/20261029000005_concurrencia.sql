-- Concurrencia (200 registros a la vez) y avisos sin ráfagas:
-- 1) Rotación con turno ordenado (advisory lock) en vez de "skip locked": nunca queda un lead sin asesor por estar todos ocupados y el reparto sigue parejo.
-- 2) El QR de una actividad acepta hasta 300 registros por minuto (antes 60: una feria grande recibía "Demasiados registros seguidos").
-- 3) Los registros del QR avisan al asesor en un resumen agrupado, no un WhatsApp por alumno.

CREATE OR REPLACE FUNCTION public.asignar_asesor_lead(p_lead_id uuid)
 RETURNS asesores
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  -- Turno ordenado: con muchos registros a la vez cada uno espera su turno (milisegundos) y recibe al siguiente asesor.
  -- Antes "skip locked" saltaba a los asesores ocupados y, si lo estaban todos, el lead quedaba sin asesor.
  perform pg_advisory_xact_lock(hashtext('rotacion-asesores'));

  -- Postula a otra sede: no entra a la rotación de Juliaca
  if v_lead.sede ~* '(lima|tarapoto)' then
    return null;
  end if;

  select * into v_asesor
  from public.asesores
  where activo
    and case when v_lead.programa = 'cepre' then 'CEPRE' = any (carreras)
             else v_lead.carrera_interes = any (carreras) end
  order by ultimo_lead_asignado nulls first, created_at, nombre
  limit 1;

  if v_asesor.id is null then
    select * into v_asesor
    from public.asesores
    where activo and carreras = '{}'
    order by ultimo_lead_asignado nulls first, created_at, nombre
    limit 1;
  end if;

  if v_asesor.id is null then
    select * into v_asesor
    from public.asesores
    where activo
    order by ultimo_lead_asignado nulls first, created_at, nombre
    limit 1;
  end if;

  if v_asesor.id is null then
    raise exception 'No hay asesores activos para asignar leads';
  end if;

  perform set_config('crm.asignacion_sistema', 'on', true);
  -- clock_timestamp(): avanza dentro de la transacción (en una importación now() es siempre el mismo y la rotación se trababa en un asesor)
  update public.asesores set ultimo_lead_asignado = clock_timestamp() where id = v_asesor.id;
  update public.leads set asesor_id = v_asesor.id, estado = 'lead_asignado' where id = p_lead_id;

  return v_asesor;
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
  -- Solo en horario de atención (fuera de él nadie puede responder: no se rota)
  if p_solo_horario and not public.en_horario_atencion() then
    return v_cambios;
  end if;

  perform set_config('crm.asignacion_sistema', 'on', true);
  -- El mismo turno que asignar_asesor_lead
  perform pg_advisory_xact_lock(hashtext('rotacion-asesores'));
  perform set_config('crm.motivo_movimiento', 'No contactado en ' || p_horas || ' h hábiles', true);

  for v_lead in
    select * from public.leads
    where estado = 'lead_asignado'
      and eliminado_at is null
      and asesor_id is not null
      and primer_contacto_asesor_at is null
      -- Plazo en horas HÁBILES: un lead del sábado no se quita el lunes a las 8:00
      and public.horas_habiles(fecha_asignado, now()) >= p_horas
      and reasignaciones < p_maximo
      -- Postula a otra sede: no se pasa a otro asesor de Juliaca
      and coalesce(sede, '') !~* '(lima|tarapoto)'
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
    limit 1;

    if v_nuevo.id is null then
      select * into v_nuevo from public.asesores
      where activo and id <> v_lead.asesor_id and carreras = '{}'
      order by ultimo_lead_asignado nulls first, created_at, nombre
      limit 1;
    end if;

    continue when v_nuevo.id is null;   -- no hay a quién pasarlo

    -- clock_timestamp(): avanza dentro de la tanda, así el siguiente lead va al siguiente asesor
    update public.asesores set ultimo_lead_asignado = clock_timestamp() where id = v_nuevo.id;
    update public.leads
    set asesor_id = v_nuevo.id,
        fecha_asignado = now(),
        reasignaciones = reasignaciones + 1,
        notificacion_estado = 'pendiente'
    where id = v_lead.id;

    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'sistema',
            format('Reasignado automáticamente de %s a %s: no fue contactado en %s h hábiles', v_anterior.nombre, v_nuevo.nombre, p_horas));

    v_cambios := v_cambios || jsonb_build_object(
      'lead_id', v_lead.id, 'asesor_anterior', v_anterior.nombre,
      'asesor_nuevo', v_nuevo.nombre, 'asesor_telefono', v_nuevo.telefono);
  end loop;

  return v_cambios;
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_lead_actividad(p_codigo text, p_nombre text, p_telefono text, p_dni text DEFAULT NULL::text, p_colegio text DEFAULT NULL::text, p_grado text DEFAULT NULL::text, p_carrera text DEFAULT NULL::text, p_ubigeo text DEFAULT NULL::text, p_respuestas jsonb DEFAULT NULL::jsonb, p_sede text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_act        public.actividades;
  v_tel        text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_dni        text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_nombre     text := nullif(regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_carrera    text := nullif(left(trim(coalesce(p_carrera, '')), 150), '');
  v_sede       text := case lower(trim(coalesce(p_sede, ''))) when 'juliaca' then 'Juliaca' when 'lima' then 'Lima' when 'tarapoto' then 'Tarapoto' end;
  -- Postula a otra sede: solo datos básicos y la carrera escrita (lo demás no se pide)
  v_otra_sede  boolean := coalesce(v_sede in ('Lima', 'Tarapoto'), false);
  v_colegio    text := nullif(left(trim(coalesce(p_colegio, '')), 120), '');
  v_grado      text := nullif(left(trim(coalesce(p_grado, '')), 40), '');
  v_ubigeo     text := (select codigo from public.ubigeos where codigo = trim(coalesce(p_ubigeo, '')));
  v_cepre      boolean;
  v_campos     jsonb;
  v_pregunta   jsonb;
  v_valor      jsonb;
  v_texto      text;
  v_lista      jsonb := '[]'::jsonb;
  v_asesor     uuid;
  v_res        jsonb;
  v_lead       uuid;
  v_restaurado boolean;
begin
  select * into v_act from public.actividades where codigo = lower(trim(p_codigo));
  if not found or not v_act.activa then
    raise exception 'Este formulario ya no está disponible';
  end if;
  v_campos := coalesce(v_act.formulario->'campos', '{}'::jsonb);

  if v_nombre is null or length(v_nombre) < 3 or length(v_nombre) > 120 then
    raise exception 'Escribe tu nombre completo';
  end if;
  -- Campos que la actividad no pide: se ignoran
  if v_campos->>'dni' = 'oculto' then v_dni := null; end if;
  if v_campos->>'carrera' = 'oculto' then v_carrera := null; end if;
  if v_campos->>'colegio' = 'oculto' then v_colegio := null; end if;
  if v_campos->>'grado' = 'oculto' then v_grado := null; end if;
  if v_campos->>'procedencia' = 'oculto' then v_ubigeo := null; end if;
  if v_otra_sede then
    v_colegio := null; v_grado := null; v_ubigeo := null;
    if v_carrera is null then raise exception 'Escribe la carrera a la que postulas'; end if;
  end if;
  if v_carrera is not null and v_carrera ~* '^(aun|aún) no' then v_carrera := null; end if;
  -- DNI: si viene, es el identificador; si no, lo es el celular
  if v_dni is not null and v_dni !~ '^[0-9]{8}$' then
    raise exception '%', case when v_campos->>'dni' = 'obligatorio' then 'El DNI debe tener 8 dígitos' else 'El DNI debe tener 8 dígitos (o déjalo vacío)' end;
  end if;
  if v_campos->>'dni' = 'obligatorio' and v_dni is null then raise exception 'Escribe tu DNI (8 dígitos)'; end if;
  if v_campos->>'carrera' = 'obligatorio' and v_carrera is null then raise exception 'Elige la carrera que te interesa'; end if;
  if v_campos->>'grado' = 'obligatorio' and v_grado is null and not v_otra_sede then raise exception 'Elige tu grado'; end if;
  if v_campos->>'colegio' = 'obligatorio' and v_colegio is null and not v_otra_sede then raise exception 'Escribe el nombre de tu colegio'; end if;
  if v_campos->>'procedencia' = 'obligatorio' and v_ubigeo is null and not v_otra_sede then raise exception 'Elige de dónde eres (tu distrito o provincia)'; end if;
  if v_tel ~ '^9[0-9]{8}$' then v_tel := '51' || v_tel; end if;
  if v_tel !~ '^[0-9]{10,15}$' then
    raise exception 'Revisa tu número de celular';
  end if;

  -- Preguntas propias de la actividad (a quien postula a otra sede no se le hacen)
  for v_pregunta in select * from jsonb_array_elements(case when v_otra_sede then '[]'::jsonb else coalesce(v_act.formulario->'preguntas', '[]'::jsonb) end) loop
    v_valor := coalesce(p_respuestas, '{}'::jsonb)->(v_pregunta->>'id');
    if jsonb_typeof(v_valor) = 'array' then
      -- Varias opciones: solo las que existen en la pregunta
      select string_agg(o, ', ' order by ord) into v_texto
      from jsonb_array_elements_text(v_valor) with ordinality x(o, n)
      join jsonb_array_elements_text(coalesce(v_pregunta->'opciones', '[]'::jsonb)) with ordinality y(op, ord) on y.op = x.o;
    else
      v_texto := nullif(left(trim(coalesce(v_valor #>> '{}', '')), 500), '');
      if v_texto is not null and v_pregunta->>'tipo' in ('opcion', 'si_no')
         and not (case when v_pregunta->>'tipo' = 'si_no' then v_texto in ('Sí', 'No')
                       else coalesce(v_pregunta->'opciones', '[]'::jsonb) ? v_texto end) then
        v_texto := null;
      end if;
    end if;
    if coalesce((v_pregunta->>'obligatoria')::boolean, false) and v_texto is null then
      raise exception 'Responde: %', v_pregunta->>'texto';
    end if;
    if v_texto is not null then
      v_lista := v_lista || jsonb_build_array(jsonb_build_object('id', v_pregunta->>'id', 'pregunta', v_pregunta->>'texto', 'respuesta', v_texto));
    end if;
  end loop;

  if (select count(*) from public.leads where actividad_id = v_act.id and ultimo_registro_at > now() - interval '1 minute') >= 300 then
    raise exception 'Demasiados registros seguidos. Intenta en un minuto.';
  end if;
  v_cepre := coalesce(v_carrera, '') ~* 'cepre';

  -- Otra sede: no se entrega a los asesores (ni al responsable de la actividad)
  if v_act.asignacion = 'responsable' and not v_otra_sede then
    select id into v_asesor from public.asesores
    where id = v_act.responsable_id and activo and eliminado_at is null;
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
                        || case when v_otra_sede then ' · Postula a la sede ' || v_sede else '' end
                        || coalesce(' · ' || v_colegio, '')
                        || coalesce(' · ' || v_grado, ''), 300),
    p_origen    => 'actividad',
    p_asesor_id => v_asesor,
    p_asignar   => not v_otra_sede,
    p_notificar => false
  );
  v_lead := (v_res->>'lead_id')::uuid;
  select eliminado_at is not null into v_restaurado from public.leads where id = v_lead;

  update public.leads
  set actividad_id    = v_act.id,
      colegio         = coalesce(v_colegio, colegio),
      grado           = coalesce(v_grado, grado),
      ubigeo          = coalesce(v_ubigeo, ubigeo),
      procedencia_por = case when v_ubigeo is not null then 'alumno' else procedencia_por end,
      sede            = coalesce(v_sede, sede),
      origen_campana  = coalesce(origen_campana, 'Feria / colegio'),
      eliminado_at    = null,
      eliminado_por   = null
  where id = v_lead;

  if jsonb_array_length(v_lista) > 0 then
    insert into public.actividad_respuestas (actividad_id, lead_id, respuestas)
    values (v_act.id, v_lead, v_lista)
    on conflict (actividad_id, lead_id) do update set respuestas = excluded.respuestas, updated_at = now();
  end if;

  if v_restaurado then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead, 'sistema', 'Restaurado de la papelera: volvió a registrarse con un QR');
  end if;
  -- Las respuestas quedan a la vista del asesor en la conversación
  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead, 'sistema', 'Se registró con el QR de "' || v_act.nombre || '"'
          || coalesce(' (' || v_colegio || ')', '')
          || case when v_otra_sede then E'\n• Sede a la que postula: ' || v_sede || coalesce(E'\n• Carrera: ' || v_carrera, '') else '' end
          || coalesce((select E'\n' || string_agg('• ' || (r->>'pregunta') || ': ' || (r->>'respuesta'), E'\n')
                       from jsonb_array_elements(v_lista) r), ''));

  -- Al asesor se le avisa en un resumen (enviar_avisos_pendientes agrupa por asesor cada pocos minutos):
  -- en una feria con 200 alumnos ya no salen 200 WhatsApp seguidos. Al alumno no se le escribe (él inicia el chat)
  if exists (select 1 from public.leads where id = v_lead and asesor_id is not null) then
    insert into public.avisos_pendientes (lead_id, actividad) values (v_lead, v_act.nombre)
    on conflict on constraint avisos_pendientes_pkey do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'actividad', v_act.nombre,
    'whatsapp', (select valor from public.ajustes where clave = 'whatsapp_genesys'),
    -- Referencia corta para el mensaje de WhatsApp: une el chat aunque llegue sin número (@lid)
    'ref', left(v_lead::text, 6)
  );
end $function$;
