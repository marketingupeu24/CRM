// Une todas las migraciones en un solo archivo para pegar en Supabase > SQL Editor.
// También registra las versiones en supabase_migrations, así `supabase db push`
// no intentará aplicarlas de nuevo más adelante.
// Uso: npm run db:bundle  ->  supabase/instalar_en_sql_editor.sql
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const dir = path.join(ROOT, 'migrations')
const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

let sql = `-- =====================================================================
--  CRM de leads: instalación completa (GENERADO con npm run db:bundle, no editar)
--  Pegar TODO en Supabase > SQL Editor > New query > Run.
--  Ejecutar una sola vez en un proyecto vacío.
-- =====================================================================\n\n`
for (const f of archivos) {
  sql += `-- >>>>>>>>>> ${f}\n${fs.readFileSync(path.join(dir, f), 'utf8')}\n\n`
}
sql += `-- >>>>>>>>>> Registro de migraciones (para que la CLI de Supabase sepa que ya están aplicadas)
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text
);
insert into supabase_migrations.schema_migrations (version, name) values
${archivos.map((f) => { const [v, ...n] = f.replace('.sql', '').split('_'); return `  ('${v}', '${n.join('_')}')` }).join(',\n')}
on conflict (version) do nothing;

-- Refresca la API para que vea las tablas nuevas
notify pgrst, 'reload schema';
`
const salida = path.join(ROOT, 'instalar_en_sql_editor.sql')
fs.writeFileSync(salida, sql)
console.log(`Generado ${path.relative(process.cwd(), salida)} (${archivos.length} migraciones, ${sql.split('\n').length} líneas)`)
