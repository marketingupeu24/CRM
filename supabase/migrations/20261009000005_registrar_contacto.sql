-- =====================================================================
--  Botón "📞 Llamé": el asesor registra una llamada o un WhatsApp desde su
--  celular personal, con el resultado. Así el seguimiento y los reportes
--  cuentan también el contacto que se hace por fuera del chat del CRM.
--  - Contestó / respondió: cuenta como primer contacto (igual que un mensaje
--    del chat) y un lead "Asignado" pasa a "Contactado".
--  - No contestó: queda anotado (no cuenta como contacto).
--  - Volver a llamar: queda anotado y se agenda la tarea en "Próxima acción".
-- =====================================================================
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

  if p_resultado = 'contesto' then
    update public.leads
    set primer_contacto_asesor_at = coalesce(primer_contacto_asesor_at, now()),
        estado = case when estado = 'lead_asignado' then 'lead_contactado'::public.lead_estado else estado end
    where id = v_lead.id;
  end if;

  if p_resultado = 'volver' then
    insert into public.tareas (lead_id, asesor_id, titulo, vence_at, creada_por)
    values (v_lead.id, coalesce(v_lead.asesor_id, v_yo),
            'Volver a llamar' || coalesce(': ' || nullif(left(trim(p_nota), 200), ''), ''), p_volver_at, v_yo);
  end if;
end $$;
revoke execute on function public.registrar_contacto_externo(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.registrar_contacto_externo(uuid, text, text, text, timestamptz) to authenticated;
