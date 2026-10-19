-- =====================================================================
--  Carreras sin duplicados: cualquier forma de escribir una carrera
--  ("Nutrición", "NUTRICION", "Nutrición Humana", "Ingeniería de Sistemas,
--  Presencial", "Educación, Especialidad Primaria y Pedagogía Terapeútica"…)
--  se guarda con su nombre oficial. Vale para todo lo que entra: Genesys,
--  importación, registro manual, QR y edición en la ficha.
--  - Nombres oficiales: los de las fichas de carreras del prompt de Genesys.
--  - "a distancia" / "semipresencial" en el texto se conservan como sufijo.
--  - Posgrados y textos que no se reconocen se guardan tal cual (solo sin espacios de más).
--  - Si el texto mezcla dos carreras (ej. "Educación Física/Primaria") se deja tal cual.
--  Solo actúa al guardar una carrera nueva o cambiada: no toca los leads que ya existen.
-- =====================================================================

create or replace function public.carrera_oficial(p_texto text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  k text;
  base text;
  sufijo text := '';
  limpio text;
begin
  if p_texto is null or btrim(p_texto) = '' then return null; end if;
  limpio := regexp_replace(btrim(p_texto), '\s+', ' ', 'g');
  -- clave de comparación: minúsculas, sin tildes ni signos
  k := lower(translate(p_texto, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
  k := ' ' || regexp_replace(k, '[^a-z0-9]+', ' ', 'g') || ' ';

  if k ~ ' (posgrado|segunda especialidad|maestria|doctorado|diplomado) ' or k ~ 'segunda especialidad' then
    return limpio;
  end if;
  if k ~ ' distancia ' then sufijo := ' (a distancia)';
  elsif k ~ ' semipresencial ' then sufijo := ' (semipresencial)';
  end if;

  base := case
    when k ~ 'tecnolog' and k ~ 'laborat' then 'Tecnología Médica en Laboratorio Clínico y Anatomía Patológica'
    when k ~ 'tecnolog' and k ~ '(terapia|rehabilit)' then 'Tecnología Médica en Terapia Física y Rehabilitación'
    when k ~ ' medicina ' then 'Medicina Humana'
    when k ~ 'enfermer' then 'Enfermería'
    when k ~ 'nutric' then 'Nutrición Humana'
    when k ~ 'psicolog' then 'Psicología'
    when k ~ 'arquitect' then 'Arquitectura y Urbanismo'
    when k ~ 'ambiental' then 'Ingeniería Ambiental'
    when k ~ ' civil ' then 'Ingeniería Civil'
    when k ~ 'alimentar' then 'Ingeniería de Industrias Alimentarias'
    when k ~ ' sistemas ' then 'Ingeniería de Sistemas'
    when k ~ 'contab' then 'Contabilidad, Gestión Tributaria y Aduanera'
    when k ~ 'administra' then 'Administración'
    when k ~ ' derecho ' then 'Derecho'
    when k ~ '(inicial|puericult)' then 'Educación Inicial y Puericultura'
    -- dos carreras en el mismo texto: no se adivina
    when k ~ '( fisica |deporte|recreacion)' and k ~ '(primaria|terapeut)' then null
    when k ~ '( fisica |deporte|recreacion)' then 'Educación Física, Recreación y Deportes'
    when k ~ '(primaria|terapeut)' then 'Educación Primaria y Pedagogía Terapéutica'
    when k ~ '(ingles|linguist)' then 'Educación, Especialidad Lingüística e Inglés'
    when k ~ 'matemat' then 'Educación, Matemática, Análisis de Datos y Computación'
    when k ~ 'ciencias naturales' then 'Educación, Ciencias Naturales y Tecnología'
    else null
  end;
  if base is null then return limpio; end if;
  return base || sufijo;
end $$;

create or replace function public.fn_leads_carrera_oficial()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.carrera_interes := public.carrera_oficial(new.carrera_interes);
  return new;
end $$;
revoke execute on function public.fn_leads_carrera_oficial() from public, anon, authenticated;

drop trigger if exists trg_leads_carrera_oficial on public.leads;
create trigger trg_leads_carrera_oficial
before insert or update of carrera_interes on public.leads
for each row execute function public.fn_leads_carrera_oficial();
