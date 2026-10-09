# Archivos de referencia (sistema anterior)

No se usan en el CRM actual; se conservan como referencia histórica.

- `schema_leads.sql`: esquema original de la base de leads (antes de las migraciones de `supabase/migrations/`).
- `leads.js`, `flujos_leads.js`: primera conexión del bot Genesys (BuilderBot) con Supabase.
- `costos/Proformas_Admision_2027-1.html`: tarifario original 2027-1. De aquí salen los montos de
  `packages/db/src/costos.ts` y las pruebas de `supabase/functions/tests/costos_test.ts`.
