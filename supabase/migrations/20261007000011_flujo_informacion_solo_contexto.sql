-- Guía del flujo INFORMACIÓN: la consulta al CRM es "solo_contexto" (no registra el mensaje dos veces)
update public.flujos_bot set prompt_mejorado = replace(prompt_mejorado,
  '· Cuerpo (JSON): { "telefono": "{from}", "mensaje": "{body}" }   ← usa las variables de BuilderBot para el número y el texto del mensaje',
  '· Cuerpo RAW (JSON): { "telefono": "<variable del número>", "solo_contexto": true }   ← inserta el número con el botón @
   · Respuesta: DESACTIVA "Enviar al cliente" (si no, el alumno recibe el JSON).')
where nombre = 'INFORMACIÓN';
