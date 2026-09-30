-- =====================================================================
--  Migración 10a: estado "Atendido" (el asesor ya resolvió la consulta del lead)
--  Va sola porque un valor nuevo de enum no puede usarse en la misma transacción.
-- =====================================================================
alter type public.lead_estado add value if not exists 'lead_atendido' after 'lead_contactado';
