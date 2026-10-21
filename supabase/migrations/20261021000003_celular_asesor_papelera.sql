-- El celular de un usuario que está en la papelera ya no bloquea que otro asesor lo use:
-- la unicidad del celular cuenta solo entre los usuarios que no están en la papelera.
-- Al restaurar uno cuyo celular ya usa otro, se avisa con un mensaje claro.

alter table public.asesores drop constraint if exists asesores_telefono_key;
create unique index if not exists asesores_telefono_vigente_key
  on public.asesores (telefono) where eliminado_at is null;

create or replace function public.restaurar_asesor(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otro text;
begin
  if not public.puede_gestionar_usuario(p_id) then
    raise exception 'Solo un administrador puede restaurar usuarios';
  end if;
  select o.nombre into v_otro
  from public.asesores a
  join public.asesores o on o.telefono = a.telefono and o.id <> a.id and o.eliminado_at is null
  where a.id = p_id and a.telefono is not null
  limit 1;
  if v_otro is not null then
    raise exception 'No se puede restaurar: su celular ahora lo tiene %. Cambia uno de los dos números primero.', v_otro;
  end if;
  update public.asesores set eliminado_at = null where id = p_id;
end $$;
