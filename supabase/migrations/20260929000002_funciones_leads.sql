-- =====================================================================
--  Migración 2: funciones y triggers del CRM de leads
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Funciones auxiliares para RLS (quién es el usuario del panel)
--    security definer: leen asesores sin quedar bloqueadas por el propio RLS.
-- ---------------------------------------------------------------------
create or replace function public.mi_asesor_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.asesores where user_id = auth.uid()
$$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.asesores where user_id = auth.uid() and rol = 'admin'
  )
$$;

-- ---------------------------------------------------------------------
-- 2. Antes de actualizar un lead: updated_at, fechas del embudo y reglas
-- ---------------------------------------------------------------------
create or replace function public.fn_leads_before_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Desde el panel, solo el administrador puede reasignar leads.
  -- (El bot y el SQL Editor no tienen auth.uid(), por eso quedan permitidos.)
  if auth.uid() is not null
     and not public.es_admin()
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

  if new.asesor_id is not null and new.fecha_asignado is null then
    new.fecha_asignado := now();
  end if;

  return new;
end $$;

create trigger trg_leads_before_update
before update on public.leads
for each row execute function public.fn_leads_before_update();

-- ---------------------------------------------------------------------
-- 3. Después de actualizar: registrar el cambio de estado en el historial
--    security definer: el asesor no puede insertar 'cambio_estado' directamente.
-- ---------------------------------------------------------------------
create or replace function public.fn_leads_log_estado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    insert into public.lead_interacciones (lead_id, tipo, contenido, autor_id)
    values (new.id, 'cambio_estado', old.estado || ' -> ' || new.estado, public.mi_asesor_id());
  end if;
  return new;
end $$;

create trigger trg_leads_log_estado
after update on public.leads
for each row execute function public.fn_leads_log_estado();

-- ---------------------------------------------------------------------
-- 4. Registrar lead cuando escribe (crea el lead o actualiza su último contacto)
--    Nunca baja el estado de un lead existente. El teléfono es único: no hay duplicados.
-- ---------------------------------------------------------------------
create or replace function public.registrar_lead(p_telefono text, p_mensaje text default null)
returns public.leads
language plpgsql set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  insert into public.leads (telefono, total_mensajes)
  values (p_telefono, 1)
  on conflict (telefono) do update
    set ultimo_contacto = now(),
        total_mensajes  = public.leads.total_mensajes + 1
  returning * into v_lead;

  if p_mensaje is not null then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'mensaje_lead', p_mensaje);
  end if;

  return v_lead;
end $$;

-- ---------------------------------------------------------------------
-- 5. Asignar asesor al lead (por carrera + por turnos / round-robin)
--    - Solo asesores activos con rol 'asesor' reciben leads.
--    - Si ningún asesor tiene la carrera, va al asesor activo con más tiempo sin leads.
--    - Si el lead ya tiene asesor, devuelve el mismo (no reasigna).
-- ---------------------------------------------------------------------
create or replace function public.asignar_asesor_lead(p_lead_id uuid)
returns public.asesores
language plpgsql set search_path = ''
as $$
declare
  v_lead   public.leads;
  v_asesor public.asesores;
begin
  -- Bloquea el lead para que dos llamadas simultáneas no lo asignen dos veces
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead % no existe', p_lead_id;
  end if;

  if v_lead.asesor_id is not null then
    select * into v_asesor from public.asesores where id = v_lead.asesor_id;
    return v_asesor;
  end if;

  select * into v_asesor
  from public.asesores
  where activo and rol = 'asesor' and v_lead.carrera_interes = any (carreras)
  order by ultimo_lead_asignado nulls first, created_at
  limit 1
  for update skip locked;

  if v_asesor.id is null then
    select * into v_asesor
    from public.asesores
    where activo and rol = 'asesor'
    order by ultimo_lead_asignado nulls first, created_at
    limit 1
    for update skip locked;
  end if;

  if v_asesor.id is null then
    raise exception 'No hay asesores activos para asignar leads';
  end if;

  update public.asesores set ultimo_lead_asignado = now() where id = v_asesor.id;
  update public.leads set asesor_id = v_asesor.id, estado = 'lead_asignado' where id = p_lead_id;

  return v_asesor;
end $$;

-- ---------------------------------------------------------------------
-- 6. Vincular la cuenta del panel (auth.users) con el asesor por email
--    Funciona en ambos órdenes: crear primero el asesor o primero el usuario.
-- ---------------------------------------------------------------------
create or replace function public.fn_vincular_usuario_nuevo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.asesores
  set user_id = new.id
  where user_id is null and lower(email) = lower(new.email);
  return new;
end $$;

create trigger trg_vincular_usuario_nuevo
after insert on auth.users
for each row execute function public.fn_vincular_usuario_nuevo();

create or replace function public.fn_vincular_asesor_nuevo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is null and new.email is not null then
    select id into new.user_id from auth.users where lower(email) = lower(new.email);
  end if;
  return new;
end $$;

create trigger trg_vincular_asesor_nuevo
before insert or update of email on public.asesores
for each row execute function public.fn_vincular_asesor_nuevo();

-- ---------------------------------------------------------------------
-- 7. Permisos de ejecución: las funciones del bot solo con service_role
-- ---------------------------------------------------------------------
revoke execute on function public.registrar_lead(text, text)  from public, anon, authenticated;
revoke execute on function public.asignar_asesor_lead(uuid)   from public, anon, authenticated;
grant  execute on function public.registrar_lead(text, text)  to service_role;
grant  execute on function public.asignar_asesor_lead(uuid)   to service_role;

revoke execute on function public.fn_vincular_usuario_nuevo() from public, anon, authenticated;
revoke execute on function public.fn_vincular_asesor_nuevo()  from public, anon, authenticated;
revoke execute on function public.fn_leads_log_estado()       from public, anon, authenticated;
