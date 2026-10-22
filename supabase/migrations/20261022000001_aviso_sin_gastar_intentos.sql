-- Avisos a asesores: cuando WhatsApp está caído (bot desconectado, "Deploy not found", error del servidor),
-- el intento fallido no cuenta. Así, al reconectarse, el reintento automático todavía puede enviarlo.

drop function if exists public.marcar_notificacion(uuid, boolean, text);

create function public.marcar_notificacion(p_lead_id uuid, p_ok boolean, p_error text default null, p_contar boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leads
  set notificacion_estado   = case when p_ok then 'notificado' else 'error' end,
      notificacion_intentos = notificacion_intentos + case when p_ok or p_contar then 1 else 0 end,
      fecha_notificacion    = now(),
      notificacion_error    = case when p_ok then null else left(p_error, 500) end
  where id = p_lead_id;

  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (p_lead_id, 'sistema',
          case when p_ok then 'Asesor notificado por WhatsApp'
               else 'Error notificando al asesor: ' || coalesce(left(p_error, 300), 'desconocido')
                    || case when p_contar then '' else ' (WhatsApp caído: se reintenta al reconectarse)' end end);
end $$;

revoke all on function public.marcar_notificacion(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.marcar_notificacion(uuid, boolean, text, boolean) to service_role;
