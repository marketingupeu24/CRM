-- Reasignación automática:
-- 1) Rotación real: ultimo_lead_asignado con clock_timestamp(). Con now() (fijo en la transacción) todos los asesores
--    quedaban con la misma hora y, en una tanda, el resto de leads iba siempre al mismo asesor.
-- 2) Los leads que postulan a Lima o Tarapoto no pasan a otro asesor de Juliaca.
-- 3) Índice para saber cuándo entró el último mensaje de un alumno (detecta WhatsApp bloqueado sin aviso).

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
      -- Postula a otra sede: no se pasa a otro asesor de Juliaca
      and coalesce(sede, '') !~* '(lima|tarapoto)'
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

    -- clock_timestamp(): avanza dentro de la tanda, así el siguiente lead va al siguiente asesor
    update public.asesores set ultimo_lead_asignado = clock_timestamp() where id = v_nuevo.id;
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

create index if not exists lead_interacciones_mensaje_lead_idx
  on public.lead_interacciones (created_at desc) where tipo = 'mensaje_lead';
