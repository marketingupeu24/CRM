-- =====================================================================
--  Registro rápido de fichas en papel (Registrar lead, uno por uno).
--  - importar_leads(..., p_aviso_diferido): los avisos a los asesores se juntan
--    en avisos_pendientes y salen en un resumen por asesor cada 3 minutos
--    (enviar_avisos_pendientes + cron), en vez de un WhatsApp por ficha.
--  - lead_existente(): avisa al instante si el celular o DNI ya está registrado.
-- =====================================================================

create table if not exists public.avisos_pendientes (
  lead_id    uuid primary key references public.leads (id) on delete cascade,
  creado_por uuid references public.asesores (id) on delete set null,
  actividad  text,
  created_at timestamptz not null default now()
);
alter table public.avisos_pendientes enable row level security;
revoke all on public.avisos_pendientes from anon, authenticated;

drop function if exists public.importar_leads(jsonb, bigint, uuid, text);

create or replace function public.importar_leads(
  p_filas        jsonb,
  p_actividad_id bigint default null,
  p_asesor_id    uuid default null,
  p_origen       text default null,
  -- true: el aviso al asesor se junta con otros y sale en un resumen cada pocos minutos
  p_aviso_diferido boolean default false
)
returns table (fila int, estado text, mensaje text, lead_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo        uuid := public.mi_asesor_id();
  v_asignar   boolean := public.tiene_permiso('asignar');
  v_act       public.actividades;
  v_asesor    uuid;
  v_f         jsonb;
  v_i         int := 0;
  v_nombre    text;
  v_tel       text;
  v_dni       text;
  v_carrera   text;
  v_cepre     boolean;
  v_res       jsonb;
  v_lead      uuid;
  v_ids       jsonb := '[]'::jsonb;
  v_quien     text;
begin
  if v_yo is null or not public.tiene_permiso('registrar') then
    raise exception 'No tienes permiso para registrar leads';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay alumnos para importar';
  end if;
  if jsonb_array_length(p_filas) > 500 then
    raise exception 'Máximo 500 alumnos por importación';
  end if;
  if p_actividad_id is not null then
    select * into v_act from public.actividades where id = p_actividad_id;
  end if;

  -- Quien no puede asignar, registra para sí mismo; quien puede, elige asesor o rotación (null)
  v_asesor := case when v_asignar then p_asesor_id else v_yo end;
  if v_asesor is not null and not exists (select 1 from public.asesores where id = v_asesor and activo and rol = 'asesor' and eliminado_at is null) then
    v_asesor := null;  -- admin u otro que no recibe leads: rotación
  end if;

  perform set_config('crm.sin_aviso_asignacion', 'on', true);

  for v_f in select * from jsonb_array_elements(p_filas) loop
    v_i := v_i + 1;
    v_nombre  := nullif(regexp_replace(trim(coalesce(v_f->>'nombre', '')), '\s+', ' ', 'g'), '');
    v_tel     := regexp_replace(coalesce(v_f->>'celular', ''), '\D', '', 'g');
    v_dni     := nullif(regexp_replace(coalesce(v_f->>'dni', ''), '\D', '', 'g'), '');
    v_carrera := nullif(trim(coalesce(v_f->>'carrera', '')), '');
    v_cepre   := coalesce(v_carrera, '') ~* 'cepre';
    if v_tel ~ '^9[0-9]{8}$' then v_tel := '51' || v_tel; end if;

    if v_nombre is null or length(v_nombre) < 3 then
      fila := v_i; estado := 'error'; mensaje := 'Falta el nombre'; lead_id := null; return next; continue;
    end if;
    if v_tel !~ '^[0-9]{10,15}$' then
      fila := v_i; estado := 'error'; mensaje := 'Celular no válido'; lead_id := null; return next; continue;
    end if;
    if v_dni is not null and v_dni !~ '^[0-9]{8,12}$' then
      fila := v_i; estado := 'error'; mensaje := 'DNI no válido'; lead_id := null; return next; continue;
    end if;
    -- Un asesor no puede tomar un lead que ya es de otro asesor
    if not v_asignar and exists (
      select 1 from public.leads
      where (telefono = v_tel or (v_dni is not null and dni = v_dni))
        and asesor_id is not null and asesor_id <> v_yo and eliminado_at is null
    ) then
      fila := v_i; estado := 'omitido'; mensaje := 'Ya está registrado con otro asesor'; lead_id := null; return next; continue;
    end if;

    begin
      v_res := public.procesar_lead(
        p_telefono  => v_tel,
        p_dni       => v_dni,
        p_nombre    => v_nombre,
        p_carrera   => case when v_cepre then null else v_carrera end,
        p_modalidad => case when v_cepre then 'CEPRE' else null end,
        p_programa  => case when v_cepre then 'cepre' else 'pregrado' end,
        p_consulta  => case when v_act.id is not null then left('Registro en ' || v_act.nombre, 300) else 'Importado desde planilla' end,
        p_origen    => case when v_act.id is not null then 'actividad' else 'manual' end,
        p_asesor_id => v_asesor,
        p_asignar   => true,
        p_notificar => false
      );
      v_lead := (v_res->>'lead_id')::uuid;
      update public.leads
      set colegio        = coalesce(nullif(left(trim(v_f->>'colegio'), 120), ''), colegio),
          grado          = coalesce(nullif(left(trim(v_f->>'grado'), 40), ''), grado),
          actividad_id   = coalesce(v_act.id, actividad_id),
          origen_campana = coalesce(nullif(left(trim(coalesce(v_f->>'origen', p_origen)), 60), ''),
                                    case when v_act.id is not null then 'Feria / colegio' end, origen_campana),
          eliminado_at   = null,
          eliminado_por  = null
      where id = v_lead;
      if v_res->>'asesor_id' is not null then v_ids := v_ids || to_jsonb(v_lead); end if;
      fila := v_i;
      estado := case when v_res->>'status' = 'success' then 'nuevo' else 'actualizado' end;
      mensaje := coalesce('Asignado a ' || (v_res->>'asesor_nombre'), 'Sin asesor');
      lead_id := v_lead;
      return next;
    exception when others then
      fila := v_i; estado := 'error'; mensaje := left(sqlerrm, 200); lead_id := null; return next;
    end;
  end loop;

  -- Registro rápido de fichas: el aviso se junta y sale en un resumen (enviar_avisos_pendientes)
  if p_aviso_diferido and jsonb_array_length(v_ids) > 0 then
    insert into public.avisos_pendientes (lead_id, creado_por, actividad)
    select (x #>> '{}')::uuid, v_yo, v_act.nombre from jsonb_array_elements(v_ids) x
    on conflict on constraint avisos_pendientes_pkey do nothing;
  -- Un solo aviso por asesor (Genesys agrupa: con más de 3 leads manda un resumen)
  elsif jsonb_array_length(v_ids) > 0 then
    select nombre into v_quien from public.asesores where id = v_yo;
    perform public.llamar_genesys('notificar', jsonb_build_object(
      'lead_ids', v_ids,
      'asignado_por', coalesce(v_quien, 'Importación') || case when v_act.id is not null then ' · ' || v_act.nombre else '' end
    ));
  end if;
  perform set_config('crm.sin_aviso_asignacion', 'off', true);
end $$;


revoke execute on function public.importar_leads(jsonb, bigint, uuid, text, boolean) from public, anon;
grant execute on function public.importar_leads(jsonb, bigint, uuid, text, boolean) to authenticated;

-- Envía los avisos juntados (los que llevan 2+ minutos esperando), uno por quien registró
create or replace function public.enviar_avisos_pendientes()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_grupo record;
  v_total int := 0;
begin
  for v_grupo in
    with listos as (
      delete from public.avisos_pendientes p
      where p.created_at < now() - interval '2 minutes'
      returning p.lead_id, p.creado_por, p.actividad
    )
    select l.creado_por, max(l.actividad) actividad, jsonb_agg(l.lead_id) ids, count(*)::int n
    from listos l group by l.creado_por
  loop
    perform public.llamar_genesys('notificar', jsonb_build_object(
      'lead_ids', v_grupo.ids,
      'asignado_por', coalesce((select nombre from public.asesores where id = v_grupo.creado_por), 'Registro de fichas')
                      || coalesce(' · ' || v_grupo.actividad, '')
    ));
    v_total := v_total + v_grupo.n;
  end loop;
  return v_total;
end $$;

revoke execute on function public.enviar_avisos_pendientes() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$ select cron.unschedule('crm-avisos-fichas') where exists (select 1 from cron.job where jobname = 'crm-avisos-fichas') $q$;
    execute $q$ select cron.schedule('crm-avisos-fichas', '*/3 * * * *', 'select public.enviar_avisos_pendientes()') $q$;
  end if;
end $$;

-- ¿Ya existe este celular o DNI? (para avisar mientras se escribe la ficha)
create or replace function public.lead_existente(p_telefono text default null, p_dni text default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tel  text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_dni  text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_lead public.leads;
  v_yo   uuid := public.mi_asesor_id();
  v_ve   boolean;
begin
  if v_yo is null or not public.tiene_permiso('registrar') then return null; end if;
  if v_tel ~ '^9[0-9]{8}$' then v_tel := '51' || v_tel; end if;
  if v_dni is not null and v_dni ~ '^[0-9]{8,12}$' then
    select * into v_lead from public.leads where dni = v_dni limit 1;
  end if;
  if v_lead.id is null and v_tel ~ '^[0-9]{10,15}$' then
    select * into v_lead from public.leads where telefono = v_tel limit 1;
  end if;
  if v_lead.id is null then return null; end if;
  -- Solo quien puede verlo recibe los datos del lead
  v_ve := public.tiene_permiso('ver_todos') or v_lead.asesor_id = v_yo;
  return jsonb_build_object(
    'por', case when v_dni is not null and v_lead.dni = v_dni then 'dni' else 'celular' end,
    'lead_id', case when v_ve then v_lead.id end,
    'nombre', case when v_ve then v_lead.nombre end,
    'asesor', case when v_ve then (select nombre from public.asesores where id = v_lead.asesor_id) end,
    'de_otro_asesor', v_lead.asesor_id is not null and v_lead.asesor_id <> v_yo and not public.tiene_permiso('asignar'),
    'en_papelera', v_lead.eliminado_at is not null
  );
end $$;

revoke execute on function public.lead_existente(text, text) from public, anon;
grant execute on function public.lead_existente(text, text) to authenticated;
