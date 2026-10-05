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
  ESTADOS_AVISO_MENSAJE,
  leadEnEtapaBot,
  normalizarOrigen,
  elegir,
  type Fuente,
  FUENTES,
  normalizarDni,
  normalizarTelefono,
  valorResuelto,
} from '../_shared/dominio.ts'
import { cambiarBlacklist, enviarWhatsApp, problemasBuilderBot } from '../_shared/builderbot.ts'

// Runtime de Supabase Edge Functions: mantiene viva una tarea después de responder
declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void }

type Lead = Database['public']['Tables']['leads']['Row']
type Cuerpo = Record<string, unknown>
type Respuesta = Record<string, unknown>

interface ResultadoProcesar {
  status: 'success' | 'updated' | 'duplicate'
  reasignado?: boolean
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
// Pausa con la blacklist de BuilderBot (calla al bot, pero BuilderBot deja de enviar los mensajes
// de ese número al CRM). Apagada por defecto: secreto BLACKLIST_PAUSA=activa para encenderla.
const USAR_BLACKLIST = Deno.env.get('BLACKLIST_PAUSA') === 'activa'
const PANEL_URL = (Deno.env.get('PANEL_URL') ?? 'https://crm-admision.vercel.app').replace(/\/+$/, '')
// Aviso de mensaje nuevo al asesor: como máximo uno cada 10 minutos por lead
const MINUTOS_ENTRE_AVISOS = 10

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
  actividad: '*REGISTRO POR QR (FERIA / COLEGIO)*',
}

type TipoAviso = 'nuevo' | 'reenvio' | 'reconsulta' | 'reasignado' | 'asignado'

function mensajeNuevoLead(lead: Lead, fuente: Fuente, tipo: TipoAviso = 'nuevo', asignadoPor?: string | null): string {
  const interes = lead.modalidad ?? lead.carrera_interes ?? 'Consulta general'
  const encabezado = tipo === 'reenvio' ? '*REENVÍO PENDIENTE*'
    : tipo === 'reconsulta' ? '*🔁 VOLVIÓ A CONSULTAR*'
    : tipo === 'reasignado' ? '*🔁 LEAD REASIGNADO A TI* (su asesor no lo contactó a tiempo)'
    : tipo === 'asignado' ? `*📌 LEAD ASIGNADO A TI*${asignadoPor ? ` (por ${asignadoPor})` : ''}`
    : ENCABEZADO_POR_FUENTE[fuente]
  return [
    encabezado,
    lead.convocatoria ? `*Convocatoria:* ${lead.convocatoria}` : null,
    '',
    `*Nombre:* ${lead.nombre ?? 'Sin nombre'}`,
    `*DNI:* ${lead.dni ?? 'Sin DNI'}`,
    `*Interés:* ${interes}`,
    lead.resumen ? `*Consulta:* ${lead.resumen}` : null,
    lead.origen_campana ? `*Nos conoció por:* ${lead.origen_campana}` : null,
    `*Celular:* ${lead.telefono}`,
    `*WhatsApp:* https://wa.me/${lead.telefono}`,
    tipo === 'asignado' ? `*Ficha en el CRM:* ${PANEL_URL}/leads/${lead.id}` : null,
  ].filter((linea) => linea !== null).join('\n')
}

/**
 * Notifica al asesor y guarda el resultado (intentos, error) en el lead.
 * La API de BuilderBot a veces tarda: se reintenta hasta 3 veces con espera creciente.
 */
async function notificarAsesor(lead: Lead, telefonoAsesor: string, fuente: Fuente, tipo: TipoAviso = 'nuevo', asignadoPor?: string | null) {
  // Lead en la papelera: no se molesta al asesor
  if (lead.eliminado_at) return false
  const texto = mensajeNuevoLead(lead, fuente, tipo, asignadoPor)
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

/**
 * El lead escribió: avisa a su asesor por WhatsApp con el mensaje y el enlace al chat del CRM.
 * Se "reserva" el aviso en la base antes de enviarlo, así dos mensajes seguidos no generan dos avisos.
 */
async function avisarMensajeNuevo(lead: Lead, mensaje: string) {
  if (!lead.asesor_id || lead.eliminado_at) return
  const avisar = (ESTADOS_AVISO_MENSAJE as readonly string[]).includes(lead.estado) ||
    (!!lead.bot_pausado_hasta && Date.parse(lead.bot_pausado_hasta) > Date.now())
  if (!avisar) return

  const limite = new Date(Date.now() - MINUTOS_ENTRE_AVISOS * 60_000).toISOString()
  const { data: reservado } = await supabase.from('leads')
    .update({ ultimo_aviso_mensaje_at: new Date().toISOString() })
    .eq('id', lead.id)
    .or(`ultimo_aviso_mensaje_at.is.null,ultimo_aviso_mensaje_at.lt.${limite}`)
    .select('id')
  if (!reservado?.length) return

  const { data: asesor } = await supabase.from('asesores').select('telefono').eq('id', lead.asesor_id).single()
  if (!asesor?.telefono) return
  const texto = [
    `💬 *Nuevo mensaje de ${lead.nombre ?? lead.telefono}*`,
    '',
    mensaje.length > 300 ? mensaje.slice(0, 300) + '…' : mensaje,
    '',
    `Responde desde el CRM: ${PANEL_URL}/leads/${lead.id}#chat`,
  ].join('\n')
  const envio = await enviarWhatsApp(asesor.telefono, texto)
  if (!envio.ok) console.error('[genesys] No se pudo avisar el mensaje nuevo al asesor:', envio.error)
}

// ---------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------

/**
 * Todo el que escribe es un lead. Se guarda cada mensaje en su conversación.
 * bot_atiende=false: Genesys no debe responder (espera a su asesor o el asesor está conversando).
 */
/** Celulares de los asesores (rol asesor): reciben los avisos del CRM, no son leads. */
async function telefonosAsesores(): Promise<Set<string>> {
  const { data } = await supabase.from('asesores').select('telefono')
    .eq('rol', 'asesor').is('eliminado_at', null).not('telefono', 'is', null)
  return new Set((data ?? []).map((a) => a.telefono!))
}

async function registrar(cuerpo: Cuerpo): Promise<Respuesta> {
  const telefono = telefonoDe(cuerpo)
  const mensaje = valorResuelto(cuerpo.mensaje)
  // La respuesta automática del WhatsApp de un asesor a un aviso del CRM no es un lead
  if (telefono && (await telefonosAsesores()).has(telefono)) {
    return { ok: true, ignorado: 'mensaje de un asesor', bot_atiende: false }
  }
  const { data, error } = await supabase.rpc('registrar_lead', {
    p_telefono: telefono,
    p_mensaje: mensaje ?? undefined,
    p_es_lid: cuerpo.es_lid === true,
  })
  if (error) throw error

  let lead = data
  if (lead.estado === 'lead_nuevo') {
    const actualizado = await supabase.from('leads').update({ estado: 'lead_en_conversacion' })
      .eq('id', lead.id).select().single()
    if (actualizado.error) throw actualizado.error
    lead = actualizado.data
  }
  if (mensaje) EdgeRuntime.waitUntil(avisarMensajeNuevo(lead, mensaje))

  return {
    ok: true,
    lead_id: lead.id,
    es_nuevo: lead.total_mensajes <= 1,
    estado: lead.estado,
    nombre: lead.nombre ?? '',
    bot_atiende: botAtiendeLead(lead.estado, lead.bot_pausado_hasta),
    bot_pausado_hasta: lead.bot_pausado_hasta ?? '',
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
  const origenCampana = normalizarOrigen(elegir(cuerpo.Origen, cuerpo.origen, cuerpo.ComoNosConocio, cuerpo.Campana, cuerpo.campana, cuerpo.utm_source))
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

  // Cómo nos conoció (si BuilderBot lo envía): se guarda el último valor recibido
  if (origenCampana) await supabase.from('leads').update({ origen_campana: origenCampana }).eq('id', r.lead_id)

  // Lo que el lead respondió a Genesys queda visible en la conversación del CRM
  const datosBot = [
    ['Nombre', nombre], ['DNI', dni], ['Carrera', carrera], ['Modalidad', modalidad],
    ['Consulta', consulta], ['Convocatoria', convocatoria], ['Nos conoció por', origenCampana],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
  await registrarEvento(r.lead_id, `Datos entregados a Genesys:\n${datosBot}`)

  let notificacion = r.asesor_id ? 'omitida' : ''
  if (r.notificar && r.asesor_telefono) {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', r.lead_id).single()
    if (lead) {
      // Se responde a BuilderBot de inmediato (espera máx. 30 s) y el WhatsApp sale en segundo plano
      const tipo: TipoAviso = r.status === 'updated' && !r.reasignado ? 'reconsulta' : 'nuevo'
      EdgeRuntime.waitUntil(notificarAsesor(lead, r.asesor_telefono, fuente, tipo))
      notificacion = 'en_proceso'
    }
  }

  if (r.status === 'updated') {
    return {
      status: 'updated', accion: 'actualizado', registrado: true, duplicado: false,
      mensaje: r.asesor_nombre ?? '', telefono_asesor: r.asesor_telefono ?? '',
      lead_id: r.lead_id, notificacion_asesor: notificacion, bot_atiende: botAtiendeLead(r.estado), modo: MODO,
      enviar_mensaje_cliente: true,
      mensaje_cliente: r.asesor_nombre
        ? `Recibimos tu nueva consulta. ${r.asesor_nombre} te escribirá pronto.`
        : 'Recibimos tu nueva consulta. Un asesor se comunicará contigo pronto.',
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
  if (leadEnEtapaBot(lead.estado)) {
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
    .is('eliminado_at', null)
    .not('asesor_id', 'is', null)
    .lt('fecha_asignado', new Date(Date.now() - 5 * 60_000).toISOString())
  if (pendientes.error) throw pendientes.error
  let reenviadas = 0
  for (const lead of pendientes.data) {
    if (!lead.asesor?.telefono) continue
    const fuente = (FUENTES as readonly string[]).includes(lead.origen) ? (lead.origen as Fuente) : 'whatsapp_genesys'
    if (await notificarAsesor(lead, lead.asesor.telefono, fuente, 'reenvio')) reenviadas++
  }

  // 2) Resumen por asesor de leads sin contactar
  const sinContactar = await supabase.from('leads').select(seleccion)
    .eq('estado', 'lead_asignado')
    .is('recordatorio_enviado', null)
    .is('eliminado_at', null)
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

/**
 * Pone o quita números de la blacklist de BuilderBot según la regla del bot:
 * si Genesys NO debe responder (pausa de 5 h o lead esperando a su asesor) -> blacklist.
 * Con lead_id sincroniza ese lead; sin él revisa todos los que podrían haber cambiado.
 */
async function sincronizarBot(cuerpo: Cuerpo): Promise<Respuesta> {
  if (MODO !== 'activo') return { ok: true, omitido: 'Solo en modo activo' }
  const leadId = valorResuelto(cuerpo.lead_id)
  const campos = 'id, telefono, estado, bot_pausado_hasta, en_blacklist'
  const consulta = leadId
    ? supabase.from('leads').select(campos).eq('id', leadId)
    : supabase.from('leads').select(campos)
        .or(`en_blacklist.eq.true,estado.in.(lead_interesado,lead_asignado),bot_pausado_hasta.gt.${new Date().toISOString()}`)
        .limit(500)
  const { data: leads, error } = await consulta
  if (error) throw error

  let agregados = 0, quitados = 0, errores = 0
  const deAsesores = await telefonosAsesores()
  for (const lead of leads ?? []) {
    // El número de un asesor se maneja abajo (siempre en blacklist)
    if (deAsesores.has(lead.telefono)) continue
    // Con la blacklist apagada se quita a todos: así BuilderBot sigue enviando sus mensajes al CRM
    // y la pausa la aplica la regla del flujo (bot_atiende=false -> flujo "Silencio").
    // Solo se silencia durante la pausa (el asesor escribió desde el CRM en las últimas 5 h)
    const pausaVigente = !!lead.bot_pausado_hasta && Date.parse(lead.bot_pausado_hasta) > Date.now()
    const debeSilenciar = USAR_BLACKLIST && pausaVigente
    if (debeSilenciar === lead.en_blacklist) continue
    const r = await cambiarBlacklist(lead.telefono, debeSilenciar)
    // Sus alias (LID) también: es el mismo alumno escribiendo sin mostrar su número
    if (r.ok) {
      const { data: alias } = await supabase.from('lead_alias').select('alias').eq('lead_id', lead.id)
      for (const a of alias ?? []) await cambiarBlacklist(a.alias, debeSilenciar)
    }
    if (!r.ok) {
      errores++
      console.error(`[genesys] Blacklist ${debeSilenciar ? 'agregar' : 'quitar'} ${lead.telefono}:`, r.error)
      continue
    }
    await supabase.from('leads').update({ en_blacklist: debeSilenciar }).eq('id', lead.id)
    if (debeSilenciar) agregados++
    else quitados++
  }
  // Asesores siempre en blacklist: Genesys no responde a sus respuestas automáticas
  // (los avisos del CRM les siguen llegando: la API envía igual a números en blacklist)
  if (!leadId) {
    const { data: asesores } = await supabase.from('asesores')
      .select('id, telefono, rol, eliminado_at, en_blacklist').not('telefono', 'is', null)
    for (const a of asesores ?? []) {
      const debe = a.rol === 'asesor' && !a.eliminado_at
      if (debe === a.en_blacklist) continue
      const r = await cambiarBlacklist(a.telefono!, debe)
      if (!r.ok) { errores++; console.error('[genesys] Blacklist asesor', a.telefono, r.error); continue }
      await supabase.from('asesores').update({ en_blacklist: debe }).eq('id', a.id)
      if (debe) agregados++
      else quitados++
    }
  }
  return { ok: true, revisados: leads?.length ?? 0, agregados, quitados, errores }
}

/** Busca el primer valor de texto bajo alguna de estas claves (en cualquier nivel del JSON). */
function buscarCampo(obj: unknown, claves: string[], profundidad = 0): string | null {
  if (!obj || typeof obj !== 'object' || profundidad > 4) return null
  for (const clave of claves) {
    const valor = (obj as Record<string, unknown>)[clave]
    if (typeof valor === 'string' && valor.trim()) return valor.trim()
    if (typeof valor === 'number') return String(valor)
  }
  for (const valor of Object.values(obj as Record<string, unknown>)) {
    const encontrado = buscarCampo(valor, claves, profundidad + 1)
    if (encontrado) return encontrado
  }
  return null
}

/**
 * Webhook de BuilderBot: llega cada mensaje (también los de números en blacklist).
 * Se guarda una copia cruda en webhook_eventos y, si es un mensaje del lead, se registra
 * en su conversación (mismo efecto que /registrar: chat, "sin responder" y aviso al asesor).
 */
/**
 * Avisos que el CRM envía a los asesores (lead nuevo, reasignado, recordatorio, mensaje nuevo).
 * También llegan por el webhook como salientes: no son respuestas del bot y no van al chat del lead
 * (pasa cuando el número de un asesor también está registrado como lead).
 */
function esAvisoParaAsesor(texto: string): boolean {
  return texto.includes(PANEL_URL) || texto.includes('*Celular:*') || texto.startsWith('*RECORDATORIO')
}

async function evento(cuerpo: Cuerpo, registroId: number | null): Promise<Respuesta> {
  const marcar = (procesado: string) =>
    registroId ? supabase.from('webhook_eventos').update({ procesado }).eq('id', registroId) : Promise.resolve()

  const tipo = (buscarCampo(cuerpo, ['eventName', 'event', 'type', 'evento']) ?? '').toLowerCase()
  const saliente = /out|send|sent|bot/.test(tipo) || (cuerpo as { fromMe?: unknown }).fromMe === true
  const telefono = normalizarTelefono(buscarCampo(cuerpo, ['from', 'phone', 'number', 'remoteJid', 'telefono', 'to']))
  const texto = valorResuelto(buscarCampo(cuerpo, ['body', 'message', 'text', 'content', 'mensaje', 'answer']))
  // Contacto con privacidad de WhatsApp: llega un identificador (@lid) en vez del número
  const jid = buscarCampo(cuerpo, ['remoteJid']) ?? ''
  const esLid = jid.endsWith('@lid') && !!telefono && jid.replace(/D/g, '') === telefono

  if (!telefono) { await marcar('sin teléfono'); return { ok: true, procesado: 'sin teléfono' } }
  if (saliente) {
    // Respuesta del bot: se guarda en la conversación (los mensajes del CRM ya están guardados)
    if (texto && !/^\*[^*\n]{1,40}:\* /.test(texto) && !esAvisoParaAsesor(texto)) {
      // Por celular o por alias (LID unido a un lead registrado)
      const { data: leadId } = await supabase.rpc('lead_de_contacto', { p_contacto: telefono })
      if (leadId) {
        await supabase.from('lead_interacciones').insert({ lead_id: leadId, tipo: 'respuesta_bot', contenido: texto.slice(0, 4000) })
        await marcar('respuesta del bot guardada')
        return { ok: true, procesado: 'respuesta_bot' }
      }
    }
    await marcar('saliente ignorado')
    return { ok: true, procesado: 'saliente ignorado' }
  }
  const r = await registrar({ telefono, mensaje: texto ?? undefined, es_lid: esLid })
  await marcar(texto ? 'mensaje del lead guardado' : 'contacto registrado (sin texto)')
  return { ok: true, procesado: 'mensaje_lead', bot_atiende: r.bot_atiende }
}

/**
 * Reasignación automática (cron cada 15 min, solo en modo activo y en horario de oficina):
 * leads asignados que su asesor no contactó en REASIGNAR_HORAS pasan al siguiente asesor.
 */
async function reasignar(): Promise<Respuesta> {
  if (MODO !== 'activo') return { ok: true, omitido: 'Solo en modo activo' }
  const horas = Number(Deno.env.get('REASIGNAR_HORAS') ?? 4) || 4
  const maximo = Number(Deno.env.get('REASIGNAR_MAXIMO') ?? 2) || 2
  const { data, error } = await supabase.rpc('reasignar_sin_contacto', { p_horas: horas, p_maximo: maximo })
  if (error) throw error
  const cambios = (data ?? []) as { lead_id: string; asesor_telefono: string | null }[]
  for (const c of cambios) {
    if (!c.asesor_telefono) continue
    const { data: lead } = await supabase.from('leads').select('*').eq('id', c.lead_id).single()
    if (lead) {
      const fuente = (FUENTES as readonly string[]).includes(lead.origen) ? (lead.origen as Fuente) : 'whatsapp_genesys'
      await notificarAsesor(lead, c.asesor_telefono, fuente, 'reasignado')
    }
  }
  return { ok: true, reasignados: cambios.length }
}

/** Saludo de Genesys al alumno que se registró con el QR de una feria o visita a colegio. */
function mensajeBienvenida(lead: Lead, actividad: string | null, asesor: string | null): string {
  const primerNombre = (lead.nombre ?? '').trim().split(/\s+/)[0]
  const asesorNombre = asesor?.trim().split(/\s+/).slice(0, 2).join(' ')
  return [
    `¡Hola${primerNombre ? ' ' + primerNombre : ''}! 👋 Gracias por registrarte${actividad ? ` en *${actividad}*` : ''}.`,
    'Soy Genesys, la asesora virtual de Admisión de la *Universidad Peruana Unión – campus Juliaca*.',
    asesorNombre ? `Tu asesor(a) *${asesorNombre}* te escribirá pronto con toda la información.` : 'Un asesor te escribirá pronto con toda la información.',
    'Si tienes alguna pregunta, escríbeme por aquí 😊',
  ].join('\n')
}

/** Más leads que esto para un mismo asesor: un solo mensaje de resumen en vez de uno por lead. */
const MAXIMO_AVISOS_DETALLADOS = 3

/**
 * Un usuario del panel asignó leads a un asesor (trigger leads_aviso_asignacion_*).
 * Se avisa al asesor nuevo por WhatsApp, en cualquier modo (sombra o activo).
 */
async function notificarAsignacion(cuerpo: Cuerpo): Promise<Respuesta> {
  const ids = (Array.isArray(cuerpo.lead_ids) ? cuerpo.lead_ids : [])
    .filter((id): id is string => typeof id === 'string').slice(0, 500)
  if (!ids.length) return { ok: true, avisados: 0 }
  const asignadoPor = typeof cuerpo.asignado_por === 'string' ? cuerpo.asignado_por : null

  const { data: leads, error } = await supabase.from('leads').select('*').in('id', ids)
  if (error) throw error
  const asesorIds = [...new Set((leads ?? []).map((l) => l.asesor_id).filter((id): id is string => !!id))]
  const { data: asesores } = await supabase.from('asesores').select('id, telefono, nombre').in('id', asesorIds)
  const telefonos = new Map((asesores ?? []).map((a) => [a.id, a.telefono]))
  const nombres = new Map((asesores ?? []).map((a) => [a.id, a.nombre]))

  const porAsesor = new Map<string, Lead[]>()
  for (const l of leads ?? []) {
    if (l.asesor_id) porAsesor.set(l.asesor_id, [...(porAsesor.get(l.asesor_id) ?? []), l])
  }

  let avisados = 0
  for (const [asesorId, suyos] of porAsesor) {
    const telefono = telefonos.get(asesorId)
    if (!telefono) continue
    if (suyos.length <= MAXIMO_AVISOS_DETALLADOS) {
      for (const lead of suyos) {
        const fuente = (FUENTES as readonly string[]).includes(lead.origen) ? (lead.origen as Fuente) : 'whatsapp_genesys'
        if (await notificarAsesor(lead, telefono, fuente, 'asignado', asignadoPor)) avisados++
      }
      continue
    }
    const lista = suyos.slice(0, 15).map((l) => `• ${l.nombre ?? 'Sin nombre'} (${l.telefono})`)
    const texto = [
      `*📌 ${suyos.length} LEADS ASIGNADOS A TI*${asignadoPor ? ` (por ${asignadoPor})` : ''}`,
      '',
      ...lista,
      suyos.length > lista.length ? `…y ${suyos.length - lista.length} más` : null,
      '',
      `Revísalos en el CRM: ${PANEL_URL}/leads`,
    ].filter((linea) => linea !== null).join('\n')
    const envio = await enviarWhatsApp(telefono, texto)
    for (const lead of suyos) {
      await supabase.rpc('marcar_notificacion', { p_lead_id: lead.id, p_ok: envio.ok, p_error: envio.error })
    }
    if (envio.ok) avisados += suyos.length
    else console.error('[genesys] Error avisando asignación masiva:', envio.error)
  }
  // Registro por QR en una actividad: Genesys saluda al alumno y deja abierta la conversación
  let bienvenidas = 0
  if (cuerpo.bienvenida === true) {
    const actividad = typeof cuerpo.actividad === 'string' ? cuerpo.actividad : null
    const deAsesores = await telefonosAsesores()
    for (const lead of leads ?? []) {
      if (!/^\d{10,15}$/.test(lead.telefono) || deAsesores.has(lead.telefono) || lead.eliminado_at) continue
      const envio = await enviarWhatsApp(lead.telefono, mensajeBienvenida(lead, actividad, lead.asesor_id ? nombres.get(lead.asesor_id) ?? null : null))
      if (envio.ok) bienvenidas++
      else console.error('[genesys] No se pudo enviar la bienvenida:', envio.error)
    }
  }
  return { ok: true, avisados, bienvenidas }
}

const ACCIONES: Record<string, (cuerpo: Cuerpo) => Promise<Respuesta> | Respuesta> = {
  'registrar': registrar,
  'webhook': webhook,
  'no-interesado': noInteresado,
  'respuesta-bot': respuestaBot,
  'recordatorios': recordatorios,
  'sincronizar-bot': sincronizarBot,
  'reasignar': reasignar,
  'notificar': notificarAsignacion,
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
      return responder(await evento(cuerpo, registro?.id ?? null))
    } catch (e) {
      console.error('[genesys] Error en /evento:', e)
      return responder({ ok: false, error: 'error_interno' }, 500)
    }
  }

  if (!tokenValido(tokenRecibido)) {
    return responder({ ok: false, error: 'no_autorizado' }, 401)
  }

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
