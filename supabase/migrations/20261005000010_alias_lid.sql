-- =====================================================================
--  Contactos que WhatsApp entrega con un identificador de privacidad (@lid)
--  en lugar del número. Así su chat no se separa del lead que ya existe:
--  - lead_alias: otros identificadores (LID u otro celular) de un mismo lead.
--  - El mensaje del formulario del QR lleva "Ref. XXXXXX" (inicio del id del
--    lead): si llega de un número o LID desconocido, se une a ese lead.
--  - registrar_lead(p_telefono, p_mensaje, p_es_lid): busca por celular, por
--    alias, por la referencia del QR y por el DNI del mensaje. Un LID nunca
--    reemplaza el celular real del lead: se guarda como alias. Si el LID ya
--    tenía un lead sin datos, su conversación pasa al lead registrado.
-- =====================================================================

create table if not exists public.lead_alias (
  alias      text primary key,
  lead_id    uuid not null references public.leads (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists lead_alias_lead_idx on public.lead_alias (lead_id);

alter table public.lead_alias enable row level security;
revoke all on public.lead_alias from anon;
grant select on public.lead_alias to authenticated;
create policy "alias: de los leads visibles"
on public.lead_alias for select to authenticated
using (exists (select 1 from public.leads l where l.id = lead_id));

drop function if exists public.registrar_lead(text, text);

create or replace function public.registrar_lead(p_telefono text, p_mensaje text default null, p_es_lid boolean default false)
returns public.leads
language plpgsql set search_path = ''
as $$
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
      where id::text like v_ref || '%' and actividad_id is not null
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
end $$;

revoke execute on function public.registrar_lead(text, text, boolean) from public, anon, authenticated;
grant  execute on function public.registrar_lead(text, text, boolean) to service_role;

-- Lead de un número o alias (para guardar las respuestas del bot en la conversación correcta)
create or replace function public.lead_de_contacto(p_contacto text)
returns uuid
language sql stable set search_path = ''
as $$
  select coalesce(
    (select id from public.leads where telefono = p_contacto),
    (select lead_id from public.lead_alias where alias = p_contacto)
  )
$$;
revoke execute on function public.lead_de_contacto(text) from public, anon, authenticated;
grant  execute on function public.lead_de_contacto(text) to service_role;

-- El registro por QR devuelve la referencia que va en el mensaje de WhatsApp
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
    'whatsapp', (select valor from public.ajustes where clave = 'whatsapp_genesys'),
    -- Referencia corta para el mensaje de WhatsApp: une el chat aunque llegue sin número (@lid)
    'ref', left(v_lead::text, 6)
  );
end $$;

revoke execute on function public.registrar_lead_actividad(text, text, text, text, text, text, text) from public;
grant execute on function public.registrar_lead_actividad(text, text, text, text, text, text, text) to anon, authenticated;

-- Regla del QR: el mensaje ahora termina con "(Ref. xxxxxx)" (uso interno del CRM)
update public.conocimiento
set contenido = contenido || E'\n- El "(Ref. …)" del final es un código interno del sistema: no lo menciones ni lo comentes.'
where titulo = 'Alumnos que vienen del QR de una feria o colegio' and contenido not like '%(Ref.%';
