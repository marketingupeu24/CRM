-- =====================================================================
--  Horario de atención (Lima): lunes a jueves 8:00–12:30 y 14:00–18:00,
--  viernes 8:00–13:00. Sábado y domingo cerrado.
--  - franjas_atencion(dia), en_horario_atencion(t), proxima_atencion(t),
--    horas_habiles(desde, hasta).
--  - Reasignación automática: solo en horario y contando horas hábiles.
--  - reservar_aviso_horario(lead): el CRM responde una sola vez por cierre a
--    quien escribe fuera de horario ("tu asesor te responderá el lunes 8:00").
-- =====================================================================

create or replace function public.franjas_atencion(p_dia date)
returns table (inicio timestamptz, fin timestamptz)
language sql stable set search_path = ''
as $$
  select (p_dia + f.desde) at time zone 'America/Lima', (p_dia + f.hasta) at time zone 'America/Lima'
  from (values
    (time '08:00', time '12:30', 1, 4),
    (time '14:00', time '18:00', 1, 4),
    (time '08:00', time '13:00', 5, 5)
  ) as f (desde, hasta, dia_desde, dia_hasta)
  where extract(isodow from p_dia) between f.dia_desde and f.dia_hasta
$$;

create or replace function public.en_horario_atencion(p_momento timestamptz default now())
returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.franjas_atencion((p_momento at time zone 'America/Lima')::date) f
    where p_momento >= f.inicio and p_momento < f.fin
  )
$$;

-- El momento dado si está en horario; si no, la próxima apertura
create or replace function public.proxima_atencion(p_momento timestamptz default now())
returns timestamptz
language sql stable set search_path = ''
as $$
  select case when public.en_horario_atencion(p_momento) then p_momento else (
    select min(f.inicio)
    from generate_series((p_momento at time zone 'America/Lima')::date, (p_momento at time zone 'America/Lima')::date + 8, interval '1 day') d,
         lateral public.franjas_atencion(d::date) f
    where f.inicio > p_momento
  ) end
$$;

-- Horas de atención transcurridas entre dos momentos (máx. 31 días)
create or replace function public.horas_habiles(p_desde timestamptz, p_hasta timestamptz default now())
returns numeric
language sql stable set search_path = ''
as $$
  select coalesce(sum(extract(epoch from (least(f.fin, p_hasta) - greatest(f.inicio, p_desde))) / 3600.0), 0)::numeric(10, 2)
  from generate_series((p_desde at time zone 'America/Lima')::date,
                       least((p_hasta at time zone 'America/Lima')::date, (p_desde at time zone 'America/Lima')::date + 31),
                       interval '1 day') d,
       lateral public.franjas_atencion(d::date) f
  where f.fin > p_desde and f.inicio < p_hasta
$$;

grant execute on function public.franjas_atencion(date) to authenticated, service_role;
grant execute on function public.en_horario_atencion(timestamptz) to authenticated, service_role;
grant execute on function public.proxima_atencion(timestamptz) to authenticated, service_role;
grant execute on function public.horas_habiles(timestamptz, timestamptz) to authenticated, service_role;

-- Aviso fuera de horario: uno por cierre (se guarda para qué apertura se avisó)
alter table public.leads add column if not exists aviso_horario_para timestamptz;

create or replace function public.reservar_aviso_horario(p_lead_id uuid)
returns timestamptz
language plpgsql set search_path = ''
as $$
declare
  v_apertura timestamptz;
begin
  if public.en_horario_atencion() then
    return null;
  end if;
  v_apertura := public.proxima_atencion();
  update public.leads set aviso_horario_para = v_apertura
  where id = p_lead_id and aviso_horario_para is distinct from v_apertura;
  return case when found then v_apertura end;
end $$;
revoke execute on function public.reservar_aviso_horario(uuid) from public, anon, authenticated;
grant execute on function public.reservar_aviso_horario(uuid) to service_role;

-- Reasignación automática: solo en horario, contando horas hábiles
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

  for v_lead in
    select * from public.leads
    where estado = 'lead_asignado'
      and eliminado_at is null
      and asesor_id is not null
      and primer_contacto_asesor_at is null
      -- Plazo en horas HÁBILES: un lead del sábado no se quita el lunes a las 8:00
      and public.horas_habiles(fecha_asignado, now()) >= p_horas
      and reasignaciones < p_maximo
      -- El lead que subió el propio asesor es suyo: no se reasigna
      and (registrado_por is null or registrado_por <> asesor_id)
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
    limit 1 for update skip locked;

    if v_nuevo.id is null then
      select * into v_nuevo from public.asesores
      where activo and id <> v_lead.asesor_id and carreras = '{}'
      order by ultimo_lead_asignado nulls first, created_at, nombre
      limit 1 for update skip locked;
    end if;

    continue when v_nuevo.id is null;   -- no hay a quién pasarlo

    update public.asesores set ultimo_lead_asignado = now() where id = v_nuevo.id;
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

-- Genesys conoce el horario
insert into public.conocimiento (categoria, titulo, contenido, activo, orden)
select 'reglas', 'Horario de atención de los asesores',
'Horario de atención de la oficina de Admisión (hora de Perú):
- Lunes a jueves: 8:00 a. m. a 12:30 p. m. y 2:00 p. m. a 6:00 p. m.
- Viernes: 8:00 a. m. a 1:00 p. m.
- Sábado y domingo: cerrado.
Tú (Genesys) respondes a cualquier hora. Si te escriben fuera de ese horario y piden hablar con un asesor o ya se registraron, diles que su asesor(a) les escribirá en el siguiente horario de atención (por ejemplo, si escriben un sábado, el lunes a las 8:00 a. m.).', true, 15
where not exists (select 1 from public.conocimiento where titulo = 'Horario de atención de los asesores');
