-- =====================================================================
--  Toda asignación avisa al asesor por WhatsApp, también cuando quien asigna
--  desde el panel se asigna el lead a sí mismo (antes se omitía). Así el
--  asesor siempre tiene en su WhatsApp los datos de cada lead que es suyo.
--  Los demás caminos (bot, QR, reasignación automática, Registrar lead y
--  Varios alumnos) ya avisaban.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.avisar_asignacion_panel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_yo   uuid := public.mi_asesor_id();
  v_ids  jsonb;
  v_por  text;
begin
  -- La importación en lote avisa una sola vez al final (no un mensaje por fila)
  if auth.uid() is null or current_setting('crm.sin_aviso_asignacion', true) = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    select jsonb_agg(n.id) into v_ids
    from nuevos n
    where n.asesor_id is not null;
  else
    select jsonb_agg(n.id) into v_ids
    from nuevos n join viejos v on v.id = n.id
    where n.asesor_id is not null
      and n.asesor_id is distinct from v.asesor_id;
  end if;

  if v_ids is null then
    return null;
  end if;

  select nombre into v_por from public.asesores where id = v_yo;
  perform public.llamar_genesys('notificar', jsonb_build_object('lead_ids', v_ids, 'asignado_por', v_por));
  return null;
end $function$;
