-- =====================================================================
--  Super admin y módulos (permisos por usuario).
--  - asesores.superadmin: acceso a todo, y es el único que asigna permisos.
--  - asesores.permisos: módulos que el usuario puede ver/usar.
--    Trabajo diario: pendientes, chats, leads, kanban, registrar
--    Análisis:       dashboard, campanas, exportar
--    Gestión:        ver_todos (leads de todo el equipo), asignar, editar_celular, papelera
--    Administración: usuarios, respuestas, gestionar_campanas
--  - tiene_permiso(modulo) reemplaza a es_admin() en las funciones y en el
--    RLS; es_admin() queda como sinónimo de es_superadmin().
--  - Solo el super admin cambia permisos o el rol de super admin, y siempre
--    queda al menos uno. Un usuario con "usuarios" no puede tocar a un super admin.
--  Las funciones y políticas de la parte final se generaron a partir de su
--  definición vigente, cambiando es_admin() por el permiso correspondiente.
-- =====================================================================

alter table public.asesores
  add column if not exists superadmin boolean not null default false,
  add column if not exists permisos text[] not null
    default '{pendientes,chats,leads,kanban,registrar,dashboard,campanas,exportar}';

alter table public.asesores drop constraint if exists asesores_permisos_validos;
alter table public.asesores add constraint asesores_permisos_validos check (permisos <@ array[
  'pendientes', 'chats', 'leads', 'kanban', 'registrar',
  'dashboard', 'campanas', 'exportar',
  'ver_todos', 'asignar', 'editar_celular', 'papelera',
  'usuarios', 'respuestas', 'gestionar_campanas'
]::text[]);

comment on column public.asesores.superadmin is 'Acceso total; único que asigna permisos.';
comment on column public.asesores.permisos is 'Módulos del panel que el usuario puede ver/usar.';

-- Los administradores actuales conservan todo; el usuario "cris" es el super admin
update public.asesores set permisos = array[
  'pendientes', 'chats', 'leads', 'kanban', 'registrar', 'dashboard', 'campanas', 'exportar',
  'ver_todos', 'asignar', 'editar_celular', 'papelera', 'usuarios', 'respuestas', 'gestionar_campanas'
]::text[] where rol = 'admin';
update public.asesores set superadmin = true where usuario = 'cris';
-- Si no existe "cris" (bases nuevas), el primer administrador es super admin
update public.asesores set superadmin = true
where id = (select id from public.asesores where rol = 'admin' and eliminado_at is null order by created_at limit 1)
  and not exists (select 1 from public.asesores where superadmin);

create or replace function public.es_superadmin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select superadmin from public.asesores where user_id = auth.uid() and eliminado_at is null), false)
$$;

create or replace function public.tiene_permiso(p_modulo text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select superadmin or p_modulo = any (permisos)
    from public.asesores where user_id = auth.uid() and eliminado_at is null
  ), false)
$$;

-- Gestionar a un usuario: permiso "usuarios", y si el usuario es super admin, solo otro super admin
create or replace function public.puede_gestionar_usuario(p_asesor_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.tiene_permiso('usuarios')
     and (public.es_superadmin() or not coalesce((select superadmin from public.asesores where id = p_asesor_id), false))
$$;

-- es_admin() queda como super admin (lo que no se migró a un permiso, solo lo hace el super admin)
create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.es_superadmin()
$$;

revoke execute on function public.es_superadmin(), public.tiene_permiso(text), public.puede_gestionar_usuario(uuid) from public, anon;
grant execute on function public.es_superadmin(), public.tiene_permiso(text), public.puede_gestionar_usuario(uuid) to authenticated;

-- Solo el super admin cambia permisos / super admin; nunca se queda el sistema sin super admin
create or replace function public.proteger_permisos()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (new.permisos is distinct from old.permisos or new.superadmin is distinct from old.superadmin)
     and not public.es_superadmin() then
    raise exception 'Solo el super admin puede cambiar permisos';
  end if;
  if old.superadmin and (not new.superadmin or new.eliminado_at is not null)
     and not exists (select 1 from public.asesores where superadmin and eliminado_at is null and id <> old.id) then
    raise exception 'Debe quedar al menos un super admin';
  end if;
  return new;
end $$;

drop trigger if exists asesores_proteger_permisos on public.asesores;
create trigger asesores_proteger_permisos
before update on public.asesores
for each row execute function public.proteger_permisos();

-- Ver la lista de asesores: el propio perfil, o quien administra usuarios, ve todos los leads o asigna
drop policy if exists "asesores: ver el propio perfil o admin ve todos" on public.asesores;
create policy "asesores: ver el propio perfil o admin ve todos"
on public.asesores for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.tiene_permiso('usuarios'))
  or (select public.tiene_permiso('ver_todos'))
  or (select public.tiene_permiso('asignar'))
);

-- Super admin: guarda los permisos de un usuario
create or replace function public.guardar_permisos(p_asesor_id uuid, p_permisos text[], p_superadmin boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el super admin puede cambiar permisos';
  end if;
  update public.asesores
  set permisos = (select coalesce(array_agg(distinct m order by m), '{}') from unnest(p_permisos) m),
      superadmin = coalesce(p_superadmin, false)
  where id = p_asesor_id and eliminado_at is null;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;
end $$;

revoke execute on function public.guardar_permisos(uuid, text[], boolean) from public, anon;
grant execute on function public.guardar_permisos(uuid, text[], boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Funciones y políticas: es_admin() -> permiso del módulo (generado)
-- ---------------------------------------------------------------------

-- papelera: 1 uso(s) de es_admin() -> public.tiene_permiso('papelera')
CREATE OR REPLACE FUNCTION public.papelera()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.tiene_permiso('papelera') then
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
end $function$;

-- eliminar_leads: 1 uso(s) de es_admin() -> public.tiene_permiso('papelera')
CREATE OR REPLACE FUNCTION public.eliminar_leads(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_yo uuid := public.mi_asesor_id();
  v_n  int;
begin
  if not public.tiene_permiso('papelera') then
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
end $function$;

-- restaurar_leads: 1 uso(s) de es_admin() -> public.tiene_permiso('papelera')
CREATE OR REPLACE FUNCTION public.restaurar_leads(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_yo uuid := public.mi_asesor_id();
  v_n  int;
begin
  if not public.tiene_permiso('papelera') then
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
end $function$;

-- borrar_leads_definitivo: 1 uso(s) de es_admin() -> public.tiene_permiso('papelera')
CREATE OR REPLACE FUNCTION public.borrar_leads_definitivo(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n int;
begin
  if not public.tiene_permiso('papelera') then
    raise exception 'Solo un administrador puede borrar leads';
  end if;
  with borrados as (
    delete from public.leads where id = any (p_ids) and eliminado_at is not null returning id
  )
  select count(*)::int into v_n from borrados;
  return v_n;
end $function$;

-- eliminar_asesor: 1 uso(s) de es_admin() -> public.puede_gestionar_usuario(p_id)
CREATE OR REPLACE FUNCTION public.eliminar_asesor(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_abiertos int;
begin
  if not public.puede_gestionar_usuario(p_id) then
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
end $function$;

-- restaurar_asesor: 1 uso(s) de es_admin() -> public.puede_gestionar_usuario(p_id)
CREATE OR REPLACE FUNCTION public.restaurar_asesor(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.puede_gestionar_usuario(p_id) then
    raise exception 'Solo un administrador puede restaurar usuarios';
  end if;
  update public.asesores set eliminado_at = null where id = p_id;
end $function$;

-- borrar_asesor_definitivo: 1 uso(s) de es_admin() -> public.puede_gestionar_usuario(p_id)
CREATE OR REPLACE FUNCTION public.borrar_asesor_definitivo(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid;
  v_leads int;
begin
  if not public.puede_gestionar_usuario(p_id) then
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
end $function$;

-- crear_usuario_panel: 1 uso(s) de es_admin() -> public.puede_gestionar_usuario(p_asesor_id)
CREATE OR REPLACE FUNCTION public.crear_usuario_panel(p_asesor_id uuid, p_usuario text, p_clave text, p_debe_cambiar boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_usuario text := lower(trim(p_usuario));
  v_email   text := public.email_de_usuario(p_usuario);
  v_user_id uuid := gen_random_uuid();
  v_asesor  public.asesores;
begin
  if auth.uid() is not null and not public.puede_gestionar_usuario(p_asesor_id) then
    raise exception 'Solo un administrador puede crear usuarios';
  end if;
  if v_usuario !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'Usuario no válido: usa minúsculas, números y puntos (ej. danna.lima)';
  end if;
  if length(coalesce(p_clave, '')) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;

  select * into v_asesor from public.asesores where id = p_asesor_id for update;
  if not found then
    raise exception 'Asesor % no existe', p_asesor_id;
  end if;
  if v_asesor.user_id is not null then
    raise exception 'El asesor % ya tiene usuario', v_asesor.nombre;
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'El usuario % ya existe', v_usuario;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_clave, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('usuario', v_usuario, 'nombre', v_asesor.nombre, 'debe_cambiar_clave', p_debe_cambiar),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  update public.asesores set user_id = v_user_id, usuario = v_usuario where id = p_asesor_id;
  return v_user_id;
end $function$;

-- restablecer_clave_usuario: 1 uso(s) de es_admin() -> public.puede_gestionar_usuario(p_asesor_id)
CREATE OR REPLACE FUNCTION public.restablecer_clave_usuario(p_asesor_id uuid, p_clave text, p_debe_cambiar boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
begin
  if auth.uid() is not null and not public.puede_gestionar_usuario(p_asesor_id) then
    raise exception 'Solo un administrador puede restablecer contraseñas';
  end if;
  if length(coalesce(p_clave, '')) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;

  select user_id into v_user_id from public.asesores where id = p_asesor_id;
  if v_user_id is null then
    raise exception 'El asesor no tiene usuario del panel';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                           || jsonb_build_object('debe_cambiar_clave', p_debe_cambiar),
      updated_at = now()
  where id = v_user_id;
end $function$;

-- fn_leads_before_update: 1 uso(s) de es_admin() -> public.tiene_permiso('asignar')
CREATE OR REPLACE FUNCTION public.fn_leads_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
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

  if new.asesor_id is not null and new.fecha_asignado is null then
    new.fecha_asignado := now();
  end if;

  return new;
end $function$;

-- registrar_lead_manual: 3 uso(s) de es_admin() -> public.tiene_permiso('asignar')
CREATE OR REPLACE FUNCTION public.registrar_lead_manual(p_nombre text, p_telefono text DEFAULT NULL::text, p_dni text DEFAULT NULL::text, p_carrera text DEFAULT NULL::text, p_modalidad text DEFAULT NULL::text, p_programa text DEFAULT 'pregrado'::text, p_convocatoria text DEFAULT NULL::text, p_observacion text DEFAULT NULL::text, p_asesor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_yo        uuid := public.mi_asesor_id();
  v_asesor_id uuid;
  v_telefono  text := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');
  v_dni       text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_res       jsonb;
begin
  if v_yo is null or not public.tiene_permiso('registrar') then
    raise exception 'Solo asesores o administradores pueden registrar leads';
  end if;
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre es obligatorio';
  end if;
  if v_telefono is null then
    raise exception 'El celular es obligatorio';
  end if;
  -- Celular peruano de 9 dígitos -> agrega el código de país
  if v_telefono ~ '^9[0-9]{8}$' then
    v_telefono := '51' || v_telefono;
  end if;

  v_asesor_id := case when public.tiene_permiso('asignar') then p_asesor_id else v_yo end;

  -- Un asesor no puede tomar ni modificar un lead que ya es de otro asesor
  if not public.tiene_permiso('asignar') and exists (
    select 1 from public.leads
    where (telefono = v_telefono or (v_dni is not null and dni = v_dni))
      and asesor_id is not null and asesor_id <> v_yo
  ) then
    return jsonb_build_object('status', 'duplicate', 'mensaje', 'Este lead ya está registrado con otro asesor');
  end if;

  v_res := public.procesar_lead(
    p_telefono     => v_telefono,
    p_dni          => v_dni,
    p_nombre       => trim(p_nombre),
    p_carrera      => nullif(trim(p_carrera), ''),
    p_modalidad    => nullif(trim(p_modalidad), ''),
    p_programa     => coalesce(p_programa, 'pregrado'),
    p_convocatoria => nullif(trim(p_convocatoria), ''),
    p_origen       => 'manual',
    p_asesor_id    => v_asesor_id,
    p_asignar      => true,
    p_notificar    => false
  );

  if v_res->>'status' in ('success', 'updated') and nullif(trim(p_observacion), '') is not null then
    insert into public.lead_interacciones (lead_id, tipo, contenido, autor_id)
    values ((v_res->>'lead_id')::uuid, 'nota_asesor', trim(p_observacion), v_yo);
  end if;

  -- Si el lead ya existía y es de otro asesor, no se revelan sus datos
  if v_res->>'status' = 'duplicate' and not public.tiene_permiso('asignar')
     and (v_res->>'asesor_id') is distinct from v_yo::text then
    return jsonb_build_object('status', 'duplicate', 'mensaje', 'Este lead ya está registrado con otro asesor');
  end if;

  return v_res;
end $function$;

-- Políticas
alter policy "asesores: solo admin crea" on public.asesores
  with check ((select public.tiene_permiso('usuarios')));
alter policy "asesores: solo admin edita" on public.asesores
  using ((select public.puede_gestionar_usuario(id)))
  with check ((select public.puede_gestionar_usuario(id)));
alter policy "asesores: solo admin elimina" on public.asesores
  using ((select public.es_superadmin()));
alter policy "campanas: solo admin crea" on public.campanas
  with check ((select public.tiene_permiso('gestionar_campanas')));
alter policy "campanas: solo admin edita" on public.campanas
  using ((select public.tiene_permiso('gestionar_campanas')))
  with check ((select public.tiene_permiso('gestionar_campanas')));
alter policy "campanas: solo admin elimina" on public.campanas
  using ((select public.tiene_permiso('gestionar_campanas')));
alter policy "interacciones: borrar notas propias o admin" on public.lead_interacciones
  using (((tipo = 'nota_asesor'::interaccion_tipo) AND ((autor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos')))));
alter policy "interacciones: el asesor agrega notas a sus leads" on public.lead_interacciones
  with check (((tipo = 'nota_asesor'::interaccion_tipo) AND (autor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) AND (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_interacciones.lead_id) AND ((l.asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos'))))))));
alter policy "interacciones: ver el historial de los leads visibles" on public.lead_interacciones
  using ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_interacciones.lead_id) AND ((l.asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos')))))));
alter policy "leads: asesor edita los suyos, admin edita todos" on public.leads
  using (((eliminado_at IS NULL) AND ((asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos')))))
  with check (((asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos'))));
alter policy "leads: asesor ve los suyos, admin ve todos" on public.leads
  using (((eliminado_at IS NULL) AND ((asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos')))));
alter policy "leads: solo admin crea" on public.leads
  with check ((select public.es_superadmin()));
alter policy "leads: solo admin elimina" on public.leads
  using ((select public.es_superadmin()));
alter policy "respuestas: solo admin crea" on public.respuestas_rapidas
  with check ((select public.tiene_permiso('respuestas')));
alter policy "respuestas: solo admin edita" on public.respuestas_rapidas
  using ((select public.tiene_permiso('respuestas')))
  with check ((select public.tiene_permiso('respuestas')));
alter policy "respuestas: solo admin elimina" on public.respuestas_rapidas
  using ((select public.tiene_permiso('respuestas')));
alter policy "tareas: crear sobre leads visibles" on public.tareas
  with check (((creada_por = ( SELECT mi_asesor_id() AS mi_asesor_id)) AND ((asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos'))) AND (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = tareas.lead_id) AND ((l.asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos'))))))));
alter policy "tareas: el responsable o el admin las eliminan" on public.tareas
  using (((asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos'))));
alter policy "tareas: el responsable o el admin las modifican" on public.tareas
  using (((asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos'))))
  with check (((asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos'))));
alter policy "tareas: el responsable o el admin las ven" on public.tareas
  using (((asesor_id = ( SELECT mi_asesor_id() AS mi_asesor_id)) OR (select public.tiene_permiso('ver_todos'))));
