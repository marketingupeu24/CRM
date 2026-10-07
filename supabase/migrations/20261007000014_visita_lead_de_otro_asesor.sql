-- =====================================================================
--  Cliente de un asesor que vuelve y lo atiende otro (el dueño no estaba).
--  Regla: el lead SIGUE siendo de quien inició la conversación, por cualquier
--  camino (QR del asesor, formulario, QR por persona, registro rápido).
--  Lo nuevo: el dueño recibe un WhatsApp ("tu lead vino y lo atendió X") y
--  queda anotado en la ficha.
--  - avisar_visita(lead, atendio, como): nota + aviso (uno cada 30 min por lead).
--  - avisar_visita_registro(celular, dni): desde el registro rápido del panel.
-- =====================================================================

create or replace function public.avisar_visita(p_lead_id uuid, p_atendio uuid, p_como text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead    public.leads;
  v_atendio public.asesores;
  v_dueno   public.asesores;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if v_lead.id is null or v_lead.asesor_id is null or v_lead.asesor_id = p_atendio then return; end if;
  select * into v_atendio from public.asesores where id = p_atendio;
  select * into v_dueno from public.asesores where id = v_lead.asesor_id;
  -- El formulario y luego su mensaje de WhatsApp son la misma visita: un solo aviso
  if exists (select 1 from public.lead_interacciones
             where lead_id = v_lead.id and tipo = 'sistema' and contenido like '🏢 Vino en persona%'
               and created_at > now() - interval '30 minutes') then
    return;
  end if;
  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead.id, 'sistema', '🏢 Vino en persona y lo atendió ' || coalesce(v_atendio.nombre, 'otro asesor')
          || ' (' || p_como || '). Sigue siendo lead de ' || coalesce(v_dueno.nombre, 'su asesor'));
  perform public.llamar_genesys('visita', jsonb_build_object(
    'lead_id', v_lead.id, 'atendio', coalesce(v_atendio.nombre, 'otro asesor'), 'como', p_como
  ));
end $$;
revoke execute on function public.avisar_visita(uuid, uuid, text) from public, anon, authenticated;

-- Registro rápido: el celular o DNI ya es de otro asesor (no se registra de nuevo, pero se avisa)
create or replace function public.avisar_visita_registro(p_telefono text default null, p_dni text default null)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo   uuid := public.mi_asesor_id();
  v_tel  text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_dni  text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_lead public.leads;
begin
  if v_yo is null or not public.tiene_permiso('registrar') then return false; end if;
  if v_tel ~ '^9[0-9]{8}$' then v_tel := '51' || v_tel; end if;
  select * into v_lead from public.leads
  where ((v_dni is not null and dni = v_dni) or (v_tel ~ '^[0-9]{10,15}$' and telefono = v_tel))
    and asesor_id is not null and asesor_id <> v_yo and eliminado_at is null
  limit 1;
  if v_lead.id is null then return false; end if;
  perform public.avisar_visita(v_lead.id, v_yo, 'intentó registrarlo en el CRM');
  return true;
end $$;
revoke execute on function public.avisar_visita_registro(text, text) from public, anon;
grant execute on function public.avisar_visita_registro(text, text) to authenticated;

create or replace function public.asignar_lead_qr_asesor(p_lead_id uuid, p_codigo text)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_lead    public.leads;
  v_asesor  public.asesores;
  v_actual  public.asesores;
begin
  select * into v_asesor from public.asesores where codigo_qr = upper(trim(p_codigo)) and eliminado_at is null;
  if v_asesor.id is null then
    return jsonb_build_object('asignado', false, 'motivo', 'código desconocido');
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then
    return jsonb_build_object('asignado', false, 'motivo', 'lead desconocido');
  end if;

  -- Ya tiene asesor: se respeta (si es otro, queda anotado)
  if v_lead.asesor_id is not null then
    if v_lead.asesor_id <> v_asesor.id then
      perform public.avisar_visita(v_lead.id, v_asesor.id, 'escaneó su QR');
    end if;
    return jsonb_build_object('asignado', false, 'motivo', 'ya tenía asesor', 'asesor_id', v_lead.asesor_id);
  end if;

  perform set_config('crm.asignacion_sistema', 'on', true);
  update public.leads
  set asesor_id      = v_asesor.id,
      registrado_por = v_asesor.id,
      -- El asesor lo está atendiendo en persona: ya está contactado (el bot no interrumpe por 5 h)
      estado         = case when estado in ('lead_nuevo', 'lead_en_conversacion', 'lead_interesado', 'lead_no_interesado', 'lead_perdido', 'lead_asignado')
                            then 'lead_contactado'::public.lead_estado else estado end,
      origen         = 'manual',
      origen_campana = coalesce(origen_campana, 'Presencial (QR del asesor)'),
      eliminado_at   = null,
      eliminado_por  = null
  where id = v_lead.id;
  update public.asesores set ultimo_lead_asignado = now() where id = v_asesor.id;
  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead.id, 'sistema', 'Escaneó el QR personal de ' || v_asesor.nombre || ' (atención presencial): es su lead');

  return jsonb_build_object(
    'asignado', true, 'asesor_id', v_asesor.id, 'asesor_nombre', v_asesor.nombre, 'asesor_telefono', v_asesor.telefono
  );
end $$;

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

  if not v_suyo then
    perform public.avisar_visita(v_lead, v_asesor.id, 'llenó el formulario de su QR');
  end if;

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

create or replace function public.usar_prerregistro(p_lead_id uuid, p_codigo text)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_pre     public.prerregistros;
  v_lead    public.leads;
  v_asesor  public.asesores;
  v_dni     text;
  v_nuevo   boolean;
begin
  select * into v_pre from public.prerregistros
  where codigo = upper(trim(p_codigo)) and created_at > now() - interval '7 days' for update;
  if v_pre.id is null then
    return jsonb_build_object('usado', false, 'motivo', 'código desconocido o vencido');
  end if;
  -- Ya se usó con este mismo lead (reintento del mensaje): nada que hacer
  if v_pre.usado_at is not null and v_pre.lead_id = p_lead_id then
    return jsonb_build_object('usado', false, 'motivo', 'ya registrado');
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then
    return jsonb_build_object('usado', false, 'motivo', 'lead desconocido');
  end if;
  select * into v_asesor from public.asesores where id = v_pre.asesor_id;

  -- DNI: solo si nadie más lo tiene
  v_dni := case when v_pre.dni is not null
                 and not exists (select 1 from public.leads where dni = v_pre.dni and id <> v_lead.id)
            then v_pre.dni end;
  v_nuevo := v_lead.asesor_id is null;

  perform set_config('crm.asignacion_sistema', 'on', true);
  update public.leads
  set nombre          = v_pre.nombre,
      dni             = coalesce(v_dni, dni),
      carrera_interes = coalesce(v_pre.carrera, carrera_interes),
      programa        = case when coalesce(v_pre.carrera, '') ~* 'cepre' then 'cepre' else programa end,
      colegio         = coalesce(v_pre.colegio, colegio),
      grado           = coalesce(v_pre.grado, grado),
      -- Si ya era de otro asesor, se respeta; si no, es del asesor que lo atendió
      asesor_id       = coalesce(asesor_id, v_asesor.id),
      registrado_por  = case when asesor_id is null then v_asesor.id else registrado_por end,
      estado          = case when asesor_id is null
                              and estado in ('lead_nuevo', 'lead_en_conversacion', 'lead_interesado', 'lead_no_interesado', 'lead_perdido', 'lead_asignado')
                             then 'lead_contactado'::public.lead_estado else estado end,
      origen          = case when asesor_id is null then 'manual' else origen end,
      origen_campana  = coalesce(origen_campana, 'Presencial (QR del asesor)'),
      eliminado_at    = null,
      eliminado_por   = null
  where id = v_lead.id;
  if v_nuevo then
    update public.asesores set ultimo_lead_asignado = now() where id = v_asesor.id;
  end if;
  if not v_nuevo and v_lead.asesor_id <> v_asesor.id then
    perform public.avisar_visita(v_lead.id, v_asesor.id, 'le hizo su registro presencial');
  end if;
  update public.prerregistros set usado_at = now(), lead_id = v_lead.id where id = v_pre.id;

  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead.id, 'sistema',
          'Registro presencial con ' || v_asesor.nombre || ': ' || v_pre.nombre
          || coalesce(' · ' || v_pre.carrera, '')
          || case when v_pre.dni is not null and v_dni is null then ' (el DNI ' || v_pre.dni || ' ya lo tiene otro lead)' else '' end
          || case when not v_nuevo and v_lead.asesor_id <> v_asesor.id then ' — ya era lead de otro asesor: no se cambió' else '' end);

  return jsonb_build_object(
    'usado', true, 'asignado', v_nuevo, 'asesor_nombre', v_asesor.nombre, 'asesor_telefono', v_asesor.telefono,
    'persona', v_pre.nombre
  );
end $$;
