-- =====================================================================
--  QR del asesor con formulario: quien lo escanea llena sus datos (nombre,
--  celular, DNI, carrera, colegio, grado) y queda como lead de ese asesor.
--  Luego la pantalla abre WhatsApp con un mensaje listo ("Acabo de enviar mis
--  datos… (Ref. xxxxxx)") para que el interesado escriba primero.
--  - registrar_lead_asesor(codigo, …): lo usa el formulario público /w/<codigo>.
--  - registrar_lead: la referencia del mensaje también une a estos leads.
-- =====================================================================

create or replace function public.registrar_lead_asesor(
  p_codigo text, p_nombre text, p_telefono text,
  p_dni text default null, p_colegio text default null, p_grado text default null, p_carrera text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
    p_consulta  => left('Registro presencial con ' || v_asesor.nombre
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
      origen_campana = coalesce(origen_campana, 'Presencial (QR del asesor)'),
      registrado_por = case when v_suyo then v_asesor.id else registrado_por end,
      -- Lo está atendiendo en persona: ya contactado
      estado         = case when v_suyo and estado in ('lead_nuevo', 'lead_en_conversacion', 'lead_interesado', 'lead_no_interesado', 'lead_perdido', 'lead_asignado')
                            then 'lead_contactado'::public.lead_estado else estado end,
      eliminado_at   = null,
      eliminado_por  = null
  where id = v_lead;

  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead, 'sistema', 'Llenó el formulario del QR de ' || v_asesor.nombre || ' (atención presencial)'
          || case when v_suyo then '' else ': ya era lead de otro asesor, no se cambió' end);

  if v_suyo then
    perform public.llamar_genesys('notificar', jsonb_build_object(
      'lead_ids', jsonb_build_array(v_lead),
      'asignado_por', 'tu QR · formulario presencial'
    ));
  end if;

  return jsonb_build_object(
    'ok', true,
    'asesor', array_to_string((regexp_split_to_array(trim(v_asesor.nombre), '\s+'))[1:2], ' '),
    'whatsapp', (select valor from public.ajustes where clave = 'whatsapp_genesys'),
    'ref', left(v_lead::text, 6)
  );
end $$;
revoke execute on function public.registrar_lead_asesor(text, text, text, text, text, text, text) from public;
grant execute on function public.registrar_lead_asesor(text, text, text, text, text, text, text) to anon, authenticated;

-- La referencia del mensaje une también a los leads del formulario del asesor
CREATE OR REPLACE FUNCTION public.registrar_lead(p_telefono text, p_mensaje text DEFAULT NULL::text, p_es_lid boolean DEFAULT false)
 RETURNS leads
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lead      public.leads;
  v_otro      public.leads;
  v_ref       text;
  v_dni       text;
  v_repetido  boolean := false;
begin
  select * into v_lead from public.leads where telefono = p_telefono for update;
  if v_lead.id is null then
    select l.* into v_lead from public.lead_alias a join public.leads l on l.id = a.lead_id
    where a.alias = p_telefono for update of l;
  end if;

  -- Número o LID desconocido (o un LID que solo tiene un lead sin datos):
  -- ¿el mensaje trae la referencia del QR o un DNI conocido?
  if p_mensaje is not null and (v_lead.id is null or (p_es_lid and v_lead.nombre is null and v_lead.dni is null)) then
    v_ref := lower(substring(p_mensaje from '(?i)ref\.?\s*([0-9a-f]{6})'));
    if v_ref is not null then
      select * into v_otro from public.leads
      where id::text like v_ref || '%' and (actividad_id is not null or origen_campana = 'Presencial (QR del asesor)')
        and coalesce(ultimo_registro_at, created_at) > now() - interval '60 days'
      order by coalesce(ultimo_registro_at, created_at) desc limit 1 for update;
    end if;
    if v_otro.id is null then
      v_dni := substring(p_mensaje from '(?i)dni\D{0,4}(\d{8})');
      if v_dni is not null then
        select * into v_otro from public.leads where dni = v_dni for update;
      end if;
    end if;
    if v_otro.id = v_lead.id then
      v_otro := null;
    end if;

    -- El lead sin datos de ese LID se une al registrado: pasa su conversación y se borra
    if v_otro.id is not null and v_lead.id is not null then
      update public.lead_interacciones set lead_id = v_otro.id where lead_id = v_lead.id;
      delete from public.leads where id = v_lead.id;
      v_lead := null;
    end if;

    if v_otro.id is not null then
      if p_es_lid then
        -- El LID no es un celular: se guarda como alias y el lead conserva su número real
        insert into public.lead_alias (alias, lead_id) values (p_telefono, v_otro.id) on conflict (alias) do nothing;
        insert into public.lead_interacciones (lead_id, tipo, contenido)
        values (v_otro.id, 'sistema', 'Escribió por WhatsApp con un contacto privado (sin número): se unió a su registro');
        update public.leads set eliminado_at = null, eliminado_por = null where id = v_otro.id;
        select * into v_lead from public.leads where id = v_otro.id;
      elsif v_otro.ultimo_mensaje_lead_at is null or v_otro.ultimo_mensaje_lead_at < now() - interval '30 days' then
        -- Otro celular real y el anterior no conversa: el lead pasa a este celular
        update public.leads set telefono = p_telefono, eliminado_at = null, eliminado_por = null where id = v_otro.id;
        insert into public.lead_interacciones (lead_id, tipo, contenido)
        values (v_otro.id, 'sistema', 'Escribió desde ' || p_telefono || ': se actualizó el celular (antes ' || v_otro.telefono || ')');
        select * into v_lead from public.leads where id = v_otro.id;
      end if;
    end if;
  end if;

  if v_lead.id is not null and p_mensaje is not null then
    select exists (
      select 1 from public.lead_interacciones
      where lead_id = v_lead.id and tipo = 'mensaje_lead' and contenido = p_mensaje
        and created_at > now() - interval '1 minute'
    ) into v_repetido;
  end if;
  if v_repetido then
    return v_lead;
  end if;

  if v_lead.id is not null then
    update public.leads
    set ultimo_contacto = now(), total_mensajes = total_mensajes + 1
    where id = v_lead.id
    returning * into v_lead;
  else
    insert into public.leads (telefono, total_mensajes)
    values (p_telefono, 1)
    on conflict (telefono) do update
      set ultimo_contacto = now(),
          total_mensajes  = public.leads.total_mensajes + 1
    returning * into v_lead;
  end if;

  if p_mensaje is not null then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'mensaje_lead', p_mensaje);
  end if;

  return v_lead;
end $function$;
