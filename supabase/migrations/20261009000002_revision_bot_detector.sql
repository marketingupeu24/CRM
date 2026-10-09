-- =====================================================================
--  Revisión del bot: el detector también encuentra respuestas en las que Genesys
--  niega algo que sí existe ("no ofrecemos"), manda a la oficina en vez de
--  ayudar, dice que no tiene acceso, o tuvo que derivar por falta de un dato
--  ("te lo confirma tu asesor"): así se ve qué agregar al prompt.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.preguntas_sin_respuesta(p_dias integer DEFAULT 30)
 RETURNS TABLE(interaccion_id bigint, lead_id uuid, lead_nombre text, lead_telefono text, pregunta text, respuesta text, respondida_at timestamp with time zone, revisada boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.tiene_permiso('conocimiento') then
    raise exception 'No tienes permiso para revisar las respuestas del bot';
  end if;
  return query
  select b.id, l.id, l.nombre, l.telefono,
         (select m.contenido from public.lead_interacciones m
          where m.lead_id = b.lead_id and m.tipo = 'mensaje_lead' and m.created_at <= b.created_at
          order by m.created_at desc limit 1),
         b.contenido, b.created_at,
         exists (select 1 from public.revision_bot r where r.interaccion_id = b.id)
  from public.lead_interacciones b
  join public.leads l on l.id = b.lead_id and l.eliminado_at is null
  where b.tipo = 'respuesta_bot'
    and b.created_at > now() - make_interval(days => greatest(1, least(p_dias, 365)))
    and b.contenido ~* '(no tengo (la )?informaci|no cuento con|no dispongo|lamentablemente|malentendido|no puedo (ayudarte|enviar|brindar)|no estoy segur|no tengo datos|no está incluid|no ofrecemos|no contamos con|te recomiendo acercarte|no tengo acceso|no es posible|te lo confirma tu asesor)'
  order by b.created_at desc
  limit 300;
end $function$
;
