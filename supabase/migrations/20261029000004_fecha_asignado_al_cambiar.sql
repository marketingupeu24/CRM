-- Al cambiar de asesor (también a mano desde el panel) la fecha de asignación se reinicia:
-- antes solo se fijaba la primera vez, y un lead reasignado a mano mostraba la fecha vieja y la
-- reasignación automática se lo quitaba al nuevo asesor en minutos (contaba el tiempo del anterior).

CREATE OR REPLACE FUNCTION public.fn_leads_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('crm.solo_puntaje', true), '') = 'on' then
    return new;
  end if;

  if auth.uid() is not null
     and not public.tiene_permiso('asignar')
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

  -- Nuevo asesor: su tiempo empieza ahora (salvo que el mismo cambio ya traiga la fecha)
  if new.asesor_id is not null and new.asesor_id is distinct from old.asesor_id
     and new.fecha_asignado is not distinct from old.fecha_asignado then
    new.fecha_asignado := now();
  end if;

  if new.asesor_id is not null and new.fecha_asignado is null then
    new.fecha_asignado := now();
  end if;

  return new;
end $function$;
