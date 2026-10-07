-- =====================================================================
--  Genesys recuerda al alumno entre conversaciones: el CRM le envía en cada
--  mensaje (respuesta de /genesys/registrar, campo "contexto") lo que ya
--  sabe de él. Esta regla le dice cómo usarlo.
-- =====================================================================
insert into public.genesys_fichas (parte, titulo, campos, orden)
select 'registro', 'Contexto del alumno (lo envía el CRM)', jsonb_build_object('texto', $t$Al inicio del prompt viene "CONTEXTO DEL ALUMNO" con lo que el CRM ya sabe de esta persona (de conversaciones de otros días, del QR o de un asesor).
- Si dice YA REGISTRADO: salúdalo por su nombre, NO le pidas nombre, documento ni carrera y NO escribas PEDIDO_CONFIRMADO. Responde sus dudas y recuérdale que su asesor(a) lo acompaña.
- Si dice "Datos que ya dio": pide solo lo que falte.
- Si dice "Alumno nuevo", está vacío o aparece entre llaves: sigue el registro normal.$t$), 5
where not exists (select 1 from public.genesys_fichas where titulo = 'Contexto del alumno (lo envía el CRM)');
