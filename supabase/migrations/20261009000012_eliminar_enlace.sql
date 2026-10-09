-- Borrar un enlace o QR por medio (si te equivocaste): solo si ningún lead llegó por él.
-- Con leads, se desactiva en vez de borrarse (se perdería de dónde vinieron).
create or replace function public.eliminar_enlace(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_leads int;
begin
  if not public.tiene_permiso('gestionar_campanas') then
    raise exception 'No tienes permiso para borrar enlaces';
  end if;
  select count(*) into v_leads from public.leads where enlace_origen_id = p_id;
  if v_leads > 0 then
    raise exception 'Este enlace ya trajo % lead(s): desactívalo en vez de borrarlo', v_leads;
  end if;
  delete from public.enlaces_origen where id = p_id;
end $$;
revoke execute on function public.eliminar_enlace(bigint) from public, anon;
grant execute on function public.eliminar_enlace(bigint) to authenticated;
