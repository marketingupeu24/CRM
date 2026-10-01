-- =====================================================================
--  Aviso por WhatsApp cuando un lead se asigna desde el panel.
--  Antes solo avisaban el bot (asignación por turnos) y la reasignación
--  automática; si el admin asignaba o reasignaba desde la ficha, desde las
--  acciones masivas o al registrar un lead para otro asesor, el asesor no
--  se enteraba.
--
--  Un trigger por sentencia junta los leads que cambiaron de asesor por un
--  usuario del panel (auth.uid() no nulo) y llama a /genesys/notificar con
--  pg_net (se envía al confirmar la transacción). No avisa si el usuario se
--  asigna el lead a sí mismo; los cambios del bot y del cron (service_role,
--  sin auth.uid()) ya avisan por su cuenta.
-- =====================================================================

create or replace function public.avisar_asignacion_panel()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo   uuid := public.mi_asesor_id();
  v_ids  jsonb;
  v_por  text;
begin
  if auth.uid() is null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    select jsonb_agg(n.id) into v_ids
    from nuevos n
    where n.asesor_id is not null and n.asesor_id is distinct from v_yo;
  else
    select jsonb_agg(n.id) into v_ids
    from nuevos n join viejos v on v.id = n.id
    where n.asesor_id is not null
      and n.asesor_id is distinct from v.asesor_id
      and n.asesor_id is distinct from v_yo;
  end if;

  if v_ids is null then
    return null;
  end if;

  select nombre into v_por from public.asesores where id = v_yo;
  perform public.llamar_genesys('notificar', jsonb_build_object('lead_ids', v_ids, 'asignado_por', v_por));
  return null;
end $$;

revoke execute on function public.avisar_asignacion_panel() from public, anon, authenticated;

drop trigger if exists leads_aviso_asignacion_upd on public.leads;
create trigger leads_aviso_asignacion_upd
after update on public.leads
referencing old table as viejos new table as nuevos
for each statement execute function public.avisar_asignacion_panel();

drop trigger if exists leads_aviso_asignacion_ins on public.leads;
create trigger leads_aviso_asignacion_ins
after insert on public.leads
referencing new table as nuevos
for each statement execute function public.avisar_asignacion_panel();
