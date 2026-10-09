-- =====================================================================
--  De dónde llegó cada lead (lo informa WhatsApp en el primer mensaje):
--  - canal_entrada: enlace wa.me, Facebook/Messenger, búsqueda en WhatsApp,
--    número en una página web o anuncio.
--  - anuncio: si llegó desde un anuncio de Facebook/Instagram que abre WhatsApp
--    (título, enlace, ID del anuncio y ctwa_clid). Con anuncio, "Nos conoció por"
--    se llena solo (Facebook o Instagram) si estaba vacío.
--  Solo se guarda la primera vez (no se sobrescribe).
-- =====================================================================

alter table public.leads
  add column if not exists canal_entrada text,
  add column if not exists anuncio       jsonb;
comment on column public.leads.canal_entrada is 'Cómo abrió el chat la primera vez (dato de WhatsApp: entryPointConversionSource)';
comment on column public.leads.anuncio is 'Anuncio de Facebook/Instagram desde el que escribió (titulo, url, id, ctwa_clid, red)';

/** "click_to_chat_link" + "messenger" -> "Facebook / Messenger", etc. */
create or replace function public.canal_entrada_texto(p_fuente text, p_app text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_fuente is null or p_fuente = '' then null
    when p_fuente ~* '(ctwa|(^|_)ads?($|_)|advert)' then 'Anuncio de Facebook / Instagram'
    when p_fuente = 'click_to_chat_link' and coalesce(p_app, '') ~* 'messenger|facebook' then 'Facebook / Messenger'
    when p_fuente = 'click_to_chat_link' and coalesce(p_app, '') ~* 'instagram' then 'Instagram'
    when p_fuente = 'click_to_chat_link' then 'Enlace de WhatsApp (wa.me)'
    when p_fuente = 'global_search_new_chat' then 'Buscó el número en WhatsApp'
    when p_fuente = 'phone_number_hyperlink' then 'Número en una página web'
    else p_fuente
  end
$$;

create or replace function public.guardar_origen_contacto(p_lead_id uuid, p_fuente text, p_app text, p_anuncio jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead  public.leads;
  v_canal text := public.canal_entrada_texto(p_fuente, p_app);
  v_red   text;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then return; end if;
  if p_anuncio is not null and v_lead.anuncio is null then
    v_red := case when coalesce(p_anuncio->>'url', '') || coalesce(p_anuncio->>'app', '') ~* 'instagram' then 'Instagram' else 'Facebook' end;
    update public.leads
    set anuncio        = p_anuncio || jsonb_build_object('red', v_red),
        canal_entrada  = coalesce(canal_entrada, 'Anuncio de ' || v_red),
        origen_campana = coalesce(origen_campana, v_red)
    where id = v_lead.id;
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'sistema', '📣 Llegó desde un anuncio de ' || v_red
            || coalesce(': "' || nullif(p_anuncio->>'titulo', '') || '"', ''));
  elsif v_canal is not null and v_lead.canal_entrada is null then
    update public.leads set canal_entrada = v_canal where id = v_lead.id;
  end if;
end $$;
revoke execute on function public.guardar_origen_contacto(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_origen_contacto(uuid, text, text, jsonb) to service_role;

-- Leads que ya escribieron: canal de entrada desde el registro de eventos (el primer dato de cada contacto)
do $do$
declare
  r record;
  v_lead uuid;
begin
  for r in
    select distinct on (e.payload->'cuerpo'->'data'->>'from')
           e.payload->'cuerpo'->'data'->>'from' contacto,
           ci->>'entryPointConversionSource' fuente,
           ci->>'entryPointConversionApp' app
    from public.webhook_eventos e,
         jsonb_path_query(e.payload, 'strict $.**.contextInfo') ci
    where ci ? 'entryPointConversionSource'
    order by e.payload->'cuerpo'->'data'->>'from', e.id
  loop
    select public.lead_de_contacto(r.contacto) into v_lead;
    if v_lead is not null then
      update public.leads set canal_entrada = public.canal_entrada_texto(r.fuente, r.app)
      where id = v_lead and canal_entrada is null;
    end if;
  end loop;
end $do$;
