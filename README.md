# CRM de Leads — Oficina de Admisión

CRM para la oficina de admisión. **Toda persona que escribe al bot de WhatsApp Genesys es un lead**
y queda guardada en Supabase. Los asesores trabajan sus leads desde un panel web.

- **Base de datos**: Supabase (PostgreSQL) con seguridad por filas (RLS).
- **Bot**: Genesys en BuilderBot Cloud → API `genesys` (Supabase Edge Function).
- **Panel**: Next.js + Tailwind + Supabase Auth (ingreso con usuario, sin correo).
- **Todo en TypeScript.**

```
WhatsApp ─► Genesys (BuilderBot Cloud) ─► Edge Function "genesys" ─► Supabase ◄─ Panel web (Next.js)
                     └─ (transición) ─► Apps Script ─► Google Sheets        asesores y admin
```

---

## Estructura

```
.
├── supabase/
│   ├── migrations/          # Tablas, funciones, vistas y RLS (en orden)
│   ├── functions/genesys/   # API que llama el bot (Edge Function, Deno)
│   ├── functions/_shared/   # Reglas de normalización y tipos para la función
│   ├── tests/               # Pruebas de la base de datos (npm run db:test)
│   ├── demo/                # Leads de demostración (cargar / borrar)
│   ├── seed.sql             # Asesores de EJEMPLO
│   └── seed.local.sql       # Asesores REALES (no se sube a git)
├── panel/                   # Panel web (Next.js)
├── packages/db/             # Tipos de la base de datos y del dominio (compartidos)
├── docs/
│   ├── fase2-conectar-genesys.md   # Guía para conectar el bot
│   └── apps-script/                # Código para el Apps Script (modo sombra)
└── schema_leads.sql, leads.js, flujos_leads.js   # Archivos de referencia originales
```

## Estados del lead

`lead_nuevo` → `lead_en_conversacion` → `lead_interesado` → `lead_asignado` → `lead_contactado`
→ `lead_inscrito` → `lead_matriculado`, más `lead_no_interesado` (no quiso asesor; no se borra)
y `lead_perdido`.

- El teléfono es único y el DNI también (cuando existe): **no hay leads duplicados**.
- Al confirmar interés, el lead se asigna **por turnos**: los leads de **CePre** van a los asesores con
  `CEPRE` en sus carreras; el resto rota entre los asesores generales (sin carreras exclusivas).
- Cuando el lead pasa al asesor, la API responde `bot_atiende: false` y Genesys deja de responderle.

---

## 1. Instalación

Requisitos: **Node.js 20 o superior**.

```bash
npm install
```

## 2. Configurar Supabase

Proyecto: `https://itmwdnttrfbbehoipzzp.supabase.co`

### 2.1 Crear la base de datos

**Opción A — CLI** (recomendada; usa el pooler IPv4, la conexión directa de Supabase es solo IPv6):

```bash
npx supabase db push --db-url "postgresql://postgres.itmwdnttrfbbehoipzzp:CONTRASEÑA_BD@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
```

**Opción B — SQL Editor**: `npm run db:bundle` genera `supabase/instalar_en_sql_editor.sql`;
pégalo completo en *Supabase > SQL Editor* y ejecuta (solo en un proyecto vacío).

Después de cambiar migraciones, regenera los tipos:

```bash
npx supabase gen types typescript --db-url "postgresql://...(igual que arriba)" --schema public > packages/db/src/database.types.ts
cp packages/db/src/database.types.ts supabase/functions/_shared/database.types.ts
```

### 2.2 Asesores

Ejecuta `supabase/seed.local.sql` en el SQL Editor (asesores reales; no está en git).
Se pueden agregar más desde el panel: **Asesores y usuarios > Agregar asesor**.

### 2.3 Usuarios del panel

Se ingresa con **usuario** (`nombre.apellido`) y contraseña, sin correo.
El administrador `cris` ya existe. Para los asesores: entra como admin →
**Asesores y usuarios** → **Crear usuario** en cada fila (contraseña inicial: su DNI).
Con la casilla *"Obligar a cambiar la contraseña"*, el asesor deberá crear una propia al primer ingreso.

Recomendado en Supabase: *Authentication > Sign In / Providers* → desactivar **Allow new users to sign up**.

## 3. Levantar el panel

Crea `panel/.env.local` (ver `.env.example`; solo la **publishable key**, nunca la service_role):

```
NEXT_PUBLIC_SUPABASE_URL=https://itmwdnttrfbbehoipzzp.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

```bash
npm run dev          # desarrollo → http://localhost:3001
```

Producción: `npm run build -w panel` y luego `npm run start -w panel`.
(El panel usa el puerto **3001** porque el 3000 suele estar ocupado.)

### En producción (Vercel)

Panel publicado en **https://crm-admision.vercel.app** (proyecto `crm-admision`).
Configuración del proyecto en Vercel: *Root Directory* = `panel`, framework Next.js y las variables
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production, Preview y Development).

- Despliegue automático en cada push a `main` con GitHub Actions (`.github/workflows/desplegar-vercel.yml`):
  requiere el secreto `VERCEL_TOKEN` en *GitHub > Settings > Secrets and variables > Actions*.
- Despliegue manual desde la raíz del repo: `npx vercel deploy --prod`.

### Qué ve cada rol

| | Asesor | Administrador |
|---|---|---|
| Leads, ficha, notas, Kanban | Solo los suyos | Todos |
| Cambiar estado / registrar lead | Sí (sus leads) | Sí |
| Reasignar asesor | No | Sí |
| Dashboard | Sus números | Todo, filtrable por asesor |
| Asesores y usuarios | No | Sí |

Los permisos los aplica la base de datos (RLS), no solo la pantalla.

### Chat de WhatsApp

En la ficha de cada lead hay un chat: el asesor lee lo que escribió el postulante y le responde desde el CRM.
Los mensajes salen por el **número de Genesys** (API de BuilderBot), firmados con el nombre del asesor, y todo
queda en el historial. La página **Chats** es la bandeja: primero las conversaciones **sin responder** (con contador en el menú).
Se actualiza en vivo (Supabase Realtime).

- El primer mensaje del asesor a un lead *Asignado* lo pasa a *Contactado*.
- **Pausa del bot**: Genesys no responde al lead durante **5 horas** desde que pasa a *Contactado* o desde el
  último mensaje del asesor (cada mensaje renueva la pausa). La barra del chat muestra hasta qué hora y permite
  *Pausar bot 5 h* o *Reactivar bot*. Mientras el lead está *Interesado* o *Asignado* (esperando a su asesor) el bot no responde.
- Botones **✓ Atendido** (estado nuevo: consulta resuelta) y **🎓 Matriculado**: devuelven el lead al bot.
- **Aviso de mensaje nuevo**: cuando un lead con asesor escribe, el asesor recibe un WhatsApp con el mensaje y el
  enlace al chat del CRM (máximo uno cada 10 minutos por lead).
- Límite de 20 mensajes por minuto por asesor, para cuidar el número (WhatsApp Business por QR).
- Para ver las respuestas del postulante, BuilderBot debe llamar a `/genesys/registrar` con **cada mensaje entrante**
  (ver [docs/fase2-conectar-genesys.md](docs/fase2-conectar-genesys.md), sección 5).
- Envío: Edge Function `chat` (valida la sesión del usuario y el RLS; la API key de BuilderBot nunca llega al panel).

### Seguimiento del asesor

- **Pendientes**: tareas agendadas ("próxima acción", desde la ficha del lead) y alertas automáticas:
  asignados sin contactar en 2 h, leads sin responder y contactados sin actividad en 3 días. Contador en el menú.
- **Respuestas rápidas** (botón ⚡ del chat) con `{nombre}`, `{carrera}` y `{asesor}`; el admin las administra.
- **Motivo de pérdida** obligatorio (lista fija) al marcar *Perdido* o *No interesado*.
- **Exportar Excel** en la lista de leads (CSV con los mismos filtros; el asesor solo exporta sus leads).
  Para descargar por mes usa *Este mes*, *Mes pasado* o "elige un mes" en los filtros; el archivo se llama
  con el periodo o la campaña (ej. `leads-crm-2026-09-01_a_2026-09-30.csv`).
- **Campañas** (menú Análisis): el admin crea campañas con nombre, fechas de inicio y fin y, opcional, un
  origen (ej. "Facebook Octubre": Facebook, 01/10 al 31/10). Cada campaña muestra leads, contactados,
  matriculados y perdidos, con botones *Ver leads* y *⬇ Excel*; también se elige en los filtros de Leads.
- **Acciones masivas** en la lista de leads: marca casillas (o todas las de la página) y cambia el estado
  (con motivo si es *Perdido*) o, si eres admin, asígnalos a un asesor.
- **Avisos de escritorio** (botón 🔔 de la barra superior): sonido y notificación del navegador cuando un
  lead escribe, aunque la pestaña esté en segundo plano. Se activa por usuario y navegador.
- **Reasignación automática**: cada 15 min (de 8:00 a 19:00, hora de Lima) un lead *Asignado* que no fue
  contactado en 4 h pasa al siguiente asesor de la rotación y este recibe el aviso por WhatsApp
  ("🔁 LEAD REASIGNADO A TI"). Máximo 2 veces por lead; se ajusta con los secretos `REASIGNAR_HORAS` y
  `REASIGNAR_MAXIMO` de la función `genesys`. La ficha muestra cuántas veces se reasignó.
- **Origen del lead** ("Nos conoció por": Facebook, Instagram, TikTok, ferias…): se elige en el registro
  manual o en *Editar datos*, se filtra en la lista, sale en el Excel y en el gráfico *Leads por origen*
  del dashboard. Desde Genesys llega si el webhook de BuilderBot envía el campo `Origen` (también acepta
  `ComoNosConocio`, `Campana` o `utm_source`): agrega en el flujo la pregunta "¿Cómo nos conociste?",
  guarda la respuesta en una variable y súmala al body como `"Origen": "{{variable}}"`.

### Dashboard

Total de leads, leads por estado, por carrera y por asesor, leads nuevos por día y el embudo de
conversión (lead → interesado → contactado → matriculado). Filtros por fechas, convocatoria y asesor.
Las cifras se calculan en la base (`resumen_dashboard`), así que son exactas con cualquier volumen.

Para verlo con datos de prueba: ejecuta `supabase/demo/cargar_demo.sql` en el SQL Editor y, al terminar,
`supabase/demo/borrar_demo.sql`. No lo hagas con asesores trabajando: verían leads falsos.

## 4. Conectar el bot Genesys

Guía completa: **[docs/fase2-conectar-genesys.md](docs/fase2-conectar-genesys.md)**. En resumen:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # token del bot
npx supabase login
npx supabase secrets set --project-ref itmwdnttrfbbehoipzzp GENESYS_BOT_TOKEN=... GENESYS_MODO=sombra
npx supabase functions deploy genesys --no-verify-jwt --project-ref itmwdnttrfbbehoipzzp
```

1. **Modo sombra** (transición): el Apps Script sigue asignando y avisando; copia cada lead a Supabase
   con el mismo asesor (`docs/apps-script/espejo_supabase.gs`). En BuilderBot se agrega `/registrar`
   al inicio del flujo.
2. **Modo activo**: `GENESYS_MODO=activo` + `BUILDERBOT_URL` y `BUILDERBOT_API_KEY`. BuilderBot envía su
   webhook a `/genesys/webhook` (mismo JSON que el Apps Script); Supabase asigna, avisa al asesor por
   WhatsApp y manda recordatorios diarios a las 8am.

La **service_role key nunca sale de Supabase**: el bot usa un token propio y el panel la publishable key.

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Panel en modo desarrollo (http://localhost:3001) |
| `npm run build -w panel` | Compila el panel (verifica tipos) |
| `npm run db:test` | Prueba migraciones, RLS, reparto y dashboard en un Postgres en memoria |
| `npm run db:bundle` | Une las migraciones en un archivo para el SQL Editor |
| `npm run fn:deploy` | Publica la Edge Function `genesys` (requiere `supabase login` y `link`) |
| `npm run typecheck` | Revisa los tipos de todos los paquetes |

## Solución de problemas

- **"Usuario o contraseña incorrectos"**: el usuario va en minúsculas (`danna.lima`). El admin puede
  restablecer la contraseña desde *Asesores y usuarios*.
- **"Tu usuario no está vinculado a un asesor"**: la cuenta existe en Auth pero no en `asesores`;
  crea las cuentas desde el panel, no desde Supabase Auth.
- **`db push` no conecta (hostname resolving error)**: usa la URL del pooler (`aws-0-us-west-2.pooler.supabase.com`),
  no `db.<proyecto>.supabase.co`.
- **El puerto 3001 está ocupado**: cambia `-p 3001` en `panel/package.json`.
- **Errores de la API del bot**: *Supabase > Edge Functions > genesys > Logs*.

## Seguridad

- `panel/.env.local`, `supabase/seed.local.sql` y cualquier `.env` están en `.gitignore`.
- La publishable key es pública por diseño: sin sesión no permite leer nada (probado).
- Cambia la contraseña de la base de datos si se compartió por algún medio.
