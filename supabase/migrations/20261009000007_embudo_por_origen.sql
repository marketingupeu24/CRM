-- =====================================================================
--  Embudo por origen (Dashboard): de cada origen, cuántos escribieron, se
--  registraron, fueron contactados, se inscribieron y se matricularon.
--  p_por: 'origen' ("Nos conoció por") o 'canal' ("Llegó por": enlace,
--  Facebook, anuncio…). Mismos filtros que resumen_dashboard y mismo
--  permiso (security invoker: el asesor solo ve sus leads).
-- =====================================================================
create or replace function public.embudo_por_origen(
  p_desde date default null, p_hasta date default null, p_convocatoria text default null,
  p_asesor_id uuid default null, p_por text default 'origen'
)
returns table (grupo text, escribieron int, registrados int, contactados int, inscritos int, matriculados int)
language sql stable set search_path = ''
as $$
  with l as (
    select *
    from public.leads
    where eliminado_at is null
      and (p_desde is null or created_at >= (p_desde::timestamp at time zone 'America/Lima'))
      and (p_hasta is null or created_at <  ((p_hasta + 1)::timestamp at time zone 'America/Lima'))
      and (p_convocatoria is null or convocatoria = p_convocatoria)
      and (p_asesor_id is null or asesor_id = p_asesor_id)
  )
  select coalesce(case when p_por = 'canal' then canal_entrada else origen_campana end, 'Sin dato') as grupo,
         count(*)::int,
         count(*) filter (where dni is not null or estado not in ('lead_nuevo', 'lead_en_conversacion', 'lead_no_interesado'))::int,
         count(*) filter (where primer_contacto_asesor_at is not null
                             or estado in ('lead_contactado', 'lead_atendido', 'lead_inscrito', 'lead_matriculado'))::int,
         count(*) filter (where estado in ('lead_inscrito', 'lead_matriculado'))::int,
         count(*) filter (where estado = 'lead_matriculado')::int
  from l
  group by 1
  order by 2 desc
$$;
grant execute on function public.embudo_por_origen(date, date, text, uuid, text) to authenticated;
revoke execute on function public.embudo_por_origen(date, date, text, uuid, text) from anon;
