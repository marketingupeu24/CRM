-- =====================================================================
--  QR personal de cada asesor (atención presencial).
--  El interesado escanea el QR del asesor que lo atendió: se abre WhatsApp con
--  un mensaje listo ("Me atendió <asesor>… (Cód. A-XXXXXX)") y él escribe
--  primero, sin llenar formularios. Al llegar el mensaje, el lead queda
--  asignado a ese asesor y es suyo (registrado_por: no se reasigna).
--  - asesores.codigo_qr: código fijo de cada asesor (va en el QR y en el mensaje).
--  - qr_asesor_publico(codigo): para el enlace corto /w/<codigo> (sin sesión).
--  - asignar_lead_qr_asesor(lead, codigo): lo usa Genesys al recibir el mensaje.
--  - Módulo "qr_asesor" (Mi QR): lo tienen todos por defecto.
-- =====================================================================

alter table public.asesores
  add column if not exists codigo_qr text not null default upper(substr(md5(gen_random_uuid()::text), 1, 6));
create unique index if not exists asesores_codigo_qr_key on public.asesores (codigo_qr);

-- Módulo nuevo
alter table public.asesores drop constraint if exists asesores_permisos_validos;
alter table public.asesores add constraint asesores_permisos_validos check (permisos <@ array[
  'pendientes', 'chats', 'leads', 'kanban', 'registrar', 'costos', 'actividades', 'qr_asesor', 'dashboard', 'campanas', 'exportar',
  'ver_todos', 'asignar', 'repartir', 'editar_celular', 'papelera',
  'usuarios', 'respuestas', 'gestionar_campanas', 'conocimiento'
]);
alter table public.asesores alter column permisos
  set default '{pendientes,chats,leads,kanban,registrar,costos,actividades,qr_asesor,dashboard,campanas,exportar}'::text[];
update public.asesores set permisos = array_append(permisos, 'qr_asesor') where not ('qr_asesor' = any (permisos));

-- ---------------------------------------------------------------------
-- Enlace público del QR: nombre corto del asesor y número de Genesys
-- ---------------------------------------------------------------------
create or replace function public.qr_asesor_publico(p_codigo text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'codigo', a.codigo_qr,
    'nombre', array_to_string((regexp_split_to_array(trim(a.nombre), '\s+'))[1:2], ' '),
    'whatsapp', (select valor from public.ajustes where clave = 'whatsapp_genesys')
  )
  from public.asesores a
  where a.codigo_qr = upper(trim(p_codigo)) and a.eliminado_at is null
$$;
revoke execute on function public.qr_asesor_publico(text) from public;
grant execute on function public.qr_asesor_publico(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Genesys: el mensaje trae el código del QR de un asesor
-- ---------------------------------------------------------------------
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
      estado         = case when estado in ('lead_nuevo', 'lead_en_conversacion', 'lead_interesado', 'lead_no_interesado', 'lead_perdido')
                            then 'lead_asignado'::public.lead_estado else estado end,
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
revoke execute on function public.asignar_lead_qr_asesor(uuid, text) from public, anon, authenticated;
grant execute on function public.asignar_lead_qr_asesor(uuid, text) to service_role;
