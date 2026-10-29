-- Revisión de arquitectura (29/10):
-- 1) El rol anónimo no necesita nada sobre lead_apoyo (tenía SELECT, TRUNCATE, REFERENCES y TRIGGER).
-- 2) Las funciones de reportes no se ejecutan sin sesión (ya no devolvían datos a anon; queda cerrado del todo).
-- 3) Índices en claves foráneas que no tenían (borrados en cascada y consultas por lead).

revoke all on public.lead_apoyo from anon;

revoke execute on function public.embudo_por_origen(date, date, text, uuid, text) from anon, public;
revoke execute on function public.procedencia_leads(timestamptz, timestamptz, uuid) from anon, public;
revoke execute on function public.resumen_recordatorio(bigint) from anon, public;
grant execute on function public.embudo_por_origen(date, date, text, uuid, text) to authenticated, service_role;
grant execute on function public.procedencia_leads(timestamptz, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.resumen_recordatorio(bigint) to authenticated, service_role;

create index if not exists actividad_respuestas_lead_idx on public.actividad_respuestas (lead_id);
create index if not exists movimientos_lead_por_idx on public.movimientos_lead (por_asesor_id);
