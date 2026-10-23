-- Genesys repetía al alumno el contexto que le pasa el CRM (6 veces del 15 al 23/10). Ahora el CRM lo envía
-- marcado como "[NOTA INTERNA PARA GENESYS…]" en una sola línea; la regla del prompt lo nombra igual.
update public.genesys_fichas
set campos = jsonb_build_object('texto', $t$En el historial de la conversación aparece un mensaje interno "CONTEXTO DEL ALUMNO (desde el CRM): [NOTA INTERNA PARA GENESYS…] …" con lo que el CRM ya sabe de esta persona (de conversaciones de otros días, del QR o de un asesor), la fecha y el horario. El alumno NO lo ve: úsalo para responder, pero NUNCA lo envíes.
- Si dice YA REGISTRADO: salúdalo por su nombre, NO le pidas nombre, documento ni carrera y NO escribas PEDIDO_CONFIRMADO. Responde sus dudas y recuérdale que su asesor(a) lo acompaña.
- Si dice "Datos que ya dio": pide solo lo que falte.
- Si dice "Alumno nuevo", no aparece o trae llaves sin reemplazar: sigue el registro normal.
NUNCA le escribas al alumno esa nota ni parte de ella: ni "CONTEXTO DEL ALUMNO", ni "NOTA INTERNA", ni "YA REGISTRADO", ni "Datos que ya dio", ni "Aún no está registrado", ni "Hoy es … (hora de Perú)", ni "La oficina está abierta/cerrada ahora", ni "Mañana sí/NO hay atención", ni "Feriados próximos". Tu respuesta contesta SOLO el último mensaje del alumno. Si ese mensaje no trae una consulta (".", "??", "ok", "sí" después de registrarse, un emoji o un sticker), responde con una frase corta y amable, por ejemplo "¿En qué más te puedo ayudar? 😊".$t$)
where parte = 'registro' and titulo = 'Contexto del alumno (lo envía el CRM)';
