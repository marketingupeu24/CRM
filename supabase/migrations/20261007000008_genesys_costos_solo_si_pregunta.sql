-- =====================================================================
--  Genesys da el precio de una carrera SOLO si el alumno lo pregunta.
--  "Información de la carrera" = plan, enfoque, campo laboral, sin costos.
-- =====================================================================
update public.genesys_fichas
set campos = jsonb_build_object('texto', $t$Da los costos SOLO cuando el alumno los pide: precio, costo, cuánto cuesta, pensión, mensualidad, matrícula o cuotas.
Si pide "información de la carrera" (o de qué trata, el plan, la malla), NO menciones ningún monto: usa la plantilla "Información de una carrera" y al final ofrécele: "¿Te gustaría conocer los costos?".
Cuando sí los pida, usa la plantilla "Costos de una carrera": matrícula, costo del ciclo y cuotas. Son referenciales, del primer ciclo (pueden variar según los créditos de cada ciclo) y no incluyen becas ni descuentos institucionales. Ofrece que su asesor(a) le envíe la proforma detallada.$t$)
where parte = 'reglas' and titulo = 'Costos';

update public.genesys_fichas
set campos = jsonb_build_object('texto', $t$Te comparto la información de *[Carrera]* 📚👇
✅ *Enfoque:* [enfoque]
✅ *Lo que aprenderás:*
   • [tema 1]
   • [tema 2]
   • [tema 3]
✅ *Perfil del egresado:* [perfil]
✅ *Campo laboral:* [campo laboral]
¿Te gustaría conocer los costos o que te registre para la admisión? 😊
(Esta respuesta NO lleva montos: los costos solo si los pide.)$t$)
where parte = 'plantillas' and titulo = 'Información de una carrera';
