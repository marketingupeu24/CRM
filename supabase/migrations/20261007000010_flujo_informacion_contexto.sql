-- Guía del flujo INFORMACIÓN: consultar al CRM en cada mensaje para recordar al alumno
update public.flujos_bot set prompt_mejorado = $t$1) PASO NUEVO al inicio de este flujo, ANTES del asistente de IA (para que Genesys recuerde al alumno):
   Petición HTTP POST a: https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys/registrar
   · Encabezado: x-genesys-token = (el mismo token que usa "Base de datos")
   · Cuerpo (JSON): { "telefono": "{from}", "mensaje": "{body}" }   ← usa las variables de BuilderBot para el número y el texto del mensaje
   · Tiempo de espera: 10 segundos. Reintentos: 0.
   · Guarda el campo "contexto" de la respuesta en una variable llamada contexto.
   (La respuesta también trae "bot_atiende": si es false, el alumno ya está con un asesor y el bot debería callarse.)

2) En el asistente de IA: REEMPLAZA TODO el texto por el prompt del CRM:
   CRM → Genesys (bot) → Prompt de Genesys → "📋 Copiar prompt".
   El prompt trae al inicio la línea "CONTEXTO DEL ALUMNO (lo envía el CRM): {contexto}". BuilderBot la reemplaza con la variable del paso 1.
   Si tu BuilderBot escribe las variables de otra forma (ej. {{contexto}}), cambia solo esa línea.

3) En el CRM pulsa "✓ Ya lo pegué en BuilderBot".$t$,
  notas = 'Único asistente que conversa. Con el paso 1, recuerda al alumno entre conversaciones (nombre, documento, carrera, asesor).'
where nombre = 'INFORMACIÓN';
