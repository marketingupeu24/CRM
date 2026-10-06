-- =====================================================================
--  Genesys repetía la confirmación del registro decenas de veces: el agente
--  de IA reintentaba la herramienta de registro. La API ya responde
--  "registrado: true" a los repetidos; además, la regla de registro lo dice.
-- =====================================================================
update public.conocimiento
set contenido = contenido || E'\n- Registra los datos del alumno con la herramienta UNA sola vez por conversación. Cuando la respuesta diga que quedó registrado (o "ya_registrado"), confirma UNA sola vez y no vuelvas a llamar a la herramienta ni repitas la confirmación.',
    updated_at = now()
where titulo = 'Registro de datos' and contenido not like '%UNA sola vez por conversación%';
