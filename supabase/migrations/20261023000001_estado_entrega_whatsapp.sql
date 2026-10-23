-- Doble check real de WhatsApp (API oficial de Meta): cada mensaje enviado guarda su id de WhatsApp (wamid)
-- y, cuando llegan los avisos de estado (sent / delivered / read / failed), cuándo se entregó, cuándo se leyó
-- o por qué falló. Si BuilderBot aún no reenvía esos avisos, las columnas quedan vacías y el chat usa la regla
-- de siempre (✓✓ cuando el alumno respondió después).

alter table public.lead_interacciones
  add column if not exists wamid text,
  add column if not exists entregado_at timestamptz,
  add column if not exists leido_at timestamptz,
  add column if not exists error_entrega text;

create index if not exists lead_interacciones_wamid_idx on public.lead_interacciones (wamid) where wamid is not null;

-- Aviso de estado de un mensaje (lo llama el webhook con la service_role). Nunca retrocede: leído > entregado.
create or replace function public.registrar_estado_whatsapp(p_wamid text, p_estado text, p_momento timestamptz default now(), p_error text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.lead_interacciones
  set entregado_at  = case when p_estado in ('delivered', 'read') then coalesce(entregado_at, p_momento) else entregado_at end,
      leido_at      = case when p_estado = 'read' then coalesce(leido_at, p_momento) else leido_at end,
      error_entrega = case when p_estado = 'failed' then left(coalesce(p_error, 'WhatsApp no pudo entregar el mensaje'), 300) else error_entrega end
  where wamid = p_wamid;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.registrar_estado_whatsapp(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.registrar_estado_whatsapp(text, text, timestamptz, text) to service_role;
