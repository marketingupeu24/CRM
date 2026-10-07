-- El contexto del alumno llega como mensaje interno en el historial del asistente
-- (paso "Solicitud HTTP" → "Guardar en historial AI"), no como variable dentro del prompt.
update public.genesys_fichas
set campos = jsonb_build_object('texto', $t$En el historial de la conversación puede aparecer un mensaje interno "CONTEXTO DEL ALUMNO (desde el CRM): …" con lo que el CRM ya sabe de esta persona (de conversaciones de otros días, del QR o de un asesor). El alumno no lo ve: úsalo, pero no lo menciones ni lo copies.
- Si dice YA REGISTRADO: salúdalo por su nombre, NO le pidas nombre, documento ni carrera y NO escribas PEDIDO_CONFIRMADO. Responde sus dudas y recuérdale que su asesor(a) lo acompaña.
- Si dice "Datos que ya dio": pide solo lo que falte.
- Si dice "Alumno nuevo", no aparece o trae llaves sin reemplazar: sigue el registro normal.$t$)
where parte = 'registro' and titulo = 'Contexto del alumno (lo envía el CRM)';

update public.flujos_bot set prompt_mejorado = $t$1) Paso "Solicitud HTTP" al inicio de este flujo, ANTES del asistente de IA:
   · POST https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys/registrar
   · Encabezados: Content-Type = application/json · x-genesys-token = (el mismo token de "Base de datos")
   · Body RAW: { "solo_contexto": true, "from": "{from}", "phone": "{phone}", "numero": "{number}", "celular": "{{from}}" }
   · Respuesta: "Enviar al cliente" APAGADO · "Guardar en historial AI" ENCENDIDO · mensaje interno:
       CONTEXTO DEL ALUMNO (desde el CRM): {contexto}      ← {contexto} con el botón @
   · Tiempo de espera: 10 segundos · Rules y "Enviar a": vacíos.

2) Asistente de IA: REEMPLAZA TODO el texto por el prompt del CRM (Prompt de Genesys → "📋 Copiar prompt").

3) En el CRM pulsa "✓ Ya lo pegué en BuilderBot".$t$
where nombre = 'INFORMACIÓN';
