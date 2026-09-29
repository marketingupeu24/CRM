-- =====================================================================
--  Migración 5: adaptación al sistema actual de admisión (Apps Script)
--  - DNI único (además del teléfono) para no duplicar leads.
--  - Convocatoria (2026-1, 2026-2), programa (pregrado / CePre) y fuente.
--  - Seguimiento de la notificación al asesor y de los recordatorios.
--  - Reparto: especialistas de la carrera/programa -> asesores generales -> cualquiera.
--  - procesar_lead: una sola función para bot, Google Form, formulario web y registro manual.
-- =====================================================================

-- Eventos del sistema en el historial (duplicados, notificaciones, etc.)
alter type public.interaccion_tipo add value if not exists 'sistema';

-- ---------------------------------------------------------------------
-- 1. Nuevas columnas del lead
-- ---------------------------------------------------------------------
alter table public.leads
  add column dni                   text,
  add column convocatoria          text,                         -- "2026-1", "2026-2"
  add column programa              text not null default 'pregrado',
  add column notificacion_estado   text,                         -- null = aún no aplica
  add column notificacion_intentos int not null default 0,
  add column fecha_notificacion    timestamptz,
  add column notificacion_error    text,
  add column duplicados_ignorados  int not null default 0,       -- reintentos / registros repetidos
  add column recordatorio_enviado  timestamptz;

alter table public.leads
  add constraint leads_dni_formato check (dni is null or dni ~ '^[0-9]{8,12}$'),
  add constraint leads_programa_valido check (programa in ('pregrado', 'cepre')),
  add constraint leads_origen_valido check (origen in ('whatsapp_genesys', 'manual', 'google_form', 'web')),
  add constraint leads_notificacion_valida check (
    notificacion_estado is null or notificacion_estado in ('pendiente', 'notificado', 'error', 'omitida')
  );

create unique index leads_dni_unico on public.leads (dni) where dni is not null;
create index idx_leads_convocatoria on public.leads (convocatoria);

comment on column public.asesores.carreras is
  'Carreras que atiende en exclusiva (usar ''CEPRE'' para CePre). Vacío = asesor general: entra en la rotación de todo lo demás.';

-- ---------------------------------------------------------------------
-- 2. Solo el sistema (no un asesor desde el panel) puede asignar leads.
--    procesar_lead activa esta marca durante su transacción.
-- ---------------------------------------------------------------------
create or replace function public.fn_leads_before_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null
     and not public.es_admin()
     and coalesce(current_setting('crm.asignacion_sistema', true), '') <> 'on'
     and new.asesor_id is distinct from old.asesor_id then
    raise exception 'Solo un administrador puede reasignar leads';
  end if;

  new.updated_at := now();

  if new.estado is distinct from old.estado then
    if new.estado = 'lead_interesado' and new.fecha_interesado is null then
      new.fecha_interesado := now();
    end if;
    if new.estado = 'lead_asignado' and new.fecha_asignado is null then
      new.fecha_asignado := now();
    end if;
  end if;

  if new.asesor_id is not null and new.fecha_asignado is null then
    new.fecha_asignado := now();
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Reparto por turnos en 3 niveles
--    1) especialistas: CePre -> asesores con 'CEPRE'; pregrado -> asesores con esa carrera
--    2) asesores generales (carreras vacío)
--    3) cualquier asesor activo
-- ---------------------------------------------------------------------
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
  update public.asesores set ultimo_lead_asignado = now() where id = v_asesor.id;
  update public.leads set asesor_id = v_asesor.id, estado = 'lead_asignado' where id = p_lead_id;

  return v_asesor;
end $$;

-- ---------------------------------------------------------------------
-- 4. procesar_lead: registra un lead con sus datos (bot, formulario, web o manual)
--    - Busca por DNI y luego por teléfono: nunca crea duplicados.
--    - Idempotente: si el lead ya fue procesado, responde 'duplicate' sin reasignar
--      ni volver a notificar (cubre los reintentos de BuilderBot).
--    - p_asesor_id: asesor fijo (modo sombra / formulario web / registro manual).
--    - p_asignar: si no hay asesor fijo, asignar por turnos.
--    - p_notificar: el que llama enviará el WhatsApp al asesor (queda 'pendiente').
-- ---------------------------------------------------------------------
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
  v_lead      public.leads;
  v_asesor    public.asesores;
  v_por_dni   boolean := false;
  v_notificar boolean := false;
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

  -- ------------------------------------------------------------------
  -- Duplicado: el lead ya fue procesado antes (o su DNI llegó desde otro número)
  -- ------------------------------------------------------------------
  if v_lead.id is not null
     and (v_lead.fecha_interesado is not null
          or v_lead.asesor_id is not null
          or (v_por_dni and v_lead.telefono is distinct from p_telefono)) then

    update public.leads
    set duplicados_ignorados = duplicados_ignorados + 1,
        ultimo_contacto      = now(),
        convocatoria         = coalesce(p_convocatoria, convocatoria),
        dni                  = coalesce(dni, p_dni),
        nombre               = coalesce(nombre, p_nombre)
    where id = v_lead.id
    returning * into v_lead;

    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'sistema',
            'Registro repetido ignorado (' || p_origen || ')'
            || case when v_lead.telefono is distinct from p_telefono and p_telefono is not null
                    then '. Llegó desde otro número: ' || p_telefono else '' end);

    select * into v_asesor from public.asesores where id = v_lead.asesor_id;
    return jsonb_build_object(
      'status', 'duplicate', 'lead_id', v_lead.id, 'estado', v_lead.estado,
      'asesor_id', v_asesor.id, 'asesor_nombre', v_asesor.nombre, 'asesor_telefono', v_asesor.telefono,
      'notificar', false
    );
  end if;

  -- ------------------------------------------------------------------
  -- Nuevo lead, o lead que ya escribió al bot y ahora deja sus datos
  -- ------------------------------------------------------------------
  if v_lead.id is null then
    insert into public.leads (telefono, dni, nombre, carrera_interes, modalidad, programa,
                              convocatoria, resumen, origen, estado, fecha_interesado, total_mensajes)
    values (coalesce(p_telefono, 'sin-telefono-' || p_dni), p_dni, p_nombre, p_carrera, p_modalidad,
            p_programa, p_convocatoria, p_consulta, p_origen, 'lead_interesado', now(), 0)
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
        motivo_no_interes = null
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
      -- Sin asesores activos: queda como lead_interesado para asignarlo desde el panel
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

-- ---------------------------------------------------------------------
-- 5. Resultado del envío de WhatsApp al asesor
-- ---------------------------------------------------------------------
create or replace function public.marcar_notificacion(p_lead_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql set search_path = ''
as $$
begin
  update public.leads
  set notificacion_estado   = case when p_ok then 'notificado' else 'error' end,
      notificacion_intentos = notificacion_intentos + 1,
      fecha_notificacion    = now(),
      notificacion_error    = case when p_ok then null else left(p_error, 500) end
  where id = p_lead_id;

  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (p_lead_id, 'sistema',
          case when p_ok then 'Asesor notificado por WhatsApp'
               else 'Error notificando al asesor: ' || coalesce(left(p_error, 300), 'desconocido') end);
end $$;

-- ---------------------------------------------------------------------
-- 6. Registro manual desde el panel (reemplaza la hoja REGISTRO)
--    - El asesor registra leads para sí mismo.
--    - El admin elige el asesor (o null = por turnos).
--    - No se notifica por WhatsApp (el que registra ya conoce al lead).
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

  if v_res->>'status' = 'success' and nullif(trim(p_observacion), '') is not null then
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

-- ---------------------------------------------------------------------
-- 7. Permisos
-- ---------------------------------------------------------------------
revoke execute on function public.procesar_lead(text, text, text, text, text, text, text, text, text, uuid, boolean, boolean)
  from public, anon, authenticated;
revoke execute on function public.marcar_notificacion(uuid, boolean, text) from public, anon, authenticated;
grant  execute on function public.procesar_lead(text, text, text, text, text, text, text, text, text, uuid, boolean, boolean)
  to service_role;
grant  execute on function public.marcar_notificacion(uuid, boolean, text) to service_role;

revoke execute on function public.registrar_lead_manual(text, text, text, text, text, text, text, text, uuid) from public, anon;
grant  execute on function public.registrar_lead_manual(text, text, text, text, text, text, text, text, uuid) to authenticated;
