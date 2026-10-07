-- =====================================================================
--  1) Carreras a distancia y semipresenciales: sin repetir el plan de la
--     presencial (el prompt queda más corto); basta su costo y su nota.
--  2) Flujos de BuilderBot: qué hacer con cada flujo con el prompt por partes.
-- =====================================================================

update public.genesys_fichas
set campos = (campos - 'enfoque' - 'aprendera' - 'perfil' - 'salidas')
             || jsonb_build_object('notas', trim(coalesce(campos->>'notas', '') || ' Mismo plan de estudios que la carrera presencial.'))
where parte = 'carreras' and campos->>'modalidad' in ('A distancia', 'Semipresencial')
  and coalesce(campos->>'enfoque', '') <> '';

update public.flujos_bot set prompt_mejorado = v.texto, notas = v.nota
from (values
  ('INFORMACIÓN', $t$REEMPLAZA TODO el texto de este asistente por el prompt que arma el CRM:
CRM → Genesys (bot) → Prompt de Genesys → botón "📋 Copiar prompt".

Después de pegarlo, en el CRM pulsa "✓ Ya lo pegué en BuilderBot" para saber qué versión tiene el bot.
Cada vez que cambies una ficha (una carrera, un horario del CEPRE…), vuelve a copiar y pegar.$t$,
   'Único asistente que conversa. Todo lo que sabe sale de "Prompt de Genesys" (carreras, costos del tarifario, modalidades, CEPRE, registro).'),
  ('Base de datos', $t$MANTENER, con esta configuración:
1. Se activa solo cuando la IA escribe PEDIDO_CONFIRMADO (el prompt nuevo lo escribe UNA vez y solo tras el "sí" del alumno).
2. Petición HTTP POST a: https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys/webhook
   · Tiempo de espera: 10 segundos o más (el CRM tarda 2 a 3 s).
   · Reintentos: 0.
3. Un solo mensaje después de la petición, por ejemplo:
   "¡Listo, {nombre}! ✅ Tu registro quedó hecho. Tu asesor(a) te escribirá pronto por aquí 😊"
4. El flujo TERMINA después de ese mensaje: sin "volver al inicio" ni pasar al asistente.$t$,
   'Registro en el CRM. Si el flujo vuelve al asistente, la IA repite PEDIDO_CONFIRMADO y se forma el bucle de confirmaciones.'),
  ('Modalidad', $t$ELIMINAR (o desactivar) este flujo.
Su contenido ya está en el prompt de INFORMACIÓN: partes "Modalidades de admisión" y "CEPRE" del CRM.
Sus palabras clave (general, interno, externo, primeros, tercio…) le quitaban la conversación al asistente.$t$, 'Reemplazado por las partes Modalidades de admisión y CEPRE.'),
  ('CARRERAS', $t$ELIMINAR (o desactivar) este flujo.
Su contenido ya está en el prompt de INFORMACIÓN: parte "Carreras" del CRM (una ficha por carrera).
Palabras como "info", "información" o "carrera" mandaban aquí a quien quería inscribirse.$t$, 'Reemplazado por la parte Carreras.'),
  ('COSTOS', $t$ELIMINAR (o desactivar) este flujo.
Sus montos NO coincidían con el tarifario de las proformas (ej.: Enfermería S/ 4,400 vs S/ 3,990 oficial).
Ahora los costos salen solos del tarifario, dentro de cada carrera del prompt de INFORMACIÓN.$t$, 'Reemplazado por los costos del tarifario de proformas.'),
  ('Agradecimiento', $t$ELIMINAR este flujo (recomendado).
Si prefieres conservarlo:
· Palabras clave: SOLO "gracias" y "muchas gracias" (quita ok, vale, de acuerdo, esta bien, okis, interesante, amable: le robaban la confirmación del registro).
· Mensaje: "¡Con gusto! 😊 Si tienes más dudas, aquí estoy."
· No uses {name}: es el nombre del perfil de WhatsApp, no el real (por eso salía "OSCAR").$t$, 'Le quitaba al registro respuestas como "ok" o "de acuerdo".'),
  ('Silencio', $t$MANTENER tal cual. No cambiar sus palabras ni su petición: lo usa el CRM para callar al bot cuando un asesor atiende al alumno.$t$,
   'Lo usa el CRM (zz_silencio_crm).')
) as v (nombre, texto, nota)
where flujos_bot.nombre = v.nombre;
