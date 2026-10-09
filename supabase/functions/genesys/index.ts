// =====================================================================
//  API de Genesys (Supabase Edge Function)
//  Reemplaza al Apps Script de Google Sheets. La service_role key y la API key
//  de BuilderBot viven solo aquí dentro (secretos de Supabase).
//
//  URL base: https://<proyecto>.supabase.co/functions/v1/genesys/<accion>
//  Header:   x-genesys-token: <GENESYS_BOT_TOKEN>
//  Acciones (POST, cuerpo JSON):
//    registrar      { telefono, mensaje? }       -> al inicio de cada conversación
//    webhook        mismo JSON que hoy recibe el Apps Script (Nombres, DNI, Celular, ...)
//    no-interesado  { telefono, motivo? }
//    respuesta-bot  { telefono, texto }
//    recordatorios  {}                            -> lo llama el cron diario de las 8am
//    evento         webhook de BuilderBot (mensajes entrantes y salientes)
//    notificar, visita, ausencia, reasignar, reintentar-avisos, recordar-tareas, sincronizar-bot
//                   -> los llama la base de datos (triggers y cron)
//    ping           (GET) estado de la configuración
//
//  Secretos:
//    GENESYS_BOT_TOKEN    token que envía BuilderBot / Apps Script
//    GENESYS_MODO         'sombra' (por defecto) o 'activo'
//                         sombra: el Apps Script asigna y notifica; aquí solo se guarda.
//                         activo: Supabase asigna por turnos, notifica y envía recordatorios.
//    BUILDERBOT_URL       endpoint /messages de BuilderBot Cloud
//    BUILDERBOT_API_KEY   API key de BuilderBot (bb-...)
//
//  Código dividido por tema: comun.ts, registro.ts, contexto.ts, eventos.ts, avisos.ts, programadas.ts
// =====================================================================
import { type Cuerpo, type Respuesta, supabase, responder, ErrorApi, tokenValido, cargarFeriados } from './comun.ts'
import { notificarAsignacion, avisarVisita, avisarAusencia, alertarError } from './avisos.ts'
import { registrar, webhook, noInteresado, respuestaBot } from './registro.ts'
import { reintentar, recordatorios, recordarTareas, ping, sincronizarBot, reasignar } from './programadas.ts'
import { evento } from './eventos.ts'

// Runtime de Supabase Edge Functions: mantiene viva una tarea después de responder
declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void }

const ACCIONES: Record<string, (cuerpo: Cuerpo) => Promise<Respuesta> | Respuesta> = {
  'registrar': registrar,
  'webhook': webhook,
  'no-interesado': noInteresado,
  'respuesta-bot': respuestaBot,
  'recordatorios': recordatorios,
  'sincronizar-bot': sincronizarBot,
  'reasignar': reasignar,
  'reintentar-avisos': reintentar,
  'recordar-tareas': recordarTareas,
  'notificar': notificarAsignacion,
  'visita': avisarVisita,
  'ausencia': avisarAusencia,
  'ping': ping,
}

// ---------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------
/** Cuerpo del webhook en cualquier formato: JSON, formulario o parámetros de la URL. */
function leerCuerpoFlexible(texto: string, contentType: string, url: URL): Cuerpo {
  if (texto.trim()) {
    try {
      return JSON.parse(texto)
    } catch {
      if (contentType.includes('form') || texto.includes('=')) return Object.fromEntries(new URLSearchParams(texto))
      return { texto_crudo: texto.slice(0, 4000) }
    }
  }
  const params = Object.fromEntries(url.searchParams)
  delete params.token
  return params
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  // El webhook de BuilderBot puede no permitir headers: también se acepta ?token=
  const tokenRecibido = req.headers.get('x-genesys-token') ?? url.searchParams.get('token')
  const accion = url.pathname.split('/').filter(Boolean).pop() ?? ''

  // Webhook de BuilderBot: se registra TODA llamada (antes de validar) para poder diagnosticar
  if (accion === 'evento') {
    const contentType = req.headers.get('content-type') ?? ''
    const cuerpo = leerCuerpoFlexible(await req.text(), contentType, url)
    const autorizado = tokenValido(tokenRecibido)
    const { data: registro } = await supabase.from('webhook_eventos').insert({
      payload: { metodo: req.method, content_type: contentType, token_ok: autorizado, cuerpo } as never,
      procesado: autorizado ? 'recibido' : 'rechazado: token inválido',
    }).select('id').single()
    if (!autorizado) return responder({ ok: false, error: 'no_autorizado' }, 401)
    try {
      await cargarFeriados()
      return responder(await evento(cuerpo, registro?.id ?? null))
    } catch (e) {
      console.error('[genesys] Error en /evento:', e)
      EdgeRuntime.waitUntil(alertarError('evento', e))
      return responder({ ok: false, error: 'error_interno' }, 500)
    }
  }

  if (!tokenValido(tokenRecibido)) {
    // Se registra el rechazo (sin el token) para detectar pasos de BuilderBot mal configurados
    if (accion !== 'ping') {
      EdgeRuntime.waitUntil(Promise.resolve(supabase.from('webhook_eventos').insert({
        payload: { accion, ruta: url.pathname, token_ok: false, token_inicio: (tokenRecibido ?? '').slice(0, 4), user_agent: req.headers.get('user-agent') } as never,
        procesado: `${accion}: rechazado (token inválido)`,
      })).then(() => undefined))
    }
    return responder({ ok: false, error: 'no_autorizado' }, 401)
  }

  await cargarFeriados()
  const manejar = ACCIONES[accion]
  if (!manejar) {
    // Dirección mal escrita (ej. BuilderBot con la URL cortada): queda registrada para revisarla
    EdgeRuntime.waitUntil(Promise.resolve(supabase.from('webhook_eventos').insert({
      payload: { accion, ruta: url.pathname, token_ok: true } as never,
      procesado: `accion desconocida: ${accion}`,
    })).then(() => undefined))
    return responder({ ok: false, error: 'accion_desconocida', acciones: Object.keys(ACCIONES) }, 404)
  }

  let cuerpo: Cuerpo = {}
  if (req.method === 'POST') {
    const texto = await req.text()
    try {
      cuerpo = texto.trim() ? JSON.parse(texto) : {}
    } catch {
      // BuilderBot puede enviar el body como formulario (clave/valor): se acepta igual
      cuerpo = leerCuerpoFlexible(texto, req.headers.get('content-type') ?? '', url)
      if (!Object.keys(cuerpo).length) {
        EdgeRuntime.waitUntil(Promise.resolve(supabase.from('webhook_eventos').insert({
          payload: { accion, ruta: url.pathname, token_ok: true, cuerpo_crudo: texto.slice(0, 2000), content_type: req.headers.get('content-type') } as never,
          procesado: `${accion}: cuerpo ilegible`,
        })).then(() => undefined))
        return responder({ ok: false, status: 'error', error: 'json_invalido', mensaje: 'El cuerpo debe ser JSON válido' }, 400)
      }
    }
  } else if (accion !== 'ping') {
    return responder({ ok: false, error: 'metodo_no_permitido' }, 405)
  }

  try {
    const inicio = Date.now()
    const respuesta = await manejar(cuerpo)
    // Diagnóstico del registro que hace el bot (BuilderBot a veces lo repite en bucle):
    // qué envió, qué se respondió y cuánto tardó, en webhook_eventos.
    // registrar: cómo consulta BuilderBot en cada mensaje (para conectar el contexto del alumno)
    if (accion === 'webhook' || accion === 'registrar') {
      EdgeRuntime.waitUntil(Promise.resolve(supabase.from('webhook_eventos').insert({
        payload: { accion, cuerpo, respuesta, ms: Date.now() - inicio, user_agent: req.headers.get('user-agent') } as never,
        procesado: `${accion}: ${String((respuesta as { accion?: unknown; estado?: unknown }).accion ?? (respuesta as { estado?: unknown }).estado ?? '')}`,
      })).then(() => undefined))
    }
    return responder(respuesta)
  } catch (e) {
    if (e instanceof ErrorApi) {
      return responder({ ok: false, status: 'error', error: e.codigo, mensaje: e.message }, e.status)
    }
    console.error(`[genesys] Error en /${accion}:`, e)
    EdgeRuntime.waitUntil(alertarError(accion, e))
    return responder({ ok: false, status: 'error', error: 'error_interno' }, 500)
  }
})
