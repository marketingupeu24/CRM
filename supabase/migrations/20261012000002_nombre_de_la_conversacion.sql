-- =====================================================================
--  El nombre del alumno se guarda apenas lo dice en el chat, aunque todavía no
--  se registre: así, si vuelve a escribir otro día, Genesys lo saluda por su
--  nombre (el CRM se lo pasa en el contexto) y no se lo vuelve a preguntar.
--  Se toma solo si el lead aún no tiene nombre:
--  - "me llamo …" / "mi nombre es …" en cualquier mensaje, o
--  - una respuesta corta (1 a 4 palabras, solo letras) justo después de que
--    Genesys preguntó "¿Con quién tengo el gusto?" o por su nombre.
--  Al registrarse, el nombre completo lo reemplaza.
-- =====================================================================

/** "kenia gabi" -> "Kenia Gabi"; null si no parece un nombre. */
create or replace function public.nombre_desde_texto(p_texto text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := trim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'));
begin
  v := regexp_replace(v, '^(hola|buenas|buenos dias|buenas tardes|buenas noches)[,!. ]*', '', 'i');
  v := regexp_replace(v, '^(me llamo|mi nombre es|soy)\s+', '', 'i');
  v := regexp_replace(v, '[0-9]{6,}', '', 'g');                    -- DNI escrito junto al nombre
  v := regexp_replace(v, '[.!,😊🙂👋]+$', '');
  v := trim(v);
  if v !~ '^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+( [A-Za-zÁÉÍÓÚÑÜáéíóúñü]+){0,3}$' or length(v) < 2 or length(v) > 60 then return null; end if;
  -- Respuestas que no son nombres
  if lower(v) ~ '^(si|sí|no|ok|okey|vale|gracias|hola|buenas|claro|bueno|listo|informacion|información|carreras?|costos?|precio|examen|cepre|medicina|enfermeria|enfermería|psicologia|psicología|derecho|ingenieria|ingeniería|estudiante|alumno)( |$)' then
    return null;
  end if;
  return initcap(lower(v));
end $$;

create or replace function public.fn_nombre_de_la_conversacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_nombre   text;
  v_pregunta text;
begin
  if new.tipo <> 'mensaje_lead' or coalesce(new.contenido, '') = '' then return new; end if;
  if exists (select 1 from public.leads where id = new.lead_id and nombre is not null) then return new; end if;

  if new.contenido ~* '(me llamo|mi nombre es)\s+' then
    v_nombre := public.nombre_desde_texto(substring(new.contenido from '(?i)(?:me llamo|mi nombre es)\s+(.+)$'));
  else
    -- ¿Lo último que dijo Genesys fue preguntar su nombre?
    select contenido into v_pregunta from public.lead_interacciones
    where lead_id = new.lead_id and tipo = 'respuesta_bot' and id < new.id
    order by id desc limit 1;
    if coalesce(v_pregunta, '') ~* '(con qui[eé]n tengo el gusto|c[oó]mo te llamas|tu nombre)' then
      v_nombre := public.nombre_desde_texto(new.contenido);
    end if;
  end if;

  if v_nombre is not null then
    update public.leads set nombre = v_nombre where id = new.lead_id and nombre is null;
    if found then
      insert into public.lead_interacciones (lead_id, tipo, contenido)
      values (new.lead_id, 'sistema', 'Nombre tomado de la conversación: ' || v_nombre || ' (se reemplaza al registrarse)');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_nombre_de_la_conversacion on public.lead_interacciones;
create trigger trg_nombre_de_la_conversacion
  after insert on public.lead_interacciones
  for each row execute function public.fn_nombre_de_la_conversacion();

-- Leads que ya dijeron su nombre en el chat y no se registraron: se completa con el historial
do $do$
declare
  r record;
  v_pregunta text;
  v_nombre text;
begin
  for r in
    select i.id, i.lead_id, i.contenido
    from public.lead_interacciones i
    join public.leads l on l.id = i.lead_id and l.nombre is null and l.eliminado_at is null
    where i.tipo = 'mensaje_lead'
    order by i.id
  loop
    continue when exists (select 1 from public.leads where id = r.lead_id and nombre is not null);
    v_nombre := null;
    if r.contenido ~* '(me llamo|mi nombre es)\s+' then
      v_nombre := public.nombre_desde_texto(substring(r.contenido from '(?i)(?:me llamo|mi nombre es)\s+(.+)$'));
    else
      select contenido into v_pregunta from public.lead_interacciones
      where lead_id = r.lead_id and tipo = 'respuesta_bot' and id < r.id order by id desc limit 1;
      if coalesce(v_pregunta, '') ~* '(con qui[eé]n tengo el gusto|c[oó]mo te llamas|tu nombre)' then
        v_nombre := public.nombre_desde_texto(r.contenido);
      end if;
    end if;
    if v_nombre is not null then
      update public.leads set nombre = v_nombre where id = r.lead_id and nombre is null;
      insert into public.lead_interacciones (lead_id, tipo, contenido)
      values (r.lead_id, 'sistema', 'Nombre tomado de la conversación: ' || v_nombre || ' (se reemplaza al registrarse)');
    end if;
  end loop;
end $do$;
