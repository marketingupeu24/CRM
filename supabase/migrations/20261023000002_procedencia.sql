-- Procedencia de los leads (de dónde vienen): país y, en el Perú, departamento / provincia / distrito (UBIGEO del INEI).
-- - El país sale del celular (+51 Perú, +591 Bolivia…) y se puede corregir a mano (leads.pais).
-- - La ubicación se guarda como código UBIGEO al nivel que se sepa: DD0000 = departamento, DDPP00 = provincia,
--   DDPPDD = distrito. La llena el alumno (formularios del QR), el asesor (ficha) o Genesys (si el alumno lo dice).
-- No cambia ningún dato existente: solo agrega columnas vacías y funciones nuevas.

-- ---------------------------------------------------------------------
-- 1. Lista de UBIGEO (la semilla está en 20261023000003_ubigeos_datos.sql)
-- ---------------------------------------------------------------------
create table if not exists public.ubigeos (
  codigo        text primary key check (codigo ~ '^[0-9]{6}$'),
  nivel         smallint not null check (nivel in (1, 2, 3)),   -- 1 departamento, 2 provincia, 3 distrito
  departamento  text not null,
  provincia     text,
  distrito      text,
  nombre        text not null,                                   -- nombre de este nivel
  busqueda      text not null                                    -- nombre en minúsculas y sin tildes
);
create index if not exists idx_ubigeos_busqueda on public.ubigeos (busqueda);
comment on table public.ubigeos is 'UBIGEO del INEI (departamentos, provincias y distritos del Perú) para la procedencia de los leads.';

alter table public.ubigeos enable row level security;
drop policy if exists ubigeos_lectura on public.ubigeos;
create policy ubigeos_lectura on public.ubigeos for select using (true);
revoke all on public.ubigeos from anon, authenticated;
grant select on public.ubigeos to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Columnas del lead
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists pais text check (pais ~ '^[A-Z]{2}$');
alter table public.leads add column if not exists ubigeo text references public.ubigeos (codigo) on delete set null;
alter table public.leads add column if not exists procedencia_por text check (procedencia_por in ('alumno', 'asesor', 'bot'));
create index if not exists idx_leads_ubigeo on public.leads (ubigeo);
comment on column public.leads.pais is 'País (ISO 3166-1, ej. PE, BO). Vacío = se toma del celular (pais_de_telefono).';
comment on column public.leads.ubigeo is 'Procedencia en el Perú: UBIGEO del INEI al nivel que se sepa (departamento, provincia o distrito).';
comment on column public.leads.procedencia_por is 'Quién indicó la procedencia: alumno (formulario), asesor (ficha) o bot (Genesys).';

-- ---------------------------------------------------------------------
-- 3. País según el celular
-- ---------------------------------------------------------------------
create or replace function public.pais_de_telefono(p_telefono text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    -- Contactos de WhatsApp con usuario (BSUID "PE.123…"): el prefijo es el país
    when p_telefono ~ '^[A-Z]{2}\.' then left(p_telefono, 2)
    when t ~ '^51[0-9]{8,9}$'           then 'PE'
    when t ~ '^591[0-9]{8}$'            then 'BO'
    when t ~ '^56[0-9]{9}$'             then 'CL'
    when t ~ '^54[0-9]{10,11}$'         then 'AR'
    when t ~ '^55[0-9]{10,11}$'         then 'BR'
    when t ~ '^57[0-9]{10}$'            then 'CO'
    when t ~ '^593[0-9]{8,9}$'          then 'EC'
    when t ~ '^58[0-9]{10}$'            then 'VE'
    when t ~ '^595[0-9]{9}$'            then 'PY'
    when t ~ '^598[0-9]{8}$'            then 'UY'
    when t ~ '^52[0-9]{10,11}$'         then 'MX'
    when t ~ '^34[0-9]{9}$'             then 'ES'
    when t ~ '^39[0-9]{9,10}$'          then 'IT'
    when t ~ '^1[0-9]{10}$'             then 'US'
    else null
  end
  from (select regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g') as t) x
$$;
comment on function public.pais_de_telefono(text) is 'País (ISO) según el prefijo del celular; null si no se reconoce (p. ej. contactos @lid).';
grant execute on function public.pais_de_telefono(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. UBIGEO a partir de un texto ("Juliaca", "Ilave, Puno", "soy de San Román")
-- ---------------------------------------------------------------------
create or replace function public.ubigeo_de_texto(p_texto text)
returns text
language plpgsql
stable
set search_path to ''
as $$
declare
  v_limpio text := lower(translate(coalesce(p_texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
  v_partes text[];
  v_parte  text;
  v_codigo text;
begin
  v_limpio := regexp_replace(v_limpio, '^\s*(soy|vivo|estoy|somos)?\s*(de|en)?\s+', '');
  v_partes := array(select trim(x) from unnest(regexp_split_to_array(v_limpio, '\s*[,/()\-]\s*|\s+(provincia|departamento|region|distrito)\s+(de\s+)?')) x where trim(x) <> '');
  if coalesce(array_length(v_partes, 1), 0) = 0 then return null; end if;

  foreach v_parte in array v_partes loop
    select codigo into v_codigo
    from public.ubigeos u
    where u.busqueda = v_parte
    order by
      -- Si mencionó otra parte (ej. "Ilave, Puno"), primero lo que está dentro de ella
      exists (select 1 from public.ubigeos d
              where d.busqueda = any (v_partes) and d.busqueda <> v_parte and d.nivel < 3 and d.codigo <> u.codigo
                and u.codigo like case d.nivel when 1 then left(d.codigo, 2) else left(d.codigo, 4) end || '%') desc,
      u.codigo like '21%' desc,                                    -- Puno (campus Juliaca) ante nombres repetidos
      case u.nivel when 2 then 0 when 3 then 1 else 2 end,         -- "Arequipa": la provincia (no adivina el distrito)
      u.codigo
    limit 1;
    if v_codigo is not null then return v_codigo; end if;
  end loop;
  return null;
end $$;
comment on function public.ubigeo_de_texto(text) is 'UBIGEO que corresponde a un texto libre (ciudad, distrito, provincia o departamento); null si no lo reconoce.';
revoke all on function public.ubigeo_de_texto(text) from public;
grant execute on function public.ubigeo_de_texto(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Reporte: leads por procedencia (respeta los permisos: cada asesor ve solo sus leads)
-- ---------------------------------------------------------------------
create or replace function public.procedencia_leads(p_desde timestamptz default null, p_hasta timestamptz default null, p_asesor uuid default null)
returns table (pais text, ubigeo text, total bigint, atendidos bigint, inscritos bigint)
language sql
stable
security invoker
set search_path to ''
as $$
  select coalesce(l.pais, public.pais_de_telefono(l.telefono)) as pais,
         l.ubigeo,
         count(*) as total,
         count(*) filter (where l.estado in ('lead_contactado', 'lead_atendido', 'lead_inscrito', 'lead_matriculado')) as atendidos,
         count(*) filter (where l.estado in ('lead_inscrito', 'lead_matriculado')) as inscritos
  from public.leads l
  where l.eliminado_at is null
    and (p_desde is null or l.created_at >= p_desde)
    and (p_hasta is null or l.created_at < p_hasta)
    and (p_asesor is null or l.asesor_id = p_asesor)
  group by 1, 2
$$;
comment on function public.procedencia_leads(timestamptz, timestamptz, uuid) is 'Leads agrupados por país y UBIGEO (con atendidos e inscritos) para el mapa de procedencia.';
revoke all on function public.procedencia_leads(timestamptz, timestamptz, uuid) from public;
grant execute on function public.procedencia_leads(timestamptz, timestamptz, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Formularios públicos del QR: el alumno puede indicar de dónde es (p_ubigeo)
--    Mismo cuerpo que antes; solo se agrega el parámetro y se guarda si es un código válido.
-- ---------------------------------------------------------------------
drop function if exists public.registrar_lead_actividad(text, text, text, text, text, text, text);

create function public.registrar_lead_actividad(p_codigo text, p_nombre text, p_telefono text, p_dni text DEFAULT NULL::text, p_colegio text DEFAULT NULL::text, p_grado text DEFAULT NULL::text, p_carrera text DEFAULT NULL::text, p_ubigeo text DEFAULT NULL::text)
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
  v_cepre      boolean := coalesce(p_carrera, '') ~* 'cepre';
  v_carrera    text := nullif(trim(coalesce(p_carrera, '')), '');
  v_ubigeo     text := (select codigo from public.ubigeos where codigo = trim(coalesce(p_ubigeo, '')));
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
  set actividad_id    = v_act.id,
      colegio         = coalesce(nullif(left(trim(p_colegio), 120), ''), colegio),
      grado           = coalesce(nullif(left(trim(p_grado), 40), ''), grado),
      ubigeo          = coalesce(v_ubigeo, ubigeo),
      procedencia_por = case when v_ubigeo is not null then 'alumno' else procedencia_por end,
      origen_campana  = coalesce(origen_campana, 'Feria / colegio'),
      eliminado_at    = null,
      eliminado_por   = null
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
end $function$;

revoke all on function public.registrar_lead_actividad(text, text, text, text, text, text, text, text) from public;
grant execute on function public.registrar_lead_actividad(text, text, text, text, text, text, text, text) to anon, authenticated, service_role;

drop function if exists public.registrar_lead_asesor(text, text, text, text, text, text, text, text);

create function public.registrar_lead_asesor(p_codigo text, p_nombre text, p_telefono text, p_dni text DEFAULT NULL::text, p_colegio text DEFAULT NULL::text, p_grado text DEFAULT NULL::text, p_carrera text DEFAULT NULL::text, p_via text DEFAULT 'qr', p_ubigeo text DEFAULT NULL::text)
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
  v_ubigeo     text := (select codigo from public.ubigeos where codigo = trim(coalesce(p_ubigeo, '')));
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
  set colegio         = coalesce(nullif(left(trim(p_colegio), 120), ''), colegio),
      grado           = coalesce(nullif(left(trim(p_grado), 40), ''), grado),
      ubigeo          = coalesce(v_ubigeo, ubigeo),
      procedencia_por = case when v_ubigeo is not null then 'alumno' else procedencia_por end,
      origen_campana  = coalesce(origen_campana, case when v_enlace then 'Enlace del asesor (WhatsApp)' else 'Presencial (QR del asesor)' end),
      registrado_por  = case when v_suyo then v_asesor.id else registrado_por end,
      -- Lo está atendiendo en persona: ya contactado
      estado          = case when v_suyo and estado in ('lead_nuevo', 'lead_en_conversacion', 'lead_interesado', 'lead_no_interesado', 'lead_perdido', 'lead_asignado')
                             then 'lead_contactado'::public.lead_estado else estado end,
      eliminado_at    = null,
      eliminado_por   = null
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

revoke all on function public.registrar_lead_asesor(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.registrar_lead_asesor(text, text, text, text, text, text, text, text, text) to anon, authenticated, service_role;
