-- =====================================================================
--  QR sin riesgo para el número de WhatsApp: el alumno escribe primero.
--  - Ya no hay bienvenida automática de Genesys (iniciar chats en masa
--    arriesga un bloqueo). La pantalla final del formulario abre WhatsApp
--    con un mensaje listo según su carrera; Genesys solo responde.
--  - El DNI es obligatorio en el formulario y es el identificador del alumno.
--  - registrar_lead: si escribe desde un celular desconocido con su DNI en el
--    mensaje ("soy Rosa (DNI 71234567)"), se une a su lead (no se duplica).
--  - ajustes: número de WhatsApp de Genesys (lo configura el super admin).
-- =====================================================================

create table if not exists public.ajustes (
  clave      text primary key,
  valor      text,
  updated_at timestamptz not null default now()
);
insert into public.ajustes (clave) values ('whatsapp_genesys') on conflict do nothing;

alter table public.ajustes enable row level security;
revoke all on public.ajustes from anon;
grant select, update on public.ajustes to authenticated;

create policy "ajustes: los usuarios del panel los leen"
on public.ajustes for select to authenticated using ((select public.mi_asesor_id()) is not null);

create policy "ajustes: solo el super admin los cambia"
on public.ajustes for update to authenticated
using ((select public.es_superadmin())) with check ((select public.es_superadmin()));

-- Sin bienvenida automática
alter table public.actividades alter column bienvenida set default false;
update public.actividades set bienvenida = false where bienvenida;

-- ---------------------------------------------------------------------
-- Formulario del QR: DNI obligatorio y sin mensajes salientes al alumno
-- ---------------------------------------------------------------------
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
  if v_dni is null or v_dni !~ '^[0-9]{8}$' then
    raise exception 'Escribe tu DNI (8 dígitos)';
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

  -- procesar_lead busca primero por DNI y luego por celular: nunca duplica
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

-- ---------------------------------------------------------------------
-- Mensajes entrantes: unir por DNI al alumno que escribe desde otro celular
-- ---------------------------------------------------------------------
create or replace function public.registrar_lead(p_telefono text, p_mensaje text default null)
returns public.leads
language plpgsql set search_path = ''
as $$
declare
  v_lead      public.leads;
  v_por_dni   public.leads;
  v_dni       text;
  v_repetido  boolean := false;
begin
  select * into v_lead from public.leads where telefono = p_telefono for update;

  -- Celular desconocido con un DNI en el mensaje (el texto que arma el formulario del QR):
  -- si ese DNI ya es de un lead cuyo celular no está conversando, el lead pasa a este celular.
  if v_lead.id is null and p_mensaje is not null then
    v_dni := substring(p_mensaje from '(?i)dni\D{0,4}(\d{8})');
    if v_dni is not null then
      select * into v_por_dni from public.leads where dni = v_dni for update;
      if v_por_dni.id is not null
         and (v_por_dni.ultimo_mensaje_lead_at is null or v_por_dni.ultimo_mensaje_lead_at < now() - interval '30 days') then
        update public.leads set telefono = p_telefono, eliminado_at = null, eliminado_por = null
        where id = v_por_dni.id;
        insert into public.lead_interacciones (lead_id, tipo, contenido)
        values (v_por_dni.id, 'sistema', 'Escribió desde ' || p_telefono || ' con su DNI: se actualizó el celular (antes ' || v_por_dni.telefono || ')');
        select * into v_lead from public.leads where id = v_por_dni.id;
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

  insert into public.leads (telefono, total_mensajes)
  values (p_telefono, 1)
  on conflict (telefono) do update
    set ultimo_contacto = now(),
        total_mensajes  = public.leads.total_mensajes + 1
  returning * into v_lead;

  if p_mensaje is not null then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'mensaje_lead', p_mensaje);
  end if;

  return v_lead;
end $$;

revoke execute on function public.registrar_lead(text, text) from public, anon, authenticated;
grant  execute on function public.registrar_lead(text, text) to service_role;

-- Regla para Genesys: el mensaje del QR ya trae nombre, DNI y carrera
insert into public.conocimiento (categoria, titulo, contenido, activo, orden)
select 'reglas', 'Alumnos que vienen del QR de una feria o colegio',
'Si el primer mensaje dice "Hola, soy <nombre> (DNI <número>). Me registré en <actividad>…", esa persona ya dejó sus datos con el QR:
- No vuelvas a pedirle nombre ni DNI.
- Responde directamente sobre la carrera que menciona (o el CEPRE): de qué trata, duración, costos del tarifario y siguientes pasos.
- Si no menciona carrera, pregúntale qué carrera le interesa.
- Dile que su asesor(a) le escribirá con la proforma.', true, 35
where not exists (select 1 from public.conocimiento where titulo = 'Alumnos que vienen del QR de una feria o colegio');
