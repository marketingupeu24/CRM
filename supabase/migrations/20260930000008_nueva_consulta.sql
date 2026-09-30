-- =====================================================================
--  Migración 11: el lead que vuelve a consultar ya no se ignora
--  - Reintento de BuilderBot (mismo lead en < 2 min): se ignora como antes.
--  - Nueva consulta: se reemplazan los datos con la información nueva (la anterior
--    queda en el historial), se actualiza la fecha, queda "sin responder" y se avisa
--    a su asesor. Se mantiene el asesor, salvo que no tenga, esté inactivo o el
--    lead cambie de programa (pregrado <-> CePre): entonces se asigna por turnos.
--  - Si estaba perdido, no interesado o atendido, vuelve a asignado.
-- =====================================================================

alter table public.leads
  add column ultimo_registro_at timestamptz,          -- último webhook procesado (detecta reintentos)
  add column reconsultas        int not null default 0;

update public.leads set ultimo_registro_at = coalesce(fecha_interesado, created_at) where fecha_interesado is not null;

create or replace function public.procesar_lead(
  p_telefono     text    default null,
  p_dni          text    default null,
  p_nombre       text    default null,
  p_carrera      text    default null,
  p_modalidad    text    default null,
  p_programa     text    default 'pregrado',
  p_convocatoria text    default null,
  p_consulta     text    default null,
  p_origen       text    default 'whatsapp_genesys',
  p_asesor_id    uuid    default null,
  p_asignar      boolean default true,
  p_notificar    boolean default false
)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_lead          public.leads;
  v_asesor        public.asesores;
  v_por_dni       boolean := false;
  v_otro_numero   boolean := false;
  v_notificar     boolean := false;
  v_reasignar     boolean := false;
  v_dni_libre     boolean;
  v_texto         text;
begin
  if p_telefono is null and p_dni is null then
    raise exception 'Se necesita teléfono o DNI';
  end if;

  -- Serializa los registros de la misma persona (reintentos simultáneos)
  if p_dni is not null then
    perform pg_advisory_xact_lock(hashtext('lead-dni:' || p_dni));
  end if;
  if p_telefono is not null then
    perform pg_advisory_xact_lock(hashtext('lead-tel:' || p_telefono));
  end if;

  if p_dni is not null then
    select * into v_lead from public.leads where dni = p_dni for update;
    v_por_dni := found;
  end if;
  if v_lead.id is null and p_telefono is not null then
    select * into v_lead from public.leads where telefono = p_telefono for update;
  end if;
  v_otro_numero := v_por_dni and p_telefono is not null and v_lead.telefono is distinct from p_telefono;

  -- ==================================================================
  -- Lead que ya fue procesado antes
  -- ==================================================================
  if v_lead.id is not null
     and (v_lead.fecha_interesado is not null or v_lead.asesor_id is not null or v_otro_numero) then

    -- 1) Reintento de BuilderBot: mismo lead en menos de 2 minutos -> se ignora
    if v_lead.ultimo_registro_at is not null and v_lead.ultimo_registro_at > now() - interval '2 minutes' then
      update public.leads set duplicados_ignorados = duplicados_ignorados + 1 where id = v_lead.id;
      select * into v_asesor from public.asesores where id = v_lead.asesor_id;
      return jsonb_build_object(
        'status', 'duplicate', 'lead_id', v_lead.id, 'estado', v_lead.estado,
        'asesor_id', v_asesor.id, 'asesor_nombre', v_asesor.nombre, 'asesor_telefono', v_asesor.telefono,
        'notificar', false
      );
    end if;

    -- 2) Nueva consulta: los datos nuevos reemplazan a los anteriores
    v_dni_libre := p_dni is null or v_por_dni
                   or not exists (select 1 from public.leads where dni = p_dni and id <> v_lead.id);

    v_texto := 'Nueva consulta' || coalesce(': ' || coalesce(p_consulta, p_carrera, p_modalidad), '');

    update public.leads
    set nombre            = coalesce(p_nombre, nombre),
        dni               = case when v_dni_libre then coalesce(p_dni, dni) else dni end,
        carrera_interes   = case when p_carrera is not null or p_modalidad is not null then p_carrera else carrera_interes end,
        modalidad         = case when p_carrera is not null or p_modalidad is not null then p_modalidad else modalidad end,
        programa          = case when p_carrera is not null or p_modalidad is not null then coalesce(p_programa, programa) else programa end,
        convocatoria      = coalesce(p_convocatoria, convocatoria),
        resumen           = coalesce(p_consulta, resumen),
        origen            = p_origen,
        reconsultas       = reconsultas + 1,
        ultimo_registro_at     = now(),
        ultimo_contacto        = now(),
        ultimo_mensaje_lead_at = now(),
        ultimo_mensaje_at      = now(),
        ultimo_mensaje_texto   = left(v_texto, 160),
        motivo_no_interes = null
    where id = v_lead.id
    returning * into v_lead;

    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'sistema',
            v_texto || ' (' || p_origen || ')'
            || case when v_otro_numero then '. Llegó desde otro número: ' || p_telefono else '' end);

    -- Asesor: se mantiene, salvo que haya uno fijo, no tenga, esté inactivo o cambie de programa
    select * into v_asesor from public.asesores where id = v_lead.asesor_id;
    v_reasignar := p_asesor_id is null and p_asignar and (
      v_asesor.id is null
      or not v_asesor.activo
      or (v_lead.programa = 'cepre') is distinct from ('CEPRE' = any (v_asesor.carreras))
    );

    perform set_config('crm.asignacion_sistema', 'on', true);

    if p_asesor_id is not null and p_asesor_id is distinct from v_lead.asesor_id then
      select * into v_asesor from public.asesores where id = p_asesor_id;
      update public.leads set asesor_id = p_asesor_id where id = v_lead.id;
      v_reasignar := true;
    elsif v_reasignar then
      update public.leads set asesor_id = null where id = v_lead.id;
      begin
        v_asesor := public.asignar_asesor_lead(v_lead.id);
      exception when others then
        v_asesor := null;
        insert into public.lead_interacciones (lead_id, tipo, contenido)
        values (v_lead.id, 'sistema', 'No se pudo asignar asesor: ' || sqlerrm);
      end;
    end if;

    -- Si su caso estaba cerrado, se reabre para que lo atiendan
    if v_asesor.id is not null and v_lead.estado in ('lead_perdido', 'lead_no_interesado', 'lead_atendido', 'lead_interesado') then
      update public.leads set estado = 'lead_asignado' where id = v_lead.id;
    end if;

    v_notificar := p_notificar and v_asesor.id is not null;
    select * into v_lead from public.leads where id = v_lead.id;

    return jsonb_build_object(
      'status', 'updated', 'lead_id', v_lead.id, 'estado', v_lead.estado,
      'asesor_id', v_asesor.id, 'asesor_nombre', v_asesor.nombre, 'asesor_telefono', v_asesor.telefono,
      'reasignado', v_reasignar, 'notificar', v_notificar
    );
  end if;

  -- ==================================================================
  -- Nuevo lead, o lead que ya escribió al bot y ahora deja sus datos
  -- ==================================================================
  if v_lead.id is null then
    insert into public.leads (telefono, dni, nombre, carrera_interes, modalidad, programa,
                              convocatoria, resumen, origen, estado, fecha_interesado, total_mensajes, ultimo_registro_at)
    values (coalesce(p_telefono, 'sin-telefono-' || p_dni), p_dni, p_nombre, p_carrera, p_modalidad,
            p_programa, p_convocatoria, p_consulta, p_origen, 'lead_interesado', now(), 0, now())
    returning * into v_lead;
  else
    update public.leads
    set dni             = coalesce(p_dni, dni),
        nombre          = coalesce(p_nombre, nombre),
        carrera_interes = coalesce(p_carrera, carrera_interes),
        modalidad       = coalesce(p_modalidad, modalidad),
        programa        = coalesce(p_programa, programa),
        convocatoria    = coalesce(p_convocatoria, convocatoria),
        resumen         = coalesce(p_consulta, resumen),
        estado          = 'lead_interesado',
        motivo_no_interes = null,
        ultimo_registro_at = now()
    where id = v_lead.id
    returning * into v_lead;
  end if;

  -- Asignación
  if p_asesor_id is not null then
    select * into v_asesor from public.asesores where id = p_asesor_id;
    if not found then
      raise exception 'Asesor % no existe', p_asesor_id;
    end if;
    perform set_config('crm.asignacion_sistema', 'on', true);
    update public.asesores set ultimo_lead_asignado = now() where id = v_asesor.id;
    update public.leads set asesor_id = v_asesor.id, estado = 'lead_asignado' where id = v_lead.id;
  elsif p_asignar then
    begin
      v_asesor := public.asignar_asesor_lead(v_lead.id);
    exception when others then
      insert into public.lead_interacciones (lead_id, tipo, contenido)
      values (v_lead.id, 'sistema', 'No se pudo asignar asesor: ' || sqlerrm);
    end;
  end if;

  v_notificar := p_notificar and v_asesor.id is not null;
  update public.leads
  set notificacion_estado = case when v_asesor.id is null then null
                                 when v_notificar then 'pendiente' else 'omitida' end
  where id = v_lead.id
  returning * into v_lead;

  return jsonb_build_object(
    'status', 'success', 'lead_id', v_lead.id, 'estado', v_lead.estado,
    'asesor_id', v_asesor.id, 'asesor_nombre', v_asesor.nombre, 'asesor_telefono', v_asesor.telefono,
    'notificar', v_notificar
  );
end $$;

revoke execute on function public.procesar_lead(text, text, text, text, text, text, text, text, text, uuid, boolean, boolean)
  from public, anon, authenticated;
grant  execute on function public.procesar_lead(text, text, text, text, text, text, text, text, text, uuid, boolean, boolean)
  to service_role;

-- ---------------------------------------------------------------------
-- Registro manual: protege los leads de otros asesores (ahora un lead existente se actualiza)
-- ---------------------------------------------------------------------
create or replace function public.registrar_lead_manual(
  p_nombre       text,
  p_telefono     text    default null,
  p_dni          text default null,
  p_carrera      text default null,
  p_modalidad    text default null,
  p_programa     text default 'pregrado',
  p_convocatoria text default null,
  p_observacion  text default null,
  p_asesor_id    uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo        uuid := public.mi_asesor_id();
  v_asesor_id uuid;
  v_telefono  text := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');
  v_dni       text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_res       jsonb;
begin
  if v_yo is null then
    raise exception 'Solo asesores o administradores pueden registrar leads';
  end if;
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre es obligatorio';
  end if;
  if v_telefono is null then
    raise exception 'El celular es obligatorio';
  end if;
  -- Celular peruano de 9 dígitos -> agrega el código de país
  if v_telefono ~ '^9[0-9]{8}$' then
    v_telefono := '51' || v_telefono;
  end if;

  v_asesor_id := case when public.es_admin() then p_asesor_id else v_yo end;

  -- Un asesor no puede tomar ni modificar un lead que ya es de otro asesor
  if not public.es_admin() and exists (
    select 1 from public.leads
    where (telefono = v_telefono or (v_dni is not null and dni = v_dni))
      and asesor_id is not null and asesor_id <> v_yo
  ) then
    return jsonb_build_object('status', 'duplicate', 'mensaje', 'Este lead ya está registrado con otro asesor');
  end if;

  v_res := public.procesar_lead(
    p_telefono     => v_telefono,
    p_dni          => v_dni,
    p_nombre       => trim(p_nombre),
    p_carrera      => nullif(trim(p_carrera), ''),
    p_modalidad    => nullif(trim(p_modalidad), ''),
    p_programa     => coalesce(p_programa, 'pregrado'),
    p_convocatoria => nullif(trim(p_convocatoria), ''),
    p_origen       => 'manual',
    p_asesor_id    => v_asesor_id,
    p_asignar      => true,
    p_notificar    => false
  );

  if v_res->>'status' in ('success', 'updated') and nullif(trim(p_observacion), '') is not null then
    insert into public.lead_interacciones (lead_id, tipo, contenido, autor_id)
    values ((v_res->>'lead_id')::uuid, 'nota_asesor', trim(p_observacion), v_yo);
  end if;

  -- Si el lead ya existía y es de otro asesor, no se revelan sus datos
  if v_res->>'status' = 'duplicate' and not public.es_admin()
     and (v_res->>'asesor_id') is distinct from v_yo::text then
    return jsonb_build_object('status', 'duplicate', 'mensaje', 'Este lead ya está registrado con otro asesor');
  end if;

  return v_res;
end $$;

