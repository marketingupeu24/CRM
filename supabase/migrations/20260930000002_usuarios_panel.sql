-- =====================================================================
--  Migración 6: ingreso al panel con USUARIO (sin correo)
--  - Cada asesor tiene un usuario: "cris", "danna.lima", ...
--  - Supabase Auth necesita un email: se usa uno interno <usuario>@crm.local
--    que nadie ve ni recibe correos. El panel solo pide usuario y contraseña.
--  - El administrador crea cuentas y restablece contraseñas desde el panel
--    (funciones security definer), sin usar la service_role key.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Usuario del panel y teléfono opcional para administradores
-- ---------------------------------------------------------------------
alter table public.asesores
  add column usuario text unique;

alter table public.asesores
  add constraint asesores_usuario_formato check (usuario is null or usuario ~ '^[a-z0-9._-]{3,40}$');

-- El administrador no recibe leads: su teléfono es opcional
alter table public.asesores alter column telefono drop not null;
alter table public.asesores
  add constraint asesores_telefono_requerido check (rol = 'admin' or telefono is not null);

comment on column public.asesores.usuario is
  'Usuario para entrar al panel (primer nombre.primer apellido). Email interno: <usuario>@crm.local';

-- Dominio interno de los emails de Auth (el panel usa el mismo valor)
create or replace function public.email_de_usuario(p_usuario text)
returns text
language sql immutable set search_path = ''
as $$
  select lower(trim(p_usuario)) || '@crm.local'
$$;

-- ---------------------------------------------------------------------
-- 2. Crear la cuenta del panel para un asesor
--    Solo el administrador (o el SQL Editor, sin sesión).
-- ---------------------------------------------------------------------
create or replace function public.crear_usuario_panel(p_asesor_id uuid, p_usuario text, p_clave text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_usuario text := lower(trim(p_usuario));
  v_email   text := public.email_de_usuario(p_usuario);
  v_user_id uuid := gen_random_uuid();
  v_asesor  public.asesores;
begin
  if auth.uid() is not null and not public.es_admin() then
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
    jsonb_build_object('usuario', v_usuario, 'nombre', v_asesor.nombre),
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
end $$;

-- ---------------------------------------------------------------------
-- 3. Restablecer la contraseña de un asesor (solo administrador)
--    Cada usuario cambia la suya desde el panel con supabase.auth.updateUser.
-- ---------------------------------------------------------------------
create or replace function public.restablecer_clave_usuario(p_asesor_id uuid, p_clave text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is not null and not public.es_admin() then
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
      updated_at = now()
  where id = v_user_id;
end $$;

revoke execute on function public.crear_usuario_panel(uuid, text, text) from public, anon;
revoke execute on function public.restablecer_clave_usuario(uuid, text) from public, anon;
grant  execute on function public.crear_usuario_panel(uuid, text, text) to authenticated;
grant  execute on function public.restablecer_clave_usuario(uuid, text) to authenticated;
