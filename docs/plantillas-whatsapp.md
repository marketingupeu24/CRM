# Plantillas de WhatsApp (API oficial de Meta)

Con la API oficial, WhatsApp solo deja escribir **mensajes libres hasta 24 horas después del último mensaje
de la persona**. Pasado ese tiempo (o si la persona nunca escribió) solo se pueden enviar **plantillas
aprobadas por Meta**. Este documento tiene las plantillas que necesita el CRM, listas para enviar a aprobación.

## Dónde se crean

1. Entra a **WhatsApp Manager** (business.facebook.com → WhatsApp Manager) → **Administrar plantillas** → **Crear plantilla**.
2. Elige la **categoría** y el **idioma: Español (es)** que indica cada plantilla.
3. Copia el **nombre** (minúsculas y guiones bajos) y el **cuerpo** tal cual. Las variables van como `{{1}}`, `{{2}}`…
4. Meta pide un **ejemplo** de cada variable: usa los de la columna "Ejemplo".
5. Cuando estén **aprobadas**, avisa los nombres: el CRM las usará automáticamente fuera de las 24 h.

> Meta revisa en minutos u horas. Si rechaza una, suele ser por la categoría: las de seguimiento comercial
> van como **Marketing**; las de avisos operativos como **Utilidad**.

## Para los asesores (avisos internos)

Los asesores reciben los avisos del CRM en su WhatsApp. Si un asesor no le escribió al número de Genesys en
las últimas 24 h, sin plantilla ese aviso **no le llega**.

### 1. `aviso_lead_asesor` — Utilidad
| Cuerpo |
|---|
| 📌 Tienes un lead nuevo en Admisión: *{{1}}* ({{2}}). Interés: {{3}}. Ábrelo en el CRM: {{4}} |

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Nombre del alumno | María Quispe |
| {{2}} | Celular | 51987654321 |
| {{3}} | Carrera o consulta | Enfermería |
| {{4}} | Enlace al chat en el CRM | https://crm-admision.vercel.app/chats/123 |

### 2. `aviso_mensaje_asesor` — Utilidad
| Cuerpo |
|---|
| 💬 *{{1}}* te escribió por el WhatsApp de Admisión. Respóndele desde el CRM: {{2}} |

| Variable | Ejemplo |
|---|---|
| {{1}} Nombre del alumno | María Quispe |
| {{2}} Enlace al chat | https://crm-admision.vercel.app/chats/123 |

### 3. `resumen_asesor` — Utilidad
| Cuerpo |
|---|
| Buenos días, {{1}} ☀️ Tienes *{{2}}* leads por contactar y *{{3}}* mensajes sin responder. Revísalos en el CRM: {{4}} |

| Variable | Ejemplo |
|---|---|
| {{1}} Nombre del asesor | Julio |
| {{2}} Leads por contactar | 5 |
| {{3}} Mensajes sin responder | 3 |
| {{4}} Enlace | https://crm-admision.vercel.app/pendientes |

## Para los alumnos

### 4. `retomar_conversacion` — Marketing
Para volver a escribirle a un alumno que no responde hace más de 24 h (el botón del chat la propondrá).

| Cuerpo |
|---|
| ¡Hola, {{1}}! 👋 Te escribe Admisión de la Universidad Peruana Unión – campus Juliaca. ¿Pudiste revisar la información de *{{2}}*? Responde este mensaje y un asesor(a) te ayuda con tu inscripción 😊 |

| Variable | Ejemplo |
|---|---|
| {{1}} Primer nombre | María |
| {{2}} Carrera | Enfermería |

Pie de página sugerido: `Responde NO si no deseas recibir más mensajes.`

### 5. `recordatorio_admision` — Marketing
Para los recordatorios masivos (cierre de inscripciones, simulacro, CEPRE…). El texto de cada campaña va en {{2}}.

| Cuerpo |
|---|
| ¡Hola, {{1}}! 👋 Te recuerda Admisión de la Universidad Peruana Unión – campus Juliaca: {{2}} Si tienes dudas, responde este mensaje 😊 |

| Variable | Ejemplo |
|---|---|
| {{1}} Primer nombre | María |
| {{2}} Aviso | las inscripciones para el examen del 22 de noviembre cierran el 17 de noviembre. |

Pie de página sugerido: `Responde NO si no deseas recibir más mensajes.`

### 6. `registro_confirmado` — Utilidad
Para confirmar el registro hecho con el QR o el formulario (si el alumno aún no escribió).

| Cuerpo |
|---|
| ¡Listo, {{1}}! ✅ Quedaste registrado(a) en Admisión de la Universidad Peruana Unión – campus Juliaca. Un asesor(a) de Admisión se comunicará contigo pronto por este chat. |

| Variable | Ejemplo |
|---|---|
| {{1}} Primer nombre | María |

## Doble check (entregado / leído)

Meta avisa cuando un mensaje se **entregó**, se **leyó** o **falló**. El CRM ya está listo para mostrarlo
(✓✓ gris = entregado, ✓✓ azul = leído, ⚠️ = no se entregó), pero **BuilderBot debe reenviar esos avisos al webhook**.
Mensaje sugerido para el soporte de BuilderBot (support@builderbot.cloud):

> Hola. Mi bot (proyecto 13cdbdca-9b0d-4088-9edf-2bbf843292d5) usa el proveedor Meta. Necesito que el webhook
> que tengo configurado reciba también los **eventos de estado de los mensajes** de Meta (sent, delivered, read,
> failed), con el id del mensaje (wamid). Además: ¿cómo envío una **plantilla aprobada** por su API REST
> (`/messages`), con sus variables? Gracias.
