-- Regla del 30/10: lo que el asesor registra a su nombre (oficina, registro rápido, planilla "a mi nombre")
-- no se reasigna: ya lo atendió en persona. Lo cargado con "repartir por igual" sigue rotando.
--   leads.repartido = el lead está en la rotación (entró repartido o ya fue reasignado una vez).

alter table public.leads add column if not exists repartido boolean not null default false;
comment on column public.leads.repartido is
  'En la rotación: entró con "repartir" o ya fue reasignado. Si es false y registrado_por = asesor_id, no se reasigna.';

-- Leads actuales: entró repartido si en la misma carga (mismo usuario, ±3 min) hubo leads que fueron a otros asesores
with ini as (
  select l.id, l.registrado_por r, l.created_at,
         coalesce((select m.de_asesor_id from public.movimientos_lead m where m.lead_id = l.id order by m.created_at limit 1), l.asesor_id) a0
  from public.leads l
  where l.registrado_por is not null
)
update public.leads l set repartido = true
from ini i
where l.id = i.id
  and (i.a0 is distinct from i.r
       or exists (select 1 from ini j where j.r = i.r and j.id <> i.id and j.a0 is distinct from j.r
                    and abs(extract(epoch from j.created_at - i.created_at)) < 180)
       or exists (select 1 from public.movimientos_lead m where m.lead_id = l.id and m.motivo like 'No contactado%'));

-- Los que eran del propio asesor y la rotación le quitó (29/10): vuelven a él si el nuevo aún no los contactó
select set_config('crm.asignacion_sistema', 'on', true),
       set_config('crm.sin_aviso_asignacion', 'on', true),
       set_config('crm.motivo_movimiento', 'Devuelto a quien lo registró', true);

with devolver as (
  select l.id, l.registrado_por r, l.asesor_id antes
  from public.leads l
  join public.asesores a on a.id = l.registrado_por and a.activo and a.eliminado_at is null
  where l.eliminado_at is null
    and l.asesor_id <> l.registrado_por
    and l.estado = 'lead_asignado'
    and l.primer_contacto_asesor_at is null
    and coalesce((select m.de_asesor_id from public.movimientos_lead m where m.lead_id = l.id order by m.created_at limit 1), l.asesor_id) = l.registrado_por
    and not exists (select 1 from public.leads j
                    where j.registrado_por = l.registrado_por and j.id <> l.id
                      and abs(extract(epoch from j.created_at - l.created_at)) < 180
                      and coalesce((select m.de_asesor_id from public.movimientos_lead m where m.lead_id = j.id order by m.created_at limit 1), j.asesor_id) is distinct from j.registrado_por)
), notas as (
  insert into public.lead_interacciones (lead_id, tipo, contenido)
  select d.id, 'sistema', format('Devuelto a %s: lo registró él mismo (no se reasignan los registros propios)', a.nombre)
  from devolver d join public.asesores a on a.id = d.r
)
update public.leads l
set asesor_id = d.r, repartido = false, notificacion_estado = 'omitida'
from devolver d where l.id = d.id;

select set_config('crm.asignacion_sistema', 'off', true),
       set_config('crm.sin_aviso_asignacion', 'off', true),
       set_config('crm.motivo_movimiento', '', true);

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
      -- Lo registró el propio asesor (oficina, registro rápido, planilla "a mi nombre"): ya lo atendió, no rota
      and (registrado_por is distinct from asesor_id or repartido)
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
        repartido = true,
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
end $function$
;

CREATE OR REPLACE FUNCTION public.importar_leads(p_filas jsonb, p_actividad_id bigint DEFAULT NULL::bigint, p_asesor_id uuid DEFAULT NULL::uuid, p_origen text DEFAULT NULL::text, p_aviso_diferido boolean DEFAULT false, p_repartir boolean DEFAULT false)
 RETURNS TABLE(fila integer, estado text, mensaje text, lead_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_ubigeo    text;
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

  -- Por defecto, a nombre de quien registra. Repartir por igual: con el módulo "repartir" (o "asignar").
  -- Elegir un asesor en particular: solo con "asignar".
  v_asesor := case
    when p_repartir and (v_asignar or public.tiene_permiso('repartir')) then null
    when v_asignar and p_asesor_id is not null then p_asesor_id
    else v_yo
  end;
  if v_asesor is not null and not exists (select 1 from public.asesores where id = v_asesor and activo and eliminado_at is null) then
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
      -- Ciudad de la planilla ("Juliaca", "Ilave, Puno"): se busca su distrito, provincia o departamento
      v_ubigeo := public.ubigeo_de_texto(nullif(trim(coalesce(v_f->>'ciudad', '')), ''));
      update public.leads
      set ubigeo          = coalesce(v_ubigeo, ubigeo),
          procedencia_por = case when v_ubigeo is not null then 'asesor' else procedencia_por end,
          colegio        = coalesce(nullif(left(trim(v_f->>'colegio'), 120), ''), colegio),
          grado          = coalesce(nullif(left(trim(v_f->>'grado'), 40), ''), grado),
          actividad_id   = coalesce(v_act.id, actividad_id),
          origen_campana = coalesce(nullif(left(trim(coalesce(v_f->>'origen', p_origen)), 60), ''),
                                    case when v_act.id is not null then 'Feria / colegio' end, origen_campana),
          eliminado_at   = null,
          eliminado_por  = null,
          -- La primera vez: ¿entró por la rotación ("repartir") o a nombre de un asesor? Los suyos no rotan
          repartido      = case when registrado_por is null then v_asesor is null else repartido end,
          -- Quién lo subió (el primero): puede corregir su celular y sale en "Escaneos" del QR
          registrado_por = coalesce(registrado_por, v_yo)
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
  -- Sin aviso por WhatsApp (bloqueo de Meta del 28/10): los asesores ven sus leads en el panel
  end if;
  perform set_config('crm.sin_aviso_asignacion', 'off', true);
end $function$
;
