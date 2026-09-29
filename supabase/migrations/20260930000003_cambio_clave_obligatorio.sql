-- =====================================================================
--  Migración 7: cambio de contraseña obligatorio en el primer ingreso
--  Cuando el admin crea o restablece una cuenta (por ejemplo, con el DNI como
--  contraseña), puede marcar debe_cambiar_clave: el panel pedirá una nueva
--  contraseña antes de dejar trabajar al usuario.
-- =====================================================================

drop function public.crear_usuario_panel(uuid, text, text);
drop function public.restablecer_clave_usuario(uuid, text);

create function public.crear_usuario_panel(
  p_asesor_id    uuid,
  p_usuario      text,
  p_clave        text,
  p_debe_cambiar boolean default true
)
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
end $$;

create function public.restablecer_clave_usuario(
  p_asesor_id    uuid,
  p_clave        text,
  p_debe_cambiar boolean default true
)
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
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                           || jsonb_build_object('debe_cambiar_clave', p_debe_cambiar),
      updated_at = now()
  where id = v_user_id;
end $$;

revoke execute on function public.crear_usuario_panel(uuid, text, text, boolean) from public, anon;
revoke execute on function public.restablecer_clave_usuario(uuid, text, boolean) from public, anon;
grant  execute on function public.crear_usuario_panel(uuid, text, text, boolean) to authenticated;
grant  execute on function public.restablecer_clave_usuario(uuid, text, boolean) to authenticated;
