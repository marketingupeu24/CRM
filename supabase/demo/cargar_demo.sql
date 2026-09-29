-- =====================================================================
--  DATOS DE DEMOSTRACIÓN: 120 leads ficticios (resumen = 'DEMO') repartidos
--  entre los asesores, para ver el dashboard y el Kanban con datos.
--  Ejecutar en Supabase > SQL Editor. Para quitarlos: borrar_demo.sql
--  NO usar con asesores trabajando: verían estos leads falsos.
-- =====================================================================
with a as (select id, carreras, row_number() over (order by nombre) - 1 as i, count(*) over () as n from public.asesores where rol = 'asesor')
insert into public.leads (telefono, nombre, carrera_interes, modalidad, programa, convocatoria, estado, asesor_id,
                          origen, resumen, created_at, primer_contacto, fecha_interesado, fecha_asignado, total_mensajes)
select '519000' || lpad(g::text, 5, '0'),
       'Demo ' || g,
       case when g % 9 = 0 then null else (array['Ingeniería de Sistemas','Enfermería','Psicología','Administración','Contabilidad','Derecho','Nutrición','Ingeniería Civil'])[1 + g % 8] end,
       case when g % 9 = 0 then 'CePre Presencial' end,
       case when g % 9 = 0 then 'cepre' else 'pregrado' end,
       case when g % 3 = 0 then '2026-1' else '2026-2' end,
       e.estado::public.lead_estado,
       case when e.estado in ('lead_asignado','lead_contactado','lead_inscrito','lead_matriculado','lead_perdido')
            then (select id from a where (g % 9 = 0 and 'CEPRE' = any(carreras)) or (g % 9 <> 0 and a.carreras = '{}' and a.i = g % (a.n - 1)) limit 1) end,
       (array['whatsapp_genesys','whatsapp_genesys','whatsapp_genesys','google_form','web','manual'])[1 + g % 6],
       'DEMO',
       now() - (random() * 45 || ' days')::interval,
       now() - (random() * 45 || ' days')::interval,
       case when e.estado not in ('lead_nuevo','lead_en_conversacion','lead_no_interesado') then now() - interval '2 days' end,
       case when e.estado in ('lead_asignado','lead_contactado','lead_inscrito','lead_matriculado','lead_perdido') then now() - interval '1 day' end,
       1 + g % 7
from generate_series(1, 120) g
cross join lateral (select (array['lead_nuevo','lead_en_conversacion','lead_en_conversacion','lead_no_interesado','lead_no_interesado',
  'lead_interesado','lead_asignado','lead_asignado','lead_asignado','lead_contactado','lead_contactado','lead_contactado',
  'lead_inscrito','lead_inscrito','lead_matriculado','lead_matriculado','lead_perdido'])[1 + (g * 7) % 17] as estado) e;
