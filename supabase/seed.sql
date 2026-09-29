-- =====================================================================
--  Datos de EJEMPLO (sin datos reales: este archivo sí se sube a git)
--  Los asesores reales van en supabase/seed.local.sql (ignorado por git).
--
--  - telefono: formato 51999999999 (sin +). Ahí llega el aviso de cada lead nuevo.
--  - email: el mismo con el que el asesor iniciará sesión en el panel
--    (al crear el usuario en Supabase Auth con ese email, se vincula solo).
--  - carreras:
--      '{}'        -> asesor general: entra en la rotación de todos los leads de pregrado.
--      '{CEPRE}'   -> recibe todos los leads de CePre.
--      '{Carrera}' -> recibe en exclusiva los leads de esa carrera.
-- =====================================================================
insert into public.asesores (nombre, telefono, email, rol, carreras) values
  ('Administrador Admisión', '51900000000', 'admin@ejemplo.edu.pe',     'admin',  '{}'),
  ('Asesor Ejemplo 1',       '51900000001', 'asesor1@ejemplo.edu.pe',   'asesor', '{}'),
  ('Asesor Ejemplo 2',       '51900000002', 'asesor2@ejemplo.edu.pe',   'asesor', '{}'),
  ('Supervisor CePre',       '51900000099', 'cepre@ejemplo.edu.pe',     'asesor', '{CEPRE}')
on conflict (telefono) do nothing;
