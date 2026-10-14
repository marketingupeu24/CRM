-- =====================================================================
--  "Sin responder" más justo (Pendientes, Chats y contador del menú).
--  Antes un lead volvía a "Sin responder" aunque el asesor ya lo hubiera
--  atendido, cuando:
--   - el alumno solo contestaba por cortesía ("Okey", "Gracias hermano", 👍),
--   - el asesor lo atendió por llamada o por su WhatsApp personal (📞 Llamé),
--   - o el asesor ya lo resolvió y no había forma de quitarlo de la lista.
--  Columna nueva leads.atendido_at ("atendido hasta aquí"): cuenta igual que
--  una respuesta del asesor para "Sin responder". No cambia ultima_respuesta_at
--  (respuestas reales por el chat) ni nada de lo que usa el Dashboard.
-- =====================================================================

alter table public.leads add column if not exists atendido_at timestamptz;
comment on column public.leads.atendido_at is
  'Última vez que el lead quedó atendido sin respuesta por el chat del CRM: cortesía del alumno, 📞 Llamé o "Ya lo atendí".';

-- sin_responder es columna generada: se vuelve a crear con atendido_at
drop index if exists public.idx_leads_sin_responder;
alter table public.leads drop column sin_responder;
alter table public.leads
  add column sin_responder boolean generated always as (
    asesor_id is not null
    and ultimo_mensaje_lead_at is not null
    and ultimo_mensaje_lead_at > coalesce(greatest(ultima_respuesta_at, fecha_asignado, atendido_at), '-infinity'::timestamptz)
  ) stored;
create index idx_leads_sin_responder on public.leads (asesor_id) where sin_responder;

-- ---------------------------------------------------------------------
-- Mensaje solo de cortesía: palabras de cierre o agradecimiento, o solo emojis.
-- "Buenos días", preguntas, números (DNI), imágenes y audios NO cuentan.
-- ---------------------------------------------------------------------
create or replace function public.es_mensaje_cortesia(p_texto text)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v_t text;
  v_palabras text[];
begin
  if p_texto is null or length(trim(p_texto)) = 0 or length(p_texto) > 80 or p_texto ~ '[?¿0-9]' then
    return false;
  end if;
  v_t := lower(translate(p_texto, 'ÁÉÍÓÚáéíóúÜü', 'aeiouaeiouuu'));
  v_t := trim(regexp_replace(v_t, '[^a-zñ]+', ' ', 'g'));
  -- Solo emojis o signos (👍, 🙏, 👌): cortesía
  if v_t = '' then return true; end if;
  v_palabras := regexp_split_to_array(v_t, ' ');
  return v_palabras <@ array[
    'ok', 'oka', 'okey', 'okay', 'oki', 'okis', 'okk', 'ya', 'yaa', 'si', 'sii', 'siii', 'claro', 'vale', 'listo', 'perfecto', 'entendido',
    'de', 'acuerdo', 'bueno', 'buena', 'genial', 'excelente', 'esta', 'estabien', 'bien', 'muy', 'ah', 'aa', 'ahh', 'eh', 'mm', 'mmm',
    'gracias', 'graciass', 'grax', 'muchas', 'mil', 'muchisimas', 'le', 'te', 'lo', 'agradezco', 'amable', 'igualmente',
    'dios', 'bendiga', 'bendiciones', 'saludos', 'hermano', 'hermana', 'profe', 'profesor', 'profesora', 'senorita', 'miss',
    'lic', 'licenciado', 'licenciada', 'joven', 'amigo', 'amiga', 'y', 'por', 'todo', 'su', 'tu', 'ayuda', 'informacion', 'la', 'info'
  ]::text[];
end $$;

-- ---------------------------------------------------------------------
-- Resumen del chat: un mensaje de cortesía que llega hasta 48 h después de
-- que el asesor respondió (y sin otra consulta pendiente) no vuelve a marcar
-- el lead como "Sin responder".
-- ---------------------------------------------------------------------
create or replace function public.fn_interacciones_resumen_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.tipo = 'mensaje_lead' then
    update public.leads
    set ultimo_mensaje_lead_at = new.created_at,
        ultimo_mensaje_texto   = left(new.contenido, 160),
        ultimo_mensaje_at      = new.created_at,
        atendido_at = case
          when not sin_responder
           and greatest(ultima_respuesta_at, atendido_at) > new.created_at - interval '48 hours'
           and public.es_mensaje_cortesia(new.contenido)
          then new.created_at else atendido_at end
    where id = new.lead_id;
  elsif new.tipo = 'mensaje_asesor' and new.estado_envio = 'enviado' then
    update public.leads
    set ultima_respuesta_at  = new.created_at,
        ultimo_mensaje_texto = left(new.contenido, 160),
        ultimo_mensaje_at    = new.created_at,
        bot_pausado_hasta    = greatest(coalesce(bot_pausado_hasta, now()), now() + interval '5 hours'),
        primer_contacto_asesor_at = coalesce(primer_contacto_asesor_at, new.created_at)
    where id = new.lead_id;
  end if;
  return new;
end $$;
revoke execute on function public.fn_interacciones_resumen_chat() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- "✓ Ya lo atendí": el asesor (o quien ve el lead) lo quita de "Sin responder".
-- Queda anotado en el historial.
-- ---------------------------------------------------------------------
create or replace function public.marcar_atendido(p_lead_id uuid, p_nota text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo   uuid := public.mi_asesor_id();
  v_lead public.leads;
begin
  if v_yo is null then raise exception 'Tu usuario no está vinculado a un asesor'; end if;
  select * into v_lead from public.leads where id = p_lead_id and eliminado_at is null for update;
  if v_lead.id is null or not (v_lead.asesor_id = v_yo or public.tiene_permiso('ver_todos') or public.es_apoyo(v_lead.id)) then
    raise exception 'No tienes acceso a este lead';
  end if;
  if not v_lead.sin_responder then return; end if;

  update public.leads set atendido_at = greatest(now(), ultimo_mensaje_lead_at) where id = v_lead.id;
  insert into public.lead_interacciones (lead_id, tipo, contenido, autor_id)
  values (v_lead.id, 'sistema',
          '✓ Marcado como atendido' || coalesce(': ' || nullif(left(trim(p_nota), 300), ''), ''), v_yo);
end $$;
revoke execute on function public.marcar_atendido(uuid, text) from public, anon;
grant execute on function public.marcar_atendido(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 📞 Llamé (vigente desde 20261009000005): cualquier contacto registrado por fuera del chat (llamada o
-- WhatsApp personal, con cualquier resultado) también atiende el mensaje
-- pendiente. Lo demás queda igual.
-- ---------------------------------------------------------------------
create or replace function public.registrar_contacto_externo(
  p_lead_id uuid, p_medio text, p_resultado text, p_nota text default null, p_volver_at timestamptz default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_yo    uuid := public.mi_asesor_id();
  v_lead  public.leads;
  v_medio text;
  v_res   text;
begin
  if v_yo is null then raise exception 'Tu usuario no está vinculado a un asesor'; end if;
  select * into v_lead from public.leads where id = p_lead_id and eliminado_at is null for update;
  if v_lead.id is null or not (v_lead.asesor_id = v_yo or public.tiene_permiso('ver_todos') or public.es_apoyo(v_lead.id)) then
    raise exception 'No tienes acceso a este lead';
  end if;
  v_medio := case p_medio when 'llamada' then '📞 Llamada' when 'whatsapp' then '💬 WhatsApp personal' else null end;
  v_res := case p_resultado when 'contesto' then case when p_medio = 'whatsapp' then 'respondió' else 'contestó' end
                            when 'no_contesto' then case when p_medio = 'whatsapp' then 'no respondió' else 'no contestó' end
                            when 'volver' then 'volver a llamar' else null end;
  if v_medio is null or v_res is null then raise exception 'Elige el medio y el resultado'; end if;
  if p_resultado = 'volver' and (p_volver_at is null or p_volver_at < now() - interval '5 minutes') then
    raise exception 'Elige cuándo volver a llamar';
  end if;

  insert into public.lead_interacciones (lead_id, tipo, contenido, autor_id)
  values (v_lead.id, 'llamada',
          v_medio || ' · ' || v_res
          || case when p_resultado = 'volver' then ' (' || to_char(p_volver_at at time zone 'America/Lima', 'DD/MM HH24:MI') || ')' else '' end
          || coalesce(E'\n' || nullif(left(trim(p_nota), 1000), ''), ''),
          v_yo);

  update public.leads
  set atendido_at = now(),
      primer_contacto_asesor_at = case when p_resultado = 'contesto' then coalesce(primer_contacto_asesor_at, now()) else primer_contacto_asesor_at end,
      estado = case when p_resultado = 'contesto' and estado = 'lead_asignado' then 'lead_contactado'::public.lead_estado else estado end
  where id = v_lead.id;

  if p_resultado = 'volver' then
    insert into public.tareas (lead_id, asesor_id, titulo, vence_at, creada_por)
    values (v_lead.id, coalesce(v_lead.asesor_id, v_yo),
            'Volver a llamar' || coalesce(': ' || nullif(left(trim(p_nota), 200), ''), ''), p_volver_at, v_yo);
  end if;
end $$;
revoke execute on function public.registrar_contacto_externo(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.registrar_contacto_externo(uuid, text, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- Leads que hoy están en "Sin responder" solo por una cortesía enviada hasta
-- 48 h después de la respuesta del asesor: se aplica la misma regla.
-- (Solo atendido_at; sin tocar updated_at ni datos del Dashboard.)
-- ---------------------------------------------------------------------
select set_config('crm.solo_puntaje', 'on', true);
update public.leads
set atendido_at = ultimo_mensaje_lead_at
where sin_responder
  and ultima_respuesta_at > ultimo_mensaje_lead_at - interval '48 hours'
  and public.es_mensaje_cortesia(ultimo_mensaje_texto)
  and not exists (
    -- antes de la cortesía no hubo otra consulta sin responder
    select 1 from public.lead_interacciones i
    where i.lead_id = leads.id and i.tipo = 'mensaje_lead'
      and i.created_at > leads.ultima_respuesta_at and i.created_at < leads.ultimo_mensaje_lead_at
  );
select set_config('crm.solo_puntaje', '', true);
