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
//    ping           (GET) estado de la configuración
//
//  Secretos:
//    GENESYS_BOT_TOKEN    token que envía BuilderBot / Apps Script
//    GENESYS_MODO         'sombra' (por defecto) o 'activo'
//                         sombra: el Apps Script asigna y notifica; aquí solo se guarda.
//                         activo: Supabase asigna por turnos, notifica y envía recordatorios.
//    BUILDERBOT_URL       endpoint /messages de BuilderBot Cloud
//    BUILDERBOT_API_KEY   API key de BuilderBot (bb-...)
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../_shared/database.types.ts'
import {
  botAtiendeLead,
  elegir,
  type Fuente,
  FUENTES,
  normalizarDni,
  normalizarTelefono,
  valorResuelto,
} from '../_shared/dominio.ts'
import { enviarWhatsApp, problemasBuilderBot } from '../_shared/builderbot.ts'

// Runtime de Supabase Edge Functions: mantiene viva una tarea después de responder
declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void }

type Lead = Database['public']['Tables']['leads']['Row']
type Cuerpo = Record<string, unknown>
type Respuesta = Record<string, unknown>

interface ResultadoProcesar {
  status: 'success' | 'duplicate'
  lead_id: string
  estado: string
  asesor_id: string | null
  asesor_nombre: string | null
  asesor_telefono: string | null
  notificar: boolean
}

const supabase = createClient<Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

const TOKEN = Deno.env.get('GENESYS_BOT_TOKEN') ?? ''
const MODO: 'sombra' | 'activo' = Deno.env.get('GENESYS_MODO') === 'activo' ? 'activo' : 'sombra'
const MAX_INTENTOS_NOTIFICACION = 3

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function responder(datos: Respuesta, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

class ErrorApi extends Error {
  constructor(public codigo: string, mensaje: string, public status = 200) {
    super(mensaje)
  }
}

/** Comparación en tiempo constante para no filtrar el token por tiempos de respuesta. */
function tokenValido(recibido: string | null): boolean {
  if (!TOKEN || !recibido || recibido.length !== TOKEN.length) return false
  let diferencia = 0
  for (let i = 0; i < TOKEN.length; i++) diferencia |= TOKEN.charCodeAt(i) ^ recibido.charCodeAt(i)
  return diferencia === 0
}

function telefonoDe(cuerpo: Cuerpo): string {
  const telefono = normalizarTelefono(elegir(cuerpo.telefono, cuerpo.from, cuerpo.celular, cuerpo.Celular))
  if (!telefono) throw new ErrorApi('telefono_invalido', 'Falta el teléfono del lead o no es válido', 400)
  return telefono
}

async function buscarLead(telefono: string): Promise<Lead> {
  const { data, error } = await supabase.from('leads').select('*').eq('telefono', telefono).maybeSingle()
  if (error) throw error
  if (!data) throw new ErrorApi('lead_no_existe', 'El lead no existe. Llama primero a /registrar', 404)
  return data
}

async function registrarEvento(leadId: string, contenido: string) {
  await supabase.from('lead_interacciones').insert({ lead_id: leadId, tipo: 'sistema', contenido })
}

const ENCABEZADO_POR_FUENTE: Record<Fuente, string> = {
  whatsapp_genesys: '*NUEVO PROSPECTO*',
  google_form: '*NUEVO FORMULARIO*',
  web: '*REGISTRO WEB*',
  manual: '*REGISTRO MANUAL*',
}

function mensajeNuevoLead(lead: Lead, fuente: Fuente, reenvio = false): string {
  const interes = lead.modalidad ?? lead.carrera_interes ?? lead.resumen ?? 'Consulta general'
  return [
    reenvio ? '*REENVÍO PENDIENTE*' : ENCABEZADO_POR_FUENTE[fuente],
    lead.convocatoria ? `*Convocatoria:* ${lead.convocatoria}` : null,
    '',
    `*Nombre:* ${lead.nombre ?? 'Sin nombre'}`,
    `*DNI:* ${lead.dni ?? 'Sin DNI'}`,
    `*Interés:* ${interes}`,
    `*Celular:* ${lead.telefono}`,
    `*WhatsApp:* https://wa.me/${lead.telefono}`,
  ].filter((linea) => linea !== null).join('\n')
}

/**
 * Notifica al asesor y guarda el resultado (intentos, error) en el lead.
 * La API de BuilderBot a veces tarda: se reintenta hasta 3 veces con espera creciente.
 */
async function notificarAsesor(lead: Lead, telefonoAsesor: string, fuente: Fuente, reenvio = false) {
  const texto = mensajeNuevoLead(lead, fuente, reenvio)
  let envio = await enviarWhatsApp(telefonoAsesor, texto)
  for (let intento = 1; !envio.ok && intento < 3; intento++) {
    await new Promise((r) => setTimeout(r, intento * 5_000))
    envio = await enviarWhatsApp(telefonoAsesor, texto)
  }
  const { error } = await supabase.rpc('marcar_notificacion', {
    p_lead_id: lead.id,
    p_ok: envio.ok,
    p_error: envio.error,
  })
  if (error) console.error('[genesys] No se pudo guardar el resultado de la notificación:', error.message)
  if (!envio.ok) console.error('[genesys] Error notificando al asesor:', envio.error)
  return envio.ok
}

// ---------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------

/** Todo el que escribe es un lead. Si ya tiene asesor, bot_atiende=false: Genesys no debe responder. */
async function registrar(cuerpo: Cuerpo): Promise<Respuesta> {
  const telefono = telefonoDe(cuerpo)
  const { data, error } = await supabase.rpc('registrar_lead', {
    p_telefono: telefono,
    p_mensaje: valorResuelto(cuerpo.mensaje) ?? undefined,
  })
  if (error) throw error

  let lead = data
  if (lead.estado === 'lead_nuevo') {
    const actualizado = await supabase.from('leads').update({ estado: 'lead_en_conversacion' })
      .eq('id', lead.id).select().single()
    if (actualizado.error) throw actualizado.error
    lead = actualizado.data
  }
  return {
    ok: true,
    lead_id: lead.id,
    es_nuevo: lead.total_mensajes <= 1,
    estado: lead.estado,
    nombre: lead.nombre ?? '',
    bot_atiende: botAtiendeLead(lead.estado),
  }
}

/**
 * Registro completo del lead. Acepta el mismo JSON que doPost del Apps Script
 * (Nombres, DNI, Celular/from, Modalidad, Carrera, Consulta, NombreHoja) y responde
 * con los mismos campos (status, registrado, duplicado, mensaje, telefono_asesor, ...).
 * Campos extra opcionales:
 *   fuente           whatsapp_genesys | google_form | web | manual
 *   telefono_asesor  asesor ya elegido y avisado (modo sombra: el que asignó el Apps Script).
 *                    Con asesor fijo no se asigna por turnos ni se vuelve a notificar.
 */
async function webhook(cuerpo: Cuerpo): Promise<Respuesta> {
  const nombre = elegir(cuerpo.Nombres, cuerpo.nombres, cuerpo.Nombre, cuerpo.nombre, cuerpo.name)
  const dni = normalizarDni(elegir(cuerpo.DNI, cuerpo.dni, cuerpo.Documento, cuerpo.documento))
  const telefono = normalizarTelefono(
    elegir(cuerpo.from, cuerpo.telefono, cuerpo.Telefono, cuerpo.Celular, cuerpo.celular, cuerpo.phone),
  )
  const modalidad = elegir(cuerpo.Modalidad, cuerpo.modalidad)
  const carrera = elegir(cuerpo.Carrera, cuerpo.carrera)
  const consulta = elegir(cuerpo.Consulta, cuerpo.consulta, cuerpo.interes)
  const convocatoria = elegir(cuerpo.NombreHoja, cuerpo.nombreHoja, cuerpo.hoja, cuerpo.convocatoria)
  const fuenteTexto = elegir(cuerpo.fuente)
  const fuente: Fuente = FUENTES.includes(fuenteTexto as Fuente) ? (fuenteTexto as Fuente) : 'whatsapp_genesys'
  const telefonoAsesor = normalizarTelefono(elegir(cuerpo.telefono_asesor))

  // Mismas validaciones que validarLeadBot del Apps Script
  const motivo = !nombre
    ? 'Nombre vacío o variable sin resolver.'
    : !dni && !telefono
    ? 'No se recibió DNI ni celular.'
    : null
  if (motivo) {
    console.warn('[genesys] Webhook ignorado:', motivo)
    return {
      status: 'ignored', accion: 'ignorado', registrado: false, duplicado: false,
      mensaje: motivo, enviar_mensaje_cliente: false, mensaje_cliente: '',
    }
  }

  // Asesor fijo (modo sombra o formulario web con asesor elegido)
  let asesorFijoId: string | null = null
  if (telefonoAsesor) {
    const { data } = await supabase.from('asesores').select('id').eq('telefono', telefonoAsesor).maybeSingle()
    asesorFijoId = data?.id ?? null
    if (!asesorFijoId) console.warn(`[genesys] telefono_asesor ${telefonoAsesor} no está en la tabla asesores`)
  }

  // Solo se notifica cuando la asignación la hace Supabase: si el asesor llega fijo,
  // quien lo eligió (Apps Script, formulario web) ya le avisó.
  const notificar = MODO === 'activo' && !asesorFijoId && fuente !== 'manual'
  const { data, error } = await supabase.rpc('procesar_lead', {
    p_telefono: telefono ?? undefined,
    p_dni: dni ?? undefined,
    p_nombre: nombre!,
    p_carrera: carrera ?? undefined,
    p_modalidad: modalidad ?? undefined,
    // Regla del Apps Script: si llega Modalidad, es un lead de CePre
    p_programa: modalidad ? 'cepre' : 'pregrado',
    p_convocatoria: convocatoria ?? undefined,
    p_consulta: consulta ?? undefined,
    p_origen: fuente,
    p_asesor_id: asesorFijoId ?? undefined,
    p_asignar: MODO === 'activo',
    p_notificar: notificar,
  })
  if (error) throw error
  const r = data as unknown as ResultadoProcesar

  if (r.status === 'duplicate') {
    return {
      status: 'duplicate', accion: 'duplicado_ignorado', registrado: false, duplicado: true,
      mensaje: r.asesor_nombre ?? '', telefono_asesor: r.asesor_telefono ?? '',
      lead_id: r.lead_id, notificacion_asesor: '', bot_atiende: botAtiendeLead(r.estado), modo: MODO,
      enviar_mensaje_cliente: false,
      mensaje_cliente: 'Tu registro ya fue recibido anteriormente. Un asesor se comunicará contigo.',
    }
  }

  // Lo que el lead respondió a Genesys queda visible en la conversación del CRM
  const datosBot = [
    ['Nombre', nombre], ['DNI', dni], ['Carrera', carrera], ['Modalidad', modalidad],
    ['Consulta', consulta], ['Convocatoria', convocatoria],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
  await registrarEvento(r.lead_id, `Datos entregados a Genesys:\n${datosBot}`)

  let notificacion = r.asesor_id ? 'omitida' : ''
  if (r.notificar && r.asesor_telefono) {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', r.lead_id).single()
    if (lead) {
      // Se responde a BuilderBot de inmediato (espera máx. 30 s) y el WhatsApp sale en segundo plano
      EdgeRuntime.waitUntil(notificarAsesor(lead, r.asesor_telefono, fuente))
      notificacion = 'en_proceso'
    }
  }

  return {
    status: 'success', accion: 'registrado', registrado: true, duplicado: false,
    mensaje: r.asesor_nombre ?? '', telefono_asesor: r.asesor_telefono ?? '',
    lead_id: r.lead_id, notificacion_asesor: notificacion, bot_atiende: botAtiendeLead(r.estado), modo: MODO,
    enviar_mensaje_cliente: true,
    mensaje_cliente: r.asesor_nombre
      ? `Tu información fue registrada correctamente. Se te asignó a ${r.asesor_nombre}.`
      : 'Tu información fue registrada correctamente. Un asesor se comunicará contigo pronto.',
  }
}

/** El lead no quiere asesor: queda como lead_no_interesado (no se borra). */
async function noInteresado(cuerpo: Cuerpo): Promise<Respuesta> {
  const telefono = telefonoDe(cuerpo)
  let lead = await buscarLead(telefono)

  // Un lead que ya pasó a un asesor no vuelve atrás por un mensaje al bot
  if (botAtiendeLead(lead.estado)) {
    const { data, error } = await supabase.from('leads').update({
      estado: 'lead_no_interesado',
      motivo_no_interes: valorResuelto(cuerpo.motivo) ?? 'No quiso contacto de asesor',
    }).eq('id', lead.id).select().single()
    if (error) throw error
    lead = data
  }
  return {
    ok: true,
    estado: lead.estado,
    bot_atiende: botAtiendeLead(lead.estado),
    mensaje: '¡Entendido! Tus consultas quedan registradas. Escríbeme cuando quieras 😊',
  }
}

/** Opcional: guarda en el historial lo que respondió Genesys. */
async function respuestaBot(cuerpo: Cuerpo): Promise<Respuesta> {
  const telefono = telefonoDe(cuerpo)
  const contenido = valorResuelto(cuerpo.texto)
  if (!contenido) throw new ErrorApi('sin_texto', 'Falta el texto de la respuesta', 400)
  const lead = await buscarLead(telefono)
  const { error } = await supabase
    .from('lead_interacciones')
    .insert({ lead_id: lead.id, tipo: 'respuesta_bot', contenido: contenido.slice(0, 4000) })
  if (error) throw error
  return { ok: true }
}

/**
 * Tarea diaria (8am, ver docs): solo en modo activo.
 * 1) Reintenta notificaciones pendientes o con error (máx. 3 intentos).
 * 2) Envía a cada asesor un resumen de sus leads asignados hace más de 12 h sin contactar.
 */
async function recordatorios(): Promise<Respuesta> {
  if (MODO !== 'activo') return { ok: true, omitido: 'En modo sombra los recordatorios los envía el Apps Script' }

  const seleccion = '*, asesor:asesores!leads_asesor_id_fkey(nombre, telefono)'

  // 1) Reintentos de notificación
  const pendientes = await supabase.from('leads').select(seleccion)
    .in('notificacion_estado', ['pendiente', 'error'])
    .lt('notificacion_intentos', MAX_INTENTOS_NOTIFICACION)
    .not('asesor_id', 'is', null)
    .lt('fecha_asignado', new Date(Date.now() - 5 * 60_000).toISOString())
  if (pendientes.error) throw pendientes.error
  let reenviadas = 0
  for (const lead of pendientes.data) {
    if (!lead.asesor?.telefono) continue
    const fuente = (FUENTES as readonly string[]).includes(lead.origen) ? (lead.origen as Fuente) : 'whatsapp_genesys'
    if (await notificarAsesor(lead, lead.asesor.telefono, fuente, true)) reenviadas++
  }

  // 2) Resumen por asesor de leads sin contactar
  const sinContactar = await supabase.from('leads').select(seleccion)
    .eq('estado', 'lead_asignado')
    .is('recordatorio_enviado', null)
    .lt('fecha_asignado', new Date(Date.now() - 12 * 3_600_000).toISOString())
    .order('fecha_asignado')
  if (sinContactar.error) throw sinContactar.error

  const porAsesor = new Map<string, typeof sinContactar.data>()
  for (const lead of sinContactar.data) {
    if (!lead.asesor?.telefono || !lead.asesor_id) continue
    porAsesor.set(lead.asesor_id, [...(porAsesor.get(lead.asesor_id) ?? []), lead])
  }

  let recordatoriosEnviados = 0
  for (const leads of porAsesor.values()) {
    const asesor = leads[0]!.asesor!
    const dias = (fecha: string | null) => Math.max(0, Math.floor((Date.now() - Date.parse(fecha ?? '')) / 86_400_000))
    const lineas = leads.slice(0, 15).map((l) =>
      `• ${l.nombre ?? 'Sin nombre'} – wa.me/${l.telefono} (${dias(l.fecha_asignado) === 0 ? 'hoy' : `hace ${dias(l.fecha_asignado)} d`})`
    )
    const texto = [
      '*RECORDATORIO DE ADMISIÓN*',
      '',
      `Hola *${asesor.nombre.split(' ')[0]}*, tienes ${leads.length} lead(s) sin contactar:`,
      ...lineas,
      leads.length > 15 ? `… y ${leads.length - 15} más en el panel.` : null,
      '',
      'Por favor, inicia la gestión y actualiza su estado en el panel.',
    ].filter((linea) => linea !== null).join('\n')

    const envio = await enviarWhatsApp(asesor.telefono!, texto)
    if (!envio.ok) {
      console.error(`[genesys] Recordatorio a ${asesor.nombre} falló:`, envio.error)
      continue
    }
    recordatoriosEnviados++
    const ids = leads.map((l) => l.id)
    await supabase.from('leads').update({ recordatorio_enviado: new Date().toISOString() }).in('id', ids)
    await Promise.all(ids.map((id) => registrarEvento(id, 'Recordatorio enviado al asesor')))
  }

  return { ok: true, notificaciones_reenviadas: reenviadas, recordatorios_enviados: recordatoriosEnviados }
}

/** Diagnóstico sin exponer secretos (equivale a doGet ?v=bot + diagnosticarConfigBuilderBot). */
function ping(): Respuesta {
  const problemas = problemasBuilderBot()
  return {
    ok: true,
    mensaje: 'API de Genesys activa. Lista para recibir datos del bot.',
    modo: MODO,
    builderbot_configurado: problemas.length === 0,
    problemas,
  }
}

const ACCIONES: Record<string, (cuerpo: Cuerpo) => Promise<Respuesta> | Respuesta> = {
  'registrar': registrar,
  'webhook': webhook,
  'no-interesado': noInteresado,
  'respuesta-bot': respuestaBot,
  'recordatorios': recordatorios,
  'ping': ping,
}

// ---------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (!tokenValido(req.headers.get('x-genesys-token'))) {
    return responder({ ok: false, error: 'no_autorizado' }, 401)
  }

  const accion = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? ''
  const manejar = ACCIONES[accion]
  if (!manejar) {
    return responder({ ok: false, error: 'accion_desconocida', acciones: Object.keys(ACCIONES) }, 404)
  }

  let cuerpo: Cuerpo = {}
  if (req.method === 'POST') {
    try {
      const texto = await req.text()
      cuerpo = texto.trim() ? JSON.parse(texto) : {}
    } catch {
      return responder({ ok: false, status: 'error', error: 'json_invalido', mensaje: 'El cuerpo debe ser JSON válido' }, 400)
    }
  } else if (accion !== 'ping') {
    return responder({ ok: false, error: 'metodo_no_permitido' }, 405)
  }

  try {
    return responder(await manejar(cuerpo))
  } catch (e) {
    if (e instanceof ErrorApi) {
      return responder({ ok: false, status: 'error', error: e.codigo, mensaje: e.message }, e.status)
    }
    console.error(`[genesys] Error en /${accion}:`, e)
    return responder({ ok: false, status: 'error', error: 'error_interno' }, 500)
  }
})
