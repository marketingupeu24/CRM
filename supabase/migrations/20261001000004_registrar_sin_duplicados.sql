-- =====================================================================
--  Migración 15: el mismo mensaje no se guarda dos veces
--  El mensaje del lead puede llegar por dos caminos (webhook de BuilderBot y bloque
--  HTTP /registrar del flujo). Si llega el mismo texto del mismo lead en menos de
--  1 minuto, se guarda una sola vez.
-- =====================================================================

create or replace function public.registrar_lead(p_telefono text, p_mensaje text default null)
returns public.leads
language plpgsql set search_path = ''
as $$
declare
  v_lead      public.leads;
  v_repetido  boolean := false;
begin
  select * into v_lead from public.leads where telefono = p_telefono for update;

  if v_lead.id is not null and p_mensaje is not null then
    select exists (
      select 1 from public.lead_interacciones
      where lead_id = v_lead.id and tipo = 'mensaje_lead' and contenido = p_mensaje
        and created_at > now() - interval '1 minute'
    ) into v_repetido;
  end if;

  if v_repetido then
    return v_lead;
  end if;

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

revoke execute on function public.registrar_lead(text, text) from public, anon, authenticated;
grant  execute on function public.registrar_lead(text, text) to service_role;
