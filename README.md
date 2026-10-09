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
│   ├── functions/genesys/   # API que llama el bot (Edge Function, Deno), dividida por tema:
│   │                        #   index (servidor y acciones), registro, contexto, eventos, avisos, programadas, comun
│   ├── functions/chat/      # Envío de mensajes del asesor por WhatsApp (Edge Function)
│   ├── functions/_shared/   # Reglas del negocio (horario, costos), BuilderBot, contactos @lid y tipos
│   ├── functions/tests/     # Pruebas de las funciones (deno test)
│   ├── tests/               # Pruebas de la base de datos (npm run db:test)
│   ├── demo/                # Leads de demostración (cargar / borrar)
│   ├── seed.sql             # Asesores de EJEMPLO
│   └── seed.local.sql       # Asesores REALES (no se sube a git)
├── panel/                   # Panel web (Next.js)
│   ├── src/app/(panel)/     # Páginas con sesión (una carpeta por módulo)
│   ├── src/app/r, src/app/w # Formularios públicos del QR (actividad y asesor)
│   ├── src/lib/validacion.ts# Esquemas Zod de los formularios
│   └── tests/e2e/           # Pruebas de pantallas (Playwright, solo lectura)
├── packages/db/             # Tipos de la base de datos y del dominio (compartidos)
├── .github/workflows/       # Revisión + despliegue del panel y respaldo diario de la base
└── docs/
    ├── fase2-conectar-genesys.md   # Guía para conectar el bot
    ├── apps-script/                # Código para el Apps Script (modo sombra)
    └── referencia/                 # Archivos del sistema anterior (no se usan)
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

### Super admin y módulos (qué ve cada usuario)

El **super admin** (usuario `cris`) tiene acceso a todo y es el único que entra a **Módulos y permisos**.
Ahí elige, usuario por usuario, qué módulos puede ver y usar (con plantillas *Asesor*, *Supervisor*,
*Coordinador* y *Ninguno*), y puede nombrar a otros super admin. Siempre queda al menos uno.

| Grupo | Módulos |
|---|---|
| Trabajo diario | Pendientes, Chats, Leads, Kanban, Registrar lead |
| Análisis | Dashboard, Campañas, Exportar Excel |
| Gestión de leads | Ver leads de todo el equipo, Asignar y reasignar, Editar celular del lead, Papelera |
| Administración | Asesores y usuarios, Respuestas rápidas, Crear campañas |

- Un asesor nuevo recibe: Pendientes, Chats, Leads, Kanban, Registrar lead, Dashboard, Campañas y Exportar.
- Sin *Ver leads de todo el equipo* el usuario solo ve los leads asignados a él.
- El menú, las páginas y la base de datos (RLS y funciones, con `tiene_permiso()`) respetan los permisos.
  Un usuario con *Asesores y usuarios* no puede modificar a un super admin ni darse permisos.
- El *rol* (Asesor / Administrador) solo decide si la persona recibe leads en la rotación.

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
- **Papelera** (menú Administración, solo admin): "🗑 Enviar a la papelera" en la ficha del lead, en las
  acciones masivas y en *Asesores y usuarios*. Lo eliminado desaparece del panel, el dashboard y el Excel, y
  no genera avisos; se puede restaurar o borrar para siempre. Un lead en la papelera que vuelve a escribir
  se sigue guardando (la papelera lo marca "Volvió a escribir") y sale de ella si se registra a mano otra
  vez. Un usuario en la papelera no puede entrar al panel; para enviarlo no debe tener leads abiertos, y al
  restaurarlo vuelve inactivo.
- **Proformas de costos 2027-1** (menú *Proformas*, módulo "Proformas de costos"): misma lógica que
  `docs/referencia/costos/Proformas_Admision_2027-1.html` (tarifario por campus y modalidad, promoción 25 % / 15 %, becas,
  descuentos institucionales en cascada, EXPLORE 2026, 5 % al contado), ahora en `packages/db/src/costos.ts`
  y verificada contra el HTML original en 1.406 combinaciones. Vista previa en vivo, descarga en PDF o
  imagen y, desde la ficha del lead (botón **💰 Proforma**), **envío por el chat** con la imagen o el PDF
  adjunto (bucket público `proformas` de Supabase Storage) y el mensaje de costos; queda en el historial y
  en la tabla `proformas`. El DNI de EXPLORE se verifica en el servidor (`panel/src/lib/explore.ts`). Para
  cambiar precios, edita `packages/db/src/costos.ts` y corre `deno test -A supabase/functions/tests/`.
- **Registro rápido de fichas** (Registrar lead → *Un alumno*): se queda en la pantalla, guarda con Enter
  (~1 s por ficha), limpia y vuelve al nombre. "Datos de la tanda" (actividad, colegio, grado, origen,
  asignación, convocatoria) se conservan entre fichas. Avisa al instante si el celular o DNI ya existe
  (`lead_existente`), pasa nombres en mayúsculas a formato normal y muestra la lista de la tanda. DNI
  opcional. Los asesores reciben un resumen cada 3 minutos (`avisos_pendientes` + cron
  `crm-avisos-fichas`) en vez de un WhatsApp por ficha.
- **Asignación al registrar**: por defecto, a nombre de quien registra. "Repartir por igual entre los
  asesores" solo con el módulo **Repartir leads entre asesores** (lo da el super admin); elegir un asesor
  en particular, con **Asignar**.
- **Eliminar actividades**: solo el super admin y solo si nadie se registró (`eliminar_actividad`).
- **Registrar varios alumnos** (Registrar lead → pestaña *Varios alumnos*): planilla para escribir fila por
  fila, pegar celdas desde Excel/Google Sheets o subir un CSV (con plantilla). Opcionalmente se asocian a
  una actividad (fichas en papel de una feria). Por defecto se **reparten por igual** entre los asesores
  (la rotación usa `clock_timestamp()` para que también sea pareja dentro de una importación). Cada fila
  pasa por `importar_leads()`: sin duplicados (DNI o celular), resultado por alumno (nuevo, actualizado,
  omitido, error), un solo aviso por asesor al final y ningún mensaje a los alumnos.
- **Proforma directa desde el chat**: botón **💰 Proforma** junto al cuadro de mensaje de cada lead. Se elige
  carrera, beneficio y forma de pago, y se envía al instante con la imagen (o PDF) sin salir de la
  conversación. Para descuentos institucionales, EXPLORE u otro campus está "Más opciones" (página Proformas).
- **Actividades y QR** (ferias, visitas a colegios, charlas): se crea la actividad con su nombre, lugar,
  fecha y a quién se asignan los registros (responsable o rotación). Cada una tiene **QR descargable**
  (imagen con logo y nombre) y **cartel A4** para imprimir. El alumno escanea y llena el formulario público
  `/r/<código>` desde su celular (nombre, celular, DNI, colegio, grado, carrera y consentimiento), sin
  iniciar sesión. El registro pasa por `registrar_lead_actividad()`: sin duplicados, asignación, aviso al
  asesor y, si se marcó, saludo de bienvenida de Genesys por WhatsApp. En Leads se filtra por actividad
  y el Excel incluye actividad, colegio y grado.
- **Prompt de Genesys** (`/genesys`): lo que sabe el bot, dividido en 11 partes y fichas pequeñas (una carrera, un programa CEPRE, una plantilla…). El CRM arma un solo prompt (con los costos del tarifario), lo revisa y guarda las versiones; *📋 Copiar prompt* para pegarlo en el asistente INFORMACIÓN de BuilderBot. Ahí también se administran los **feriados**. *Flujos de BuilderBot* (`/flujos-bot`) guarda la configuración de cada flujo. *Revisión del bot* lista las respuestas en las que Genesys no supo contestar ("no tengo información", "malentendido"…) con la pregunta del lead, para agregar el dato y marcarlas como revisadas.
- **Celulares de asesores**: siempre en la blacklist de BuilderBot y nunca se registran como leads (sus respuestas automáticas de WhatsApp a los avisos del CRM creaban leads falsos).
- **Editar asesores y leads**: el admin cambia nombre y celular de los asesores (*Editar* en Asesores y
  usuarios) y el celular de un lead (*Editar datos* en la ficha; el chat del CRM escribe a ese número).
- **Aviso al asignar desde el panel**: si un usuario asigna o reasigna un lead a *otro* asesor (ficha,
  acciones masivas o registro manual), ese asesor recibe "📌 LEAD ASIGNADO A TI" por WhatsApp con el
  enlace a la ficha. Con más de 3 leads a la vez recibe un solo resumen. Lo hace el trigger
  `leads_aviso_asignacion_*`, que llama a `/genesys/notificar`.
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

### Atención presencial, horario y ausencias

- **QR del asesor** (*Mi QR*): tarjetas imprimibles con el QR personal de cada asesor. El interesado llena
  el formulario `/w/<código>`, queda como lead de ese asesor (contactado) y envía un WhatsApp con "(Ref. …)".
  También hay QR por persona (el asesor escribe los datos).
- **El lead es de quien lo registró**: no se reasigna por QR, bot, inactividad ni CEPRE. Si un cliente de
  otro asesor viene en persona, sigue siendo de su asesor (recibe "🏢 TU LEAD VINO A LA OFICINA") y quien
  lo atendió queda como **asesor de apoyo**: ve su chat, le escribe y deja notas (*Leads → 🤝 Atendidos como apoyo*).
- **Horario de atención** (lun–jue 8:00–12:30 y 14:00–18:00, vie 8:00–13:00, sin feriados): fuera de
  horario el alumno recibe una vez el aviso de cuándo le responderán, no se reasigna y solo cuentan las
  horas hábiles. Resumen de apertura a las 8:00 y recordatorio de "próxima acción" por WhatsApp.
- **Ausencias** (*Mi cuenta* o, para el admin, *Usuarios*): por horas, días o fechas. Mientras dura no
  recibe leads nuevos y quien lo cubre ve sus chats y recibe los avisos; al terminar todo vuelve como estaba.
- **Memoria de Genesys**: el paso HTTP de BuilderBot consulta `/genesys/registrar` con `solo_contexto` y el
  CRM devuelve lo que sabe del alumno (registrado, asesor, horario, feriados).
- **Contactos con número oculto (@lid)**: BuilderBot les responde a una dirección que no existe; el CRM
  reenvía la respuesta a `<id>@lid` (tarda ~2 min por parte, por BuilderBot).

### Seguimiento y campañas (octubre 2026)

- **Origen de cada lead**: el CRM guarda por dónde abrió el chat (enlace wa.me, Facebook/Messenger, búsqueda, número en
  una web) y, si llegó desde un **anuncio de Facebook/Instagram**, el anuncio (título, enlace, ID y `ctwa_clid`); con
  anuncio, "Nos conoció por" se llena solo. Se ve en la ficha, en el Excel y en el **embudo por origen** del Dashboard.
- **📞 Llamé**: registra llamadas y WhatsApp del celular del asesor con su resultado; "contestó" cuenta como contacto y
  "volver a llamar" agenda la tarea.
- **Puntaje de interés (0–100)** por lead, con sus motivos (carrera, registrado, preguntó costos, volvió a escribir,
  vino en persona…); se recalcula cada 10 min. La lista de leads se puede ordenar por "más interesados".
- **Pruebas del prompt** (`/genesys/pruebas`): preguntas reales con lo que la respuesta debe incluir y lo que no debe decir.
  La cobertura (¿el prompt tiene el dato?) se calcula siempre; con `OPENAI_API_KEY` o `ANTHROPIC_API_KEY` en Vercel,
  el CRM también le hace las preguntas a la IA y revisa las respuestas.
- **App instalable con notificaciones**: el CRM se instala en el celular (Chrome → Instalar app; iPhone → Compartir →
  Agregar a inicio) y en *Mi cuenta* se activan las notificaciones del dispositivo (mensajes nuevos, leads asignados,
  próximas acciones). Claves VAPID en los secretos de Supabase (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACTO`).
- **Recordatorios a alumnos** (`/recordatorios`): avisos automáticos por WhatsApp (cierre de inscripciones, examen) a quienes
  ya escribieron y no se inscribieron; se crean apagados, se envían en horario de atención de a pocos y quien responde
  "NO" no recibe más. Ojo: el número de Genesys está conectado por QR (riesgo de bloqueo con envíos masivos).
- **Enlaces y QR por medio** (`/enlaces`): un enlace `…/e/<código>` y su QR por cada medio (TikTok, Facebook, flyers…).
  Abre WhatsApp con un mensaje que termina en "(Cód. O-<código>)"; el lead queda con ese origen y se ven visitas, leads,
  inscritos y matriculados por enlace. **Puntaje de interés** explicado en `/puntaje`.
- **Cierre de campaña**: el revisor del prompt avisa de fechas que ya pasaron y `/genesys` tiene los pasos para la campaña siguiente.

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
| `npm run fn:deploy` | Publica las Edge Functions `genesys` y `chat` (requiere `supabase login`) |
| `npm run fn:check` | Tipos, lint y pruebas de las funciones del bot (requiere Deno) |
| `npm run typecheck` | Revisa los tipos de todos los paquetes |
| `npm run lint` | ESLint del panel (configuración oficial de Next.js) |
| `npm run test:e2e -w panel` | Pruebas de pantallas con Playwright (ver abajo) |

## Revisión automática (GitHub Actions)

En cada push a `main` (y en cada pull request) `.github/workflows/desplegar-vercel.yml` corre los tipos,
ESLint, las pruebas de la base y las de las funciones; **el panel solo se despliega si todo pasa**.
Las migraciones y las funciones del bot se publican a mano (`npx supabase db push …` y `npm run fn:deploy`).

## Pruebas de pantallas (Playwright)

Solo leen: navegan las páginas y revisan que carguen sin errores. Las credenciales van en variables de
entorno (el repositorio es público: **nunca** las escribas en el código):

```bash
npx playwright install chromium     # la primera vez
E2E_URL=https://crm-admision.vercel.app E2E_USUARIO=usuario E2E_CLAVE=clave npm run test:e2e -w panel
```

Sin `E2E_USUARIO`/`E2E_CLAVE` solo se prueban las páginas públicas.

## Respaldos

El plan actual de Supabase **no guarda backups**. `.github/workflows/respaldo-base.yml` hace cada noche
(2:00 am) un respaldo de esquema, datos y roles, **cifrado con AES-256** (el repositorio es público) y lo
guarda 30 días en *Actions → Respaldo de la base → Artifacts*. Para activarlo, agrega en
*GitHub > Settings > Secrets and variables > Actions*:

- `SUPABASE_DB_URL`: la cadena de conexión del pooler (la misma de `db push`).
- `BACKUP_CLAVE`: una contraseña larga solo para los respaldos (guárdala aparte: sin ella no se abren).

Restaurar en un proyecto nuevo de Supabase:

```bash
gpg --decrypt respaldo-AAAA-MM-DD.tar.gz.gpg > respaldo.tar.gz && tar xzf respaldo.tar.gz
psql "<URL de la base nueva>" -f respaldo/roles.sql -f respaldo/esquema.sql -f respaldo/datos.sql
```

## Mantenimiento automático

- `webhook_eventos` (registro de lo que envía BuilderBot) se limpia cada domingo: se borran los eventos de
  más de 90 días, salvo los mensajes de contactos @lid (sirven para responderles a la dirección correcta).
- **Alertas de error**: si una acción del bot falla, los super admin reciben "⚠️ ERROR EN EL CRM" por
  WhatsApp (máximo una vez por hora por error); el historial queda en la tabla `alertas_sistema`.

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
