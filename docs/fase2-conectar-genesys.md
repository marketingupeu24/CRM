# Fase 2 — Migrar Genesys de Google Sheets a Supabase

Hoy Genesys (BuilderBot Cloud) envía cada lead al **Apps Script**, que lo guarda en Google Sheets,
elige al asesor por turnos y le avisa por WhatsApp con la API de BuilderBot.

Supabase reemplaza al Apps Script con la **Edge Function `genesys`**. La migración va en dos etapas:

| Etapa | Quién asigna y avisa al asesor | Qué hace Supabase |
|---|---|---|
| **1. Modo sombra** (ahora) | El Apps Script, como siempre | Recibe una copia de cada lead **con el mismo asesor**. No avisa a nadie. |
| **2. Modo activo** (cuando confíen en los datos) | Supabase | Asigna por turnos, avisa al asesor, reintenta avisos fallidos y envía recordatorios a las 8am. |

```
Etapa 1 (sombra)
WhatsApp ─► Genesys ─► Apps Script ─► Google Sheets + aviso al asesor
                            └─ copia ─► Supabase /webhook (mismo asesor, sin aviso)
         └─ /registrar ─► Supabase (todo el que escribe es lead)

Etapa 2 (activo)
WhatsApp ─► Genesys ─► Supabase /webhook ─► asigna + aviso al asesor (API BuilderBot)
```

---

## 1. Publicar la API (una sola vez)

Requisitos: Node.js 20+ y la Fase 1 aplicada (`npm run db:link` y `npm run db:push`).

```bash
# 1) Token secreto para Genesys y el Apps Script (guárdalo en un lugar seguro)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2) Secretos de la función (modo sombra por defecto)
npx supabase secrets set GENESYS_BOT_TOKEN=pega_aqui_el_token GENESYS_MODO=sombra

# 3) Publicar
npm run fn:deploy
```

Prueba (debe responder `"modo":"sombra"`):

```bash
curl https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys/ping -H "x-genesys-token: TU_TOKEN"
```

También carga tus asesores reales: ejecuta `supabase/seed.local.sql` en el SQL Editor
(no está en git porque tiene datos personales).

---

## 2. Etapa 1 — Modo sombra

### 2.1 Apps Script: copiar cada lead a Supabase

1. En el Apps Script, **Configuración del proyecto > Propiedades del script**, agrega:
   - `SUPABASE_GENESYS_URL` = `https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys`
   - `SUPABASE_GENESYS_TOKEN` = tu token
2. Pega la función de [`apps-script/espejo_supabase.gs`](apps-script/espejo_supabase.gs) al final del script.
3. Agrega las 4 llamadas que se indican en ese archivo (bot, Google Form, formulario web y manual).
4. Implementa de nuevo la aplicación web (**Implementar > Gestionar implementaciones > Editar > Nueva versión**).

Así Supabase tiene **los mismos leads con los mismos asesores** que el Sheet, venga de donde venga.

### 2.2 BuilderBot: registrar a todo el que escribe

Al **inicio del flujo principal**, agrega una llamada del plugin HTTP:

| Campo | Valor |
|---|---|
| Método | `POST` |
| URL | `https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys/registrar` |
| Headers | `Content-Type: application/json` · `x-genesys-token: TU_TOKEN` |
| Cuerpo | `{ "telefono": "{{TELEFONO}}", "mensaje": "{{MENSAJE}}" }` |

> `{{TELEFONO}}` y `{{MENSAJE}}` son las variables de BuilderBot Cloud: usa las mismas que ya
> envías al Apps Script para el celular (`from`) y el mensaje.

Respuesta: `{ "ok": true, "estado": "lead_en_conversacion", "bot_atiende": true, ... }`

`bot_atiende` es `false` cuando el lead ya pasó a un asesor. Durante el modo sombra es solo
informativo; la condición "si `bot_atiende` es false, no responder" se activa en la etapa 2.

### 2.3 (Opcional) Leads que no quieren asesor

Si el flujo tiene una rama "no quiero que me contacten":

`POST .../genesys/no-interesado` con `{ "telefono": "{{TELEFONO}}", "motivo": "No quiso asesor" }`

El lead queda como `lead_no_interesado` (no se borra).

### 2.4 Cómo probar el modo sombra

1. Escribe al bot desde un WhatsApp de prueba y completa el registro.
2. En Supabase > Table Editor > `leads` debe aparecer el lead con **el mismo asesor** que en el Sheet,
   `origen = whatsapp_genesys` y `notificacion_estado = omitida`.
3. Repite el registro con el mismo DNI: en Supabase no se crea otro lead y sube `duplicados_ignorados`.
4. Registra un lead por el Google Form, el formulario web y la hoja REGISTRO: deben llegar con
   `origen` `google_form`, `web` y `manual`.
5. Compara durante unos días el Sheet con la vista `vista_leads_por_asesor`.

Los errores se ven en **Supabase > Edge Functions > genesys > Logs** y, del lado del Apps Script,
en **Ejecuciones**.

---

## 3. Etapa 2 — Pasar a modo activo

Cuando los datos coincidan:

```bash
npx supabase secrets set GENESYS_MODO=activo \
  BUILDERBOT_URL="la misma URL /messages del Apps Script" \
  BUILDERBOT_API_KEY="la misma API key bb-... del Apps Script"
npm run fn:deploy
```

Revisa con `/ping` que `builderbot_configurado` sea `true`.

1. **BuilderBot**: en la llamada HTTP que hoy va al Apps Script, cambia solo la URL a
   `https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys/webhook` y agrega el header
   `x-genesys-token`. **El cuerpo JSON es el mismo** y la respuesta trae los mismos campos
   (`status`, `registrado`, `duplicado`, `mensaje`, `telefono_asesor`, `mensaje_cliente`, …),
   así que el resto del flujo no cambia.
2. **BuilderBot**: después de `/registrar`, agrega la condición: si `bot_atiende` es `false`,
   terminar el flujo sin responder (el lead ya es del asesor).
3. **Apps Script**: quita el activador diario `enviarRecordatoriosPendientes` (los recordatorios
   ahora salen de Supabase) y la llamada `enviarLeadASupabase` de `doPost`.
   Si mantienes el Google Form o el formulario web en el Apps Script, deja sus llamadas:
   llegan con el asesor ya elegido y Supabase no vuelve a avisar.
4. **Recordatorios de las 8am** (una sola vez, en el SQL Editor):

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;

   select vault.create_secret('https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys', 'genesys_url');
   select vault.create_secret('PEGA_AQUI_EL_TOKEN', 'genesys_token');

   -- 13:00 UTC = 8:00 en Lima
   select cron.schedule('genesys-recordatorios', '0 13 * * *', $$
     select net.http_post(
       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'genesys_url') || '/recordatorios',
       headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'x-genesys-token', (select decrypted_secret from vault.decrypted_secrets where name = 'genesys_token')),
       body    := '{}'::jsonb
     );
   $$);
   ```

   Cada día a las 8am: reintenta los avisos al asesor que fallaron (máx. 3 intentos) y envía a
   cada asesor un resumen de sus leads asignados hace más de 12 h que siguen sin contactar.

### Cómo probar el modo activo

```bash
F=https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys
curl -X POST $F/webhook -H "Content-Type: application/json" -H "x-genesys-token: TU_TOKEN" \
  -d '{"Nombres":"Prueba CRM","DNI":"70000001","Celular":"951000001","Carrera":"Psicología","NombreHoja":"2026-2"}'
# -> status success, mensaje = asesor asignado, notificacion_asesor = enviada
# Repite el mismo comando -> status duplicate, sin segundo aviso
curl -X POST $F/recordatorios -H "x-genesys-token: TU_TOKEN"
```

Limpia la prueba: `delete from leads where dni = '70000001';`

---

## 4. Reglas que replica Supabase (igual que el Apps Script)

- **Duplicados**: se busca por DNI y luego por celular. Un lead repetido (o un reintento de
  BuilderBot) responde `status: duplicate`, no crea otra fila y no vuelve a avisar al asesor.
- **Mismo DNI desde otro número**: se trata como duplicado del lead original.
- **Variables sin resolver** (`{nombre}`) o sin DNI ni celular: `status: ignored`.
- **CePre**: si llega `Modalidad`, el lead es de CePre y va a los asesores con `CEPRE` en `carreras` (Judith).
- **Rotación**: el resto va por turnos entre los asesores generales (`carreras` vacío).
- **DNI de relleno** (`S/D-FORM-…`, `S/D-WEB-…`) no se guarda como DNI.
- **Celular de 9 dígitos** (`951…`) se guarda como `51951…`.
