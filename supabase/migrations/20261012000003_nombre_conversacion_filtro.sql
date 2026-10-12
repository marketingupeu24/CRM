-- =====================================================================
--  Nombre tomado de la conversación: filtro más estricto.
--  El primer relleno tomó como nombre respuestas como "Quiero información de
--  Enfermería" o "Nutrición" (el alumno respondió eso cuando Genesys le preguntó
--  su nombre). Se deshacen esos casos y se descartan frases con palabras que no
--  son nombres (carreras, "quiero", "información"…).
-- =====================================================================

create or replace function public.nombre_desde_texto(p_texto text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := trim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'));
begin
  v := regexp_replace(v, '^(hola|buenas|buenos dias|buenos días|buenas tardes|buenas noches)[,!. ]*', '', 'i');
  v := regexp_replace(v, '^(me llamo|mi nombre es|soy|con|es|habla|le saluda|te saluda)\s+', '', 'i');
  v := regexp_replace(v, '[0-9]{6,}', '', 'g');                 -- DNI escrito junto al nombre
  v := regexp_replace(v, '[.!,😊🙂👋]+$', '');
  v := trim(regexp_replace(v, '\s+', ' ', 'g'));
  if v !~ '^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+( [A-Za-zÁÉÍÓÚÑÜáéíóúñü]+){0,3}$' or length(v) < 2 or length(v) > 60 then return null; end if;
  -- Frases que no son nombres: carreras, temas de admisión y palabras de pregunta
  if lower(v) ~ '(^| )(si|sí|no|ok|okey|vale|gracias|hola|buenas|claro|bueno|listo|que|qué|quiero|quisiera|deseo|necesito|info|informacion|información|mas|más|sobre|carreras?|ofrecen|costos?|precios?|pagos?|mensualidad|examen|cepre|admision|admisión|requisitos|matricula|matrícula|becas?|horario|ubicacion|ubicación|como|cómo|cuando|cuándo|cuanto|cuánto|donde|dónde|medicina|enfermeria|enfermería|nutricion|nutrición|psicologia|psicología|derecho|administracion|administración|contabilidad|arquitectura|educacion|educación|ingenieria|ingeniería|sistemas|tecnologia|tecnología|estudiante|alumno|virtual|presencial|distancia)( |$)' then
    return null;
  end if;
  return initcap(lower(v));
end $$;

-- Deshacer los nombres del primer relleno que ya no pasan el filtro
do $do$
declare
  r record;
begin
  for r in
    select i.id interaccion, l.id lead_id, l.nombre
    from public.lead_interacciones i
    join public.leads l on l.id = i.lead_id
    where i.tipo = 'sistema' and i.contenido like 'Nombre tomado de la conversación: %'
      and l.nombre = substring(i.contenido from 'Nombre tomado de la conversación: (.+) \(se reemplaza')
  loop
    if public.nombre_desde_texto(r.nombre) is distinct from r.nombre then
      update public.leads set nombre = public.nombre_desde_texto(r.nombre) where id = r.lead_id;
      if public.nombre_desde_texto(r.nombre) is null then
        delete from public.lead_interacciones where id = r.interaccion;
      else
        update public.lead_interacciones set contenido = 'Nombre tomado de la conversación: ' || public.nombre_desde_texto(r.nombre) || ' (se reemplaza al registrarse)'
        where id = r.interaccion;
      end if;
    end if;
  end loop;
end $do$;
