-- =====================================================================
--  Papelera de leads y usuarios (borrado suave).
--  - leads.eliminado_at / asesores.eliminado_at: el registro sigue en la base
--    pero desaparece del panel (RLS) hasta que el admin lo restaure.
--  - Un usuario en la papelera no puede entrar al panel (mi_asesor_id y
--    es_admin dejan de reconocerlo) ni recibe leads.
--  - Un lead en la papelera que vuelve a escribir se sigue guardando (Genesys
--    le responde normal) pero no avisa a ningún asesor ni se reasigna.
--  - Si el admin lo registra a mano de nuevo, sale de la papelera.
--  Funciones (solo admin): papelera(), eliminar_leads, restaurar_leads,
--  borrar_leads_definitivo, eliminar_asesor, restaurar_asesor,
--  borrar_asesor_definitivo.
-- =====================================================================

alter table public.leads
  add column if not exists eliminado_at  timestamptz,
  add column if not exists eliminado_por uuid references public.asesores (id) on delete set null;
alter table public.asesores
  add column if not exists eliminado_at timestamptz;

create index if not exists leads_eliminado_idx on public.leads (eliminado_at) where eliminado_at is not null;

-- Un usuario en la papelera deja de existir para el panel
create or replace function public.mi_asesor_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.asesores where user_id = auth.uid() and eliminado_at is null
$$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.asesores where user_id = auth.uid() and rol = 'admin' and eliminado_at is null
  )
$$;

-- Los leads en la papelera no se ven ni se editan desde el panel
drop policy if exists "leads: asesor ve los suyos, admin ve todos" on public.leads;
create policy "leads: asesor ve los suyos, admin ve todos"
on public.leads for select to authenticated
using (eliminado_at is null and (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin())));

drop policy if exists "leads: asesor edita los suyos, admin edita todos" on public.leads;
create policy "leads: asesor edita los suyos, admin edita todos"
on public.leads for update to authenticated
using (eliminado_at is null and (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin())))
with check (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()));

-- Registrar a mano un lead que estaba en la papelera lo restaura
create or replace function public.restaurar_lead_al_registrar()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.eliminado_at is not null and new.eliminado_at is not null
     and auth.uid() is not null and current_setting('crm.papelera', true) is distinct from 'si' then
    new.eliminado_at := null;
    new.eliminado_por := null;
  end if;
  return new;
end $$;

drop trigger if exists leads_restaurar_al_registrar on public.leads;
create trigger leads_restaurar_al_registrar
before update on public.leads
for each row execute function public.restaurar_lead_al_registrar();

-- ---------------------------------------------------------------------
-- Funciones de la papelera (solo admin)
-- ---------------------------------------------------------------------
create or replace function public.papelera()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede ver la papelera';
  end if;
  return jsonb_build_object(
    'leads', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'nombre', l.nombre, 'telefono', l.telefono, 'dni', l.dni, 'estado', l.estado,
        'carrera', coalesce(l.carrera_interes, l.modalidad), 'asesor', a.nombre,
        'eliminado_at', l.eliminado_at, 'eliminado_por', e.nombre, 'ultimo_contacto', l.ultimo_contacto,
        'escribio_despues', l.ultimo_contacto > l.eliminado_at
      ) order by l.eliminado_at desc), '[]'::jsonb)
      from public.leads l
      left join public.asesores a on a.id = l.asesor_id
      left join public.asesores e on e.id = l.eliminado_por
      where l.eliminado_at is not null
    ),
    'asesores', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'nombre', s.nombre, 'telefono', s.telefono, 'usuario', s.usuario, 'rol', s.rol,
        'eliminado_at', s.eliminado_at,
        'leads', (select count(*)::int from public.leads where asesor_id = s.id)
      ) order by s.eliminado_at desc), '[]'::jsonb)
      from public.asesores s
      where s.eliminado_at is not null
    )
  );
end $$;

create or replace function public.eliminar_leads(p_ids uuid[])
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo uuid := public.mi_asesor_id();
  v_n  int;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede eliminar leads';
  end if;
  perform set_config('crm.papelera', 'si', true);
  with cambiados as (
    update public.leads set eliminado_at = now(), eliminado_por = v_yo
    where id = any (p_ids) and eliminado_at is null
    returning id
  ), historial as (
    insert into public.lead_interacciones (lead_id, tipo, contenido, autor_id)
    select id, 'sistema', 'Enviado a la papelera', v_yo from cambiados
  )
  select count(*)::int into v_n from cambiados;
  return v_n;
end $$;

create or replace function public.restaurar_leads(p_ids uuid[])
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo uuid := public.mi_asesor_id();
  v_n  int;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede restaurar leads';
  end if;
  with cambiados as (
    update public.leads set eliminado_at = null, eliminado_por = null
    where id = any (p_ids) and eliminado_at is not null
    returning id
  ), historial as (
    insert into public.lead_interacciones (lead_id, tipo, contenido, autor_id)
    select id, 'sistema', 'Restaurado de la papelera', v_yo from cambiados
  )
  select count(*)::int into v_n from cambiados;
  return v_n;
end $$;

-- Borra para siempre (con su conversación y tareas). Solo leads que ya están en la papelera.
create or replace function public.borrar_leads_definitivo(p_ids uuid[])
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede borrar leads';
  end if;
  with borrados as (
    delete from public.leads where id = any (p_ids) and eliminado_at is not null returning id
  )
  select count(*)::int into v_n from borrados;
  return v_n;
end $$;

-- Usuario a la papelera: no entra al panel ni recibe leads. Exige que no tenga leads abiertos.
create or replace function public.eliminar_asesor(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_abiertos int;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede eliminar usuarios';
  end if;
  if p_id = public.mi_asesor_id() then
    raise exception 'No puedes enviarte a ti mismo a la papelera';
  end if;
  select count(*) into v_abiertos from public.leads
  where asesor_id = p_id and eliminado_at is null
    and estado not in ('lead_matriculado', 'lead_perdido', 'lead_no_interesado');
  if v_abiertos > 0 then
    raise exception 'Tiene % lead(s) abiertos. Reasígnalos primero (Leads → filtro por asesor → Asignar a…) o envíalos a la papelera.', v_abiertos;
  end if;
  update public.asesores set eliminado_at = now(), activo = false where id = p_id and eliminado_at is null;
end $$;

-- Al restaurar queda inactivo: el admin decide cuándo vuelve a recibir leads
create or replace function public.restaurar_asesor(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede restaurar usuarios';
  end if;
  update public.asesores set eliminado_at = null where id = p_id;
end $$;

-- Borra para siempre el usuario y su cuenta de acceso. Solo si ningún lead lo tiene como asesor.
create or replace function public.borrar_asesor_definitivo(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_leads int;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede borrar usuarios';
  end if;
  select user_id into v_user from public.asesores where id = p_id and eliminado_at is not null;
  if not found then
    raise exception 'Primero envía el usuario a la papelera';
  end if;
  select count(*) into v_leads from public.leads where asesor_id = p_id;
  if v_leads > 0 then
    raise exception 'Todavía tiene % lead(s) a su nombre (incluidos los de la papelera). Reasígnalos o bórralos antes.', v_leads;
  end if;
  delete from public.asesores where id = p_id;
  if v_user is not null then
    delete from auth.users where id = v_user;
  end if;
end $$;

revoke execute on function public.papelera(), public.eliminar_leads(uuid[]), public.restaurar_leads(uuid[]),
  public.borrar_leads_definitivo(uuid[]), public.eliminar_asesor(uuid), public.restaurar_asesor(uuid),
  public.borrar_asesor_definitivo(uuid) from public, anon;
grant execute on function public.papelera(), public.eliminar_leads(uuid[]), public.restaurar_leads(uuid[]),
  public.borrar_leads_definitivo(uuid[]), public.eliminar_asesor(uuid), public.restaurar_asesor(uuid),
  public.borrar_asesor_definitivo(uuid) to authenticated;

-- La reasignación automática ignora los leads en la papelera
create or replace function public.reasignar_sin_contacto(p_horas int default 4, p_maximo int default 2, p_solo_horario boolean default true)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_lead      public.leads;
  v_anterior  public.asesores;
  v_nuevo     public.asesores;
  v_cambios   jsonb := '[]'::jsonb;
begin
  -- Solo en horario de oficina (8:00 a 20:00 en Lima)
  if p_solo_horario and extract(hour from now() at time zone 'America/Lima') not between 8 and 19 then
    return v_cambios;
  end if;

  perform set_config('crm.asignacion_sistema', 'on', true);

  for v_lead in
    select * from public.leads
    where estado = 'lead_asignado'
      and eliminado_at is null
      and asesor_id is not null
      and primer_contacto_asesor_at is null
      and fecha_asignado < now() - make_interval(hours => p_horas)
      and reasignaciones < p_maximo
    order by fecha_asignado
    for update skip locked
  loop
    select * into v_anterior from public.asesores where id = v_lead.asesor_id;

    -- Mismo reparto que asignar_asesor_lead, sin el asesor actual
    select * into v_nuevo from public.asesores
    where activo and rol = 'asesor' and id <> v_lead.asesor_id
      and case when v_lead.programa = 'cepre' then 'CEPRE' = any (carreras)
               else v_lead.carrera_interes = any (carreras) end
    order by ultimo_lead_asignado nulls first, created_at, nombre
    limit 1 for update skip locked;

    if v_nuevo.id is null then
      select * into v_nuevo from public.asesores
      where activo and rol = 'asesor' and id <> v_lead.asesor_id and carreras = '{}'
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
            format('Reasignado automáticamente de %s a %s: no fue contactado en %s h', v_anterior.nombre, v_nuevo.nombre, p_horas));

    v_cambios := v_cambios || jsonb_build_object(
      'lead_id', v_lead.id, 'asesor_anterior', v_anterior.nombre,
      'asesor_nuevo', v_nuevo.nombre, 'asesor_telefono', v_nuevo.telefono);
  end loop;

  return v_cambios;
end $$;
