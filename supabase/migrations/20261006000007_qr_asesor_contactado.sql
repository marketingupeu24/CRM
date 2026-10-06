-- =====================================================================
--  QR del asesor: es para capturar los datos de quien se atiende en persona.
--  Al escanear, el lead queda "contactado" (el asesor ya lo está atendiendo;
--  el bot no interrumpe) en vez de "asignado" esperando que le escriban.
-- =====================================================================

create or replace function public.asignar_lead_qr_asesor(p_lead_id uuid, p_codigo text)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_lead    public.leads;
  v_asesor  public.asesores;
  v_actual  public.asesores;
begin
  select * into v_asesor from public.asesores where codigo_qr = upper(trim(p_codigo)) and eliminado_at is null;
  if v_asesor.id is null then
    return jsonb_build_object('asignado', false, 'motivo', 'código desconocido');
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then
    return jsonb_build_object('asignado', false, 'motivo', 'lead desconocido');
  end if;

  -- Ya tiene asesor: se respeta (si es otro, queda anotado)
  if v_lead.asesor_id is not null then
    if v_lead.asesor_id <> v_asesor.id then
      select * into v_actual from public.asesores where id = v_lead.asesor_id;
      insert into public.lead_interacciones (lead_id, tipo, contenido)
      values (v_lead.id, 'sistema', 'Escaneó el QR de ' || v_asesor.nombre || ', pero ya es lead de ' || coalesce(v_actual.nombre, 'otro asesor') || ': no se cambió');
    end if;
    return jsonb_build_object('asignado', false, 'motivo', 'ya tenía asesor', 'asesor_id', v_lead.asesor_id);
  end if;

  perform set_config('crm.asignacion_sistema', 'on', true);
  update public.leads
  set asesor_id      = v_asesor.id,
      registrado_por = v_asesor.id,
      -- El asesor lo está atendiendo en persona: ya está contactado (el bot no interrumpe por 5 h)
      estado         = case when estado in ('lead_nuevo', 'lead_en_conversacion', 'lead_interesado', 'lead_no_interesado', 'lead_perdido', 'lead_asignado')
                            then 'lead_contactado'::public.lead_estado else estado end,
      origen         = 'manual',
      origen_campana = coalesce(origen_campana, 'Presencial (QR del asesor)'),
      eliminado_at   = null,
      eliminado_por  = null
  where id = v_lead.id;
  update public.asesores set ultimo_lead_asignado = now() where id = v_asesor.id;
  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead.id, 'sistema', 'Escaneó el QR personal de ' || v_asesor.nombre || ' (atención presencial): es su lead');

  return jsonb_build_object(
    'asignado', true, 'asesor_id', v_asesor.id, 'asesor_nombre', v_asesor.nombre, 'asesor_telefono', v_asesor.telefono
  );
end $$;
