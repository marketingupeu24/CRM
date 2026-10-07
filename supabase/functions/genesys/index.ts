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
  HORARIO_ATENCION_TEXTO,
  normalizarDni,
  normalizarTelefono,
  proximaAtencion,
  textoProximaAtencion,
  valorResuelto,
} from '../_shared/dominio.ts'
import { cambiarBlacklist, descargarArchivo, enviarWhatsApp, problemasBuilderBot } from '../_shared/builderbot.ts'
import { destinoWhatsApp, esContactoLid } from '../_shared/lid.ts'

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
/** Celulares de quienes reciben leads (o son asesores): reciben los avisos del CRM, no son leads. */
async function telefonosAsesores(): Promise<Set<string>> {
  const { data } = await supabase.from('asesores').select('telefono')
    .or('rol.eq.asesor,activo.eq.true').is('eliminado_at', null).not('telefono', 'is', null)
  return new Set((data ?? []).map((a) => a.telefono!))
}

/** Código del QR personal de un asesor en el mensaje: "(Cód. A-3F9C21)". */
const CODIGO_QR_ASESOR = /c[oó]d\.?\s*a-([0-9a-f]{6})\b/i
/** Código del QR por persona (datos escritos por el asesor): "(Cód. P-1A2B3C4D)". */
const CODIGO_PRERREGISTRO = /c[oó]d\.?\s*p-([0-9a-f]{8})\b/i

/**
 * El mensaje viene del QR personal de un asesor (lo atiende en persona): el lead es suyo y queda contactado, se avisa
 * al asesor y Genesys confirma al interesado. Devuelve el lead actualizado si se asignó.
 */
async function asignarPorQrAsesor(lead: Lead, mensaje: string, telefono: string, esLid: boolean): Promise<Lead | null> {
  // QR por persona (el asesor ya escribió sus datos) o QR general del asesor
  const prerregistro = mensaje.match(CODIGO_PRERREGISTRO)?.[1]
  const codigo = prerregistro ? null : mensaje.match(CODIGO_QR_ASESOR)?.[1]
  if (!prerregistro && !codigo) return null
  const { data, error } = prerregistro
    ? await supabase.rpc('usar_prerregistro', { p_lead_id: lead.id, p_codigo: prerregistro })
    : await supabase.rpc('asignar_lead_qr_asesor', { p_lead_id: lead.id, p_codigo: codigo! })
  if (error) {
    console.error('[genesys] No se pudo registrar por QR de asesor:', error.message)
    return null
  }
  const r = data as { usado?: boolean; asignado: boolean; asesor_nombre?: string; asesor_telefono?: string | null; persona?: string }
  if (!(prerregistro ? r.usado : r.asignado)) return null
  const { data: actualizado } = await supabase.from('leads').select('*').eq('id', lead.id).single()
  if (!actualizado) return null
  const asesor = (r.asesor_nombre ?? '').trim().split(/\s+/)[0]
  const persona = (r.persona ?? '').trim().split(/\s+/)[0]
  if (r.asignado && r.asesor_telefono) {
    EdgeRuntime.waitUntil(notificarAsesor(actualizado, r.asesor_telefono, 'manual', 'asignado', 'tu QR personal · presencial'))
  }
  // Respuesta a quien escribió primero (no es un mensaje en frío). El webhook de salientes la guarda en el chat.
  // A un identificador @lid no se envía por la API: no es un número y BuilderBot se queda esperando (504)
  // (el flujo del bot no indica si es @lid: un número largo que no es de Perú se trata igual)
  // Contacto con número oculto: se le escribe a "<id>@lid" (BuilderBot sí lo entrega)
  const destino = esLid ? `${telefono}@lid` : await destinoWhatsApp(supabase, telefono)
  EdgeRuntime.waitUntil(enviarWhatsApp(destino, [
    `¡Listo${persona ? `, ${persona}` : ''}, ya quedaste registrado(a)! 😊 Soy Genesys, de Admisión de la *Universidad Peruana Unión – campus Juliaca*.`,
    `${asesor ? `Tu asesor(a) *${asesor}*` : 'Tu asesor(a)'} te sigue atendiendo, y por este chat te enviaremos la información que necesites.`,
  ].join('\n')))
  return actualizado
}

async function registrar(cuerpo: Cuerpo): Promise<Respuesta> {
  // Consulta de BuilderBot antes del asistente: solo lee lo que el CRM sabe del alumno
  // (el mensaje ya llega al CRM por el webhook; así no se registra dos veces).
  // El número puede venir en cualquier campo (BuilderBot reemplaza solo la variable que conoce):
  // se usa el primero que sea un celular válido. Sin número válido igual responde 200, para no
  // dejar al bot sin respuesta.
  if (cuerpo.solo_contexto === true || cuerpo.solo_contexto === 'true') {
    const candidato = Object.values(cuerpo).map((v) => (typeof v === 'string' || typeof v === 'number' ? normalizarTelefono(String(v)) : null)).find(Boolean)
    if (!candidato) return { ok: true, registrado: false, bot_atiende: true, contexto: `Alumno nuevo: todavía no ha dado sus datos. ${fechaYHorario()}`, aviso: 'No llegó un número válido' }
    return contextoSinRegistrar(candidato)
  }
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
  // QR personal de un asesor (atención presencial): el lead es de ese asesor
  const porQr = mensaje ? await asignarPorQrAsesor(lead, mensaje, telefono, cuerpo.es_lid === true) : null
  if (porQr) lead = porQr
  if (lead.estado === 'lead_nuevo') {
    const actualizado = await supabase.from('leads').update({ estado: 'lead_en_conversacion' })
      .eq('id', lead.id).select().single()
    if (actualizado.error) throw actualizado.error
    lead = actualizado.data
  }
  // Recién asignado por QR: el asesor ya recibe el aviso de asignación (no uno de "nuevo mensaje")
  if (mensaje && !porQr) EdgeRuntime.waitUntil(avisarMensajeNuevo(lead, mensaje))

  const botAtiende = botAtiendeLead(lead.estado, lead.bot_pausado_hasta)
  const apertura = proximaAtencion(new Date(), FERIADOS)
  // Fuera de horario y el bot no responde (lead de un asesor): se le dice cuándo le responderán
  if (apertura && mensaje && !porQr && !botAtiende && lead.asesor_id) {
    EdgeRuntime.waitUntil(avisarFueraDeHorario(lead, telefono))
  }

  return {
    ok: true,
    lead_id: lead.id,
    es_nuevo: lead.total_mensajes <= 1,
    estado: lead.estado,
    nombre: lead.nombre ?? '',
    bot_atiende: botAtiende,
    bot_pausado_hasta: lead.bot_pausado_hasta ?? '',
    fuera_de_horario: !!apertura,
    proxima_atencion: apertura ? textoProximaAtencion(apertura) : '',
    // Lo que el CRM ya sabe del alumno: BuilderBot lo pasa al asistente para no volver a pedir datos
    registrado: leadRegistrado(lead),
    contexto: await contextoDelAlumno(lead),
  }
}

/** "Hoy es miércoles 7 de octubre de 2026, 3:06 pm (hora de Perú). La oficina está abierta…" */
function fechaYHorario(): string {
  const ahora = new Date()
  const hoy = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ahora)
  const hora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hour12: true }).format(ahora)
    .replace(/\s*a\.?\s*m\.?/i, ' am').replace(/\s*p\.?\s*m\.?/i, ' pm')
  const apertura = proximaAtencion(ahora, FERIADOS)
  const oficina = apertura ? `La oficina está cerrada ahora; la próxima atención es ${textoProximaAtencion(apertura, ahora)}.` : 'La oficina está abierta ahora.'
  // Mañana: si no hay atención (feriado o fin de semana), se dice explícitamente
  const fechaLima = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d)
  const mananaFecha = new Date(ahora.getTime() + 86_400_000)
  const mananaTexto = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' }).format(mananaFecha)
  const feriadoManana = NOMBRES_FERIADOS.get(fechaLima(mananaFecha))
  const finDeSemana = [0, 6].includes(new Date(`${fechaLima(mananaFecha)}T12:00:00Z`).getUTCDay())
  const manana = feriadoManana || finDeSemana
    ? ` Mañana (${mananaTexto}) NO hay atención${feriadoManana ? ` por feriado: ${feriadoManana}` : ''}.`
    : ` Mañana (${mananaTexto}) sí hay atención en el horario normal.`
  // Feriados de los próximos 14 días
  const hoyFecha = fechaLima(ahora)
  const limite = fechaLima(new Date(ahora.getTime() + 14 * 86_400_000))
  const proximos = [...NOMBRES_FERIADOS].filter(([f]) => f > hoyFecha && f <= limite)
    .map(([f, n]) => `${new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${f}T12:00:00Z`))} (${n})`)
  const feriados = proximos.length ? ` Feriados próximos sin atención: ${proximos.join(', ')}.` : ''
  return `Hoy es ${hoy}, ${hora} (hora de Perú). ${oficina}${manana}${feriados}`
}

/** Solo lectura: contexto del alumno y si el bot debe responder, sin guardar nada. */
async function contextoSinRegistrar(telefono: string): Promise<Respuesta> {
  const { data: leadId } = await supabase.rpc('lead_de_contacto', { p_contacto: telefono })
  const { data: lead } = leadId ? await supabase.from('leads').select('*').eq('id', leadId as string).maybeSingle() : { data: null }
  const apertura = proximaAtencion(new Date(), FERIADOS)
  if (!lead) {
    return { ok: true, registrado: false, bot_atiende: true, nombre: '', contexto: `Alumno nuevo: todavía no ha dado sus datos. ${fechaYHorario()}`, fuera_de_horario: !!apertura }
  }
  return {
    ok: true,
    lead_id: lead.id,
    registrado: leadRegistrado(lead),
    bot_atiende: botAtiendeLead(lead.estado, lead.bot_pausado_hasta),
    nombre: lead.nombre ?? '',
    contexto: `${await contextoDelAlumno(lead)} ${fechaYHorario()}`,
    fuera_de_horario: !!apertura,
    proxima_atencion: apertura ? textoProximaAtencion(apertura) : '',
  }
}

/** Ya dejó sus datos (con Genesys, QR, formulario o un asesor): no hay que volver a pedírselos. */
function leadRegistrado(lead: Lead): boolean {
  return !!lead.asesor_id || !!lead.fecha_interesado || (!!lead.nombre && (!!lead.dni || !!lead.carrera_interes))
}

/**
 * Resumen en texto del alumno para el prompt de Genesys ("CONTEXTO DEL ALUMNO").
 * Así, si escribe otro día, Genesys sabe quién es y no le vuelve a pedir nombre, documento ni carrera.
 */
async function contextoDelAlumno(lead: Lead): Promise<string> {
  if (!leadRegistrado(lead) && !lead.nombre) return 'Alumno nuevo: todavía no ha dado sus datos.'
  let asesor: string | null = null
  if (lead.asesor_id) {
    const { data } = await supabase.from('asesores').select('nombre').eq('id', lead.asesor_id).maybeSingle()
    asesor = data?.nombre?.trim().split(/\s+/).slice(0, 2).join(' ') ?? null
  }
  const interes = lead.programa === 'cepre' ? `CEPRE${lead.modalidad ? ` ${lead.modalidad}` : ''}` : lead.carrera_interes
  const datos = [
    lead.nombre && `Nombre: ${lead.nombre}`,
    lead.dni && `Documento: ${lead.dni}`,
    interes && `Interés: ${interes}`,
    lead.colegio && `Colegio: ${lead.colegio}`,
    asesor && `Su asesor(a): ${asesor}`,
  ].filter(Boolean).join(' · ')
  if (!leadRegistrado(lead)) return `Datos que ya dio: ${datos}. Aún no está registrado: pide solo lo que falte.`
  return `YA REGISTRADO (no le vuelvas a pedir sus datos ni lo registres otra vez): ${datos}.`
}


/**
 * Quien escribe fuera del horario de atención (y su asesor no puede responder ahora) recibe una sola
 * vez por cierre el horario y cuándo le responderán. reservar_aviso_horario evita repetirlo.
 */
async function avisarFueraDeHorario(lead: Lead, telefono: string) {
  const { data: apertura } = await supabase.rpc('reservar_aviso_horario', { p_lead_id: lead.id })
  if (!apertura) return
  const { data: asesor } = await supabase.from('asesores').select('nombre').eq('id', lead.asesor_id!).maybeSingle()
  const nombreAsesor = asesor?.nombre?.trim().split(/\s+/)[0]
  const primerNombre = (lead.nombre ?? '').trim().split(/\s+/)[0]
  const texto = [
    `¡Gracias por escribirnos${primerNombre ? ', ' + primerNombre : ''}! 😊 Nuestro horario de atención es ${HORARIO_ATENCION_TEXTO}`,
    `${nombreAsesor ? `Tu asesor(a) *${nombreAsesor}*` : 'Tu asesor(a)'} te responderá ${textoProximaAtencion(new Date(apertura))}.`,
  ].join('\n')
  const envio = await enviarWhatsApp(await destinoWhatsApp(supabase, telefono), texto)
  if (!envio.ok) console.error('[genesys] No se pudo enviar el aviso de horario:', envio.error)
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
/** Minutos en los que un registro con los mismos datos se considera repetido (no una nueva consulta). */
const MINUTOS_REGISTRO_REPETIDO = 30

/** Lead registrado hace poco con exactamente los mismos datos (nombre, documento y carrera). */
async function registroRepetido(telefono: string | null, dni: string | null, nombre: string | null, carrera: string | null) {
  if (!telefono && !dni) return null
  const desde = new Date(Date.now() - MINUTOS_REGISTRO_REPETIDO * 60_000).toISOString()
  const consulta = supabase.from('leads').select('id, nombre, dni, carrera_interes, modalidad, estado, asesor_id, duplicados_ignorados, ultimo_registro_at')
    .gte('ultimo_registro_at', desde).is('eliminado_at', null).limit(1)
  const { data } = dni ? await consulta.eq('dni', dni) : await consulta.eq('telefono', telefono!)
  const lead = data?.[0]
  if (!lead) return null
  const igual = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
  const mismaCarrera = !carrera || igual(carrera, lead.carrera_interes) || igual(carrera, lead.modalidad)
  return igual(nombre, lead.nombre) && (!dni || dni === lead.dni) && mismaCarrera ? lead : null
}

/** Para el agente de IA de BuilderBot: el registro terminó, no debe repetirlo. */
const INSTRUCCION_REGISTRADO = 'REGISTRO COMPLETADO. Confirma al alumno UNA sola vez y no vuelvas a llamar a esta herramienta en esta conversación.'

/** Fuera de horario: lo que se agrega al mensaje y a la instrucción de Genesys tras registrar. */
function notaHorario(): { cliente: string; instruccion: string } {
  const apertura = proximaAtencion(new Date(), FERIADOS)
  if (!apertura) return { cliente: '', instruccion: '' }
  const cuando = textoProximaAtencion(apertura)
  return {
    cliente: ` Ahora estamos fuera del horario de atención (${HORARIO_ATENCION_TEXTO}): tu asesor(a) te escribirá ${cuando}.`,
    instruccion: ` Estamos FUERA DEL HORARIO de atención: dile que su asesor(a) le escribirá ${cuando}.`,
  }
}

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

  // El mismo registro otra vez (mismos datos, < 30 min): el agente de IA de BuilderBot a veces
  // repite la herramienta en bucle. No es una "nueva consulta": no se reavisa al asesor.
  const repetido = await registroRepetido(telefono, dni, nombre, carrera ?? modalidad)
  if (repetido) {
    await supabase.from('leads').update({ duplicados_ignorados: repetido.duplicados_ignorados + 1 }).eq('id', repetido.id)
    const { data: asesorRep } = repetido.asesor_id
      ? await supabase.from('asesores').select('nombre, telefono').eq('id', repetido.asesor_id).maybeSingle()
      : { data: null }
    return {
      status: 'success', accion: 'ya_registrado', registrado: true, duplicado: true,
      mensaje: asesorRep?.nombre ?? '', telefono_asesor: asesorRep?.telefono ?? '',
      lead_id: repetido.id, notificacion_asesor: 'ya_enviada', bot_atiende: botAtiendeLead(repetido.estado), modo: MODO,
      enviar_mensaje_cliente: false,
      mensaje_cliente: 'Listo: el registro ya está hecho. No lo repitas ni vuelvas a enviar la confirmación.',
      instruccion_bot: 'REGISTRO YA COMPLETADO. No vuelvas a llamar a esta herramienta ni repitas el mensaje de confirmación.',
    }
  }

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

  // Repetido (< 2 min): el registro YA está hecho. Se responde como éxito ("ya_registrado"):
  // con registrado:false el agente de IA de BuilderBot lo tomaba como falla y reintentaba en bucle,
  // reenviando la confirmación al alumno cada pocos segundos (hasta 60 veces).
  if (r.status === 'duplicate') {
    return {
      status: 'success', accion: 'ya_registrado', registrado: true, duplicado: true,
      mensaje: r.asesor_nombre ?? '', telefono_asesor: r.asesor_telefono ?? '',
      lead_id: r.lead_id, notificacion_asesor: 'ya_enviada', bot_atiende: botAtiendeLead(r.estado), modo: MODO,
      enviar_mensaje_cliente: false,
      mensaje_cliente: 'Listo: el registro ya está hecho. No lo repitas ni vuelvas a enviar la confirmación.',
      instruccion_bot: 'REGISTRO YA COMPLETADO. No vuelvas a llamar a esta herramienta ni repitas el mensaje de confirmación.',
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
        ? `Recibimos tu nueva consulta. ${r.asesor_nombre} te escribirá pronto.${notaHorario().cliente}`
        : `Recibimos tu nueva consulta. Un asesor se comunicará contigo pronto.${notaHorario().cliente}`,
      instruccion_bot: INSTRUCCION_REGISTRADO + notaHorario().instruccion,
    }
  }

  return {
    status: 'success', accion: 'registrado', registrado: true, duplicado: false,
    mensaje: r.asesor_nombre ?? '', telefono_asesor: r.asesor_telefono ?? '',
    lead_id: r.lead_id, notificacion_asesor: notificacion, bot_atiende: botAtiendeLead(r.estado), modo: MODO,
    enviar_mensaje_cliente: true,
    mensaje_cliente: r.asesor_nombre
      ? `Tu información fue registrada correctamente. Se te asignó a ${r.asesor_nombre}.${notaHorario().cliente}`
      : `Tu información fue registrada correctamente. Un asesor se comunicará contigo pronto.${notaHorario().cliente}`,
    instruccion_bot: INSTRUCCION_REGISTRADO + notaHorario().instruccion,
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
/** Feriados (public.feriados, "AAAA-MM-DD"): se recargan como máximo cada 10 min. */
let FERIADOS: ReadonlySet<string> = new Set()
let NOMBRES_FERIADOS: ReadonlyMap<string, string> = new Map()
let feriadosCargados = 0
async function cargarFeriados() {
  if (Date.now() - feriadosCargados < 10 * 60_000) return
  const { data } = await supabase.from('feriados').select('fecha, nombre')
  if (data) {
    FERIADOS = new Set(data.map((f) => f.fecha))
    NOMBRES_FERIADOS = new Map(data.map((f) => [f.fecha, f.nombre]))
    feriadosCargados = Date.now()
  }
}

const SELECCION_CON_ASESOR = '*, asesor:asesores!leads_asesor_id_fkey(nombre, telefono)'

/**
 * Avisos al asesor que fallaron (p. ej. BuilderBot respondió "Bot endpoint timed out"):
 * se reintentan cada 10 min (cron genesys-reintentar-avisos) hasta MAX_INTENTOS_NOTIFICACION.
 */
async function reintentarAvisos(): Promise<number> {
  const seleccion = SELECCION_CON_ASESOR
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
  return reenviadas
}

async function reintentar(): Promise<Respuesta> {
  if (MODO !== 'activo') return { ok: true, omitido: 'Solo en modo activo' }
  return { ok: true, notificaciones_reenviadas: await reintentarAvisos() }
}

async function recordatorios(): Promise<Respuesta> {
  if (MODO !== 'activo') return { ok: true, omitido: 'En modo sombra los recordatorios los envía el Apps Script' }
  const seleccion = SELECCION_CON_ASESOR

  // 1) Reintentos de notificación
  const reenviadas = await reintentarAvisos()

  // Feriado: sin resumen de apertura (la oficina no abre)
  if (FERIADOS.has(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()))) {
    return { ok: true, notificaciones_reenviadas: reenviadas, recordatorios_enviados: 0, omitido: 'Feriado' }
  }

  // 2) Resumen de apertura por asesor (lunes a viernes 8:00):
  //    a) leads que llegaron con la oficina cerrada y aún no contacta
  //    b) leads sin contactar desde hace más de 12 h (una sola vez por lead)
  const { data: cierre } = await supabase.rpc('ultimo_cierre')
  const desdeCierre = cierre ? new Date(cierre as string).toISOString() : new Date(Date.now() - 16 * 3_600_000).toISOString()
  const [llegaron, sinContactar] = await Promise.all([
    supabase.from('leads').select(seleccion)
      .eq('estado', 'lead_asignado').is('primer_contacto_asesor_at', null).is('eliminado_at', null)
      .gte('fecha_asignado', desdeCierre).order('fecha_asignado'),
    supabase.from('leads').select(seleccion)
      .eq('estado', 'lead_asignado').is('recordatorio_enviado', null).is('eliminado_at', null)
      .lt('fecha_asignado', new Date(Date.now() - 12 * 3_600_000).toISOString()).order('fecha_asignado'),
  ])
  if (llegaron.error) throw llegaron.error
  if (sinContactar.error) throw sinContactar.error

  type LeadConAsesor = (typeof sinContactar.data)[number]
  const porAsesor = new Map<string, { nuevos: LeadConAsesor[]; atrasados: LeadConAsesor[] }>()
  const grupo = (l: LeadConAsesor) => {
    const g = porAsesor.get(l.asesor_id!) ?? { nuevos: [], atrasados: [] }
    porAsesor.set(l.asesor_id!, g)
    return g
  }
  for (const l of llegaron.data) if (l.asesor?.telefono && l.asesor_id) grupo(l).nuevos.push(l)
  const enNuevos = new Set(llegaron.data.map((l) => l.id))
  for (const l of sinContactar.data) if (l.asesor?.telefono && l.asesor_id && !enNuevos.has(l.id)) grupo(l).atrasados.push(l)

  let recordatoriosEnviados = 0
  for (const { nuevos, atrasados } of porAsesor.values()) {
    const leads = [...nuevos, ...atrasados]
    const asesor = leads[0]!.asesor!
    const dias = (fecha: string | null) => Math.max(0, Math.floor((Date.now() - Date.parse(fecha ?? '')) / 86_400_000))
    const linea = (l: LeadConAsesor) =>
      `• ${l.nombre ?? 'Sin nombre'} – wa.me/${l.telefono} (${dias(l.fecha_asignado) === 0 ? 'hoy' : `hace ${dias(l.fecha_asignado)} d`})`
    const texto = [
      `*☀️ BUENOS DÍAS, ${asesor.nombre.split(' ')[0].toUpperCase()}*`,
      nuevos.length ? `\n*Llegaron con la oficina cerrada (${nuevos.length}):*` : null,
      ...nuevos.slice(0, 15).map(linea),
      nuevos.length > 15 ? `… y ${nuevos.length - 15} más.` : null,
      atrasados.length ? `\n*Siguen sin contactar (${atrasados.length}):*` : null,
      ...atrasados.slice(0, 15).map(linea),
      atrasados.length > 15 ? `… y ${atrasados.length - 15} más.` : null,
      '',
      `Escríbeles desde el CRM: ${PANEL_URL}/pendientes`,
    ].filter((l) => l !== null).join('\n')

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

/**
 * Próxima acción: cuando vence una tarea agendada, WhatsApp a su asesor (cron cada 10 min).
 * Solo en horario de atención: lo que vence con la oficina cerrada se recuerda al abrir.
 * Un mensaje por asesor con todas sus tareas vencidas; cada tarea se recuerda una vez (posponer la reactiva).
 */
async function recordarTareas(): Promise<Respuesta> {
  if (MODO !== 'activo') return { ok: true, omitido: 'Solo en modo activo' }
  if (proximaAtencion(new Date(), FERIADOS)) return { ok: true, omitido: 'Fuera del horario de atención' }
  const { data: tareas, error } = await supabase.from('tareas')
    .select('id, titulo, vence_at, asesor_id, lead:leads!tareas_lead_id_fkey(id, nombre, telefono, eliminado_at), asesor:asesores!tareas_asesor_id_fkey(nombre, telefono, eliminado_at)')
    .is('completada_at', null).is('recordatorio_enviado_at', null)
    .lte('vence_at', new Date().toISOString()).order('vence_at').limit(200)
  if (error) throw error

  type Tarea = NonNullable<typeof tareas>[number]
  const porAsesor = new Map<string, Tarea[]>()
  for (const t of tareas ?? []) {
    if (!t.asesor?.telefono || t.asesor.eliminado_at || !t.lead || t.lead.eliminado_at) continue
    porAsesor.set(t.asesor_id, [...(porAsesor.get(t.asesor_id) ?? []), t])
  }

  const hora = (iso: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  let enviados = 0
  for (const lista of porAsesor.values()) {
    const asesor = lista[0]!.asesor!
    const texto = [
      `*⏰ PRÓXIMA ACCIÓN${lista.length > 1 ? ` (${lista.length})` : ''}*`,
      '',
      ...lista.slice(0, 10).flatMap((t) => [
        `• *${t.titulo}* — ${t.lead!.nombre ?? t.lead!.telefono} (agendada ${hora(t.vence_at)})`,
        `  ${PANEL_URL}/leads/${t.lead!.id}`,
      ]),
      lista.length > 10 ? `… y ${lista.length - 10} más en ${PANEL_URL}/pendientes` : null,
    ].filter((l) => l !== null).join('\n')
    const envio = await enviarWhatsApp(asesor.telefono!, texto)
    if (!envio.ok) {
      console.error(`[genesys] Recordatorio de tareas a ${asesor.nombre} falló:`, envio.error)
      continue
    }
    enviados++
    await supabase.from('tareas').update({ recordatorio_enviado_at: new Date().toISOString() }).in('id', lista.map((t) => t.id))
  }
  return { ok: true, asesores_avisados: enviados, tareas: (tareas ?? []).length }
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
      .select('id, telefono, rol, activo, eliminado_at, en_blacklist').not('telefono', 'is', null)
    for (const a of asesores ?? []) {
      const debe = (a.rol === 'asesor' || a.activo) && !a.eliminado_at
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

/** Archivo que el lead envió por WhatsApp (BuilderBot pone "_event_document__<id>" en el texto). */
interface ArchivoEntrante {
  texto: string
  url: string | null
  nombre: string
  tipo: string
}

const EXTENSIONES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/mp4': 'mp4',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

/** Traduce el código de BuilderBot a un texto legible para el chat (y para la vista previa y los avisos). */
function archivoEntrante(cuerpo: Cuerpo, texto: string | null): ArchivoEntrante | null {
  const evento = texto?.match(/^_event_([a-z_]+?)__/)?.[1]
  if (!evento) return null
  const data = ((cuerpo as { data?: Record<string, unknown> }).data ?? cuerpo) as Record<string, unknown>
  const msg = (data.message ?? {}) as Record<string, Record<string, unknown> | undefined>
  const url = typeof data.urlTempFile === 'string' ? data.urlTempFile : null
  const cadena = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const doc = msg.documentMessage ?? msg.documentWithCaptionMessage
  const imagen = msg.imageMessage
  const video = msg.videoMessage
  const audio = msg.audioMessage
  const ubicacion = msg.locationMessage ?? msg.liveLocationMessage

  if (evento === 'location' || ubicacion) {
    const lat = Number(ubicacion?.degreesLatitude), lng = Number(ubicacion?.degreesLongitude)
    const mapa = Number.isFinite(lat) && Number.isFinite(lng) ? `\nhttps://maps.google.com/?q=${lat},${lng}` : ''
    return { texto: `📍 Ubicación${mapa}`, url: null, nombre: '', tipo: '' }
  }
  const conLeyenda = (titulo: string, leyenda: string) => (leyenda ? `${titulo}\n${leyenda}` : titulo)
  if (evento === 'voice_note' || audio) {
    return { texto: '🎤 Nota de voz', url, nombre: 'nota-de-voz', tipo: cadena(audio?.mimetype) || 'audio/ogg' }
  }
  if (doc) {
    const nombre = cadena(doc.fileName) || cadena(doc.title) || 'documento'
    return { texto: conLeyenda(`📎 Documento: ${nombre}`, cadena(doc.caption)), url, nombre, tipo: cadena(doc.mimetype) }
  }
  if (video) {
    return { texto: conLeyenda('🎬 Video', cadena(video.caption)), url, nombre: 'video', tipo: cadena(video.mimetype) || 'video/mp4' }
  }
  if (evento === 'media' || imagen) {
    return { texto: conLeyenda('🖼️ Imagen', cadena(imagen?.caption)), url, nombre: 'imagen', tipo: cadena(imagen?.mimetype) || 'image/jpeg' }
  }
  return { texto: '📎 Archivo', url, nombre: 'archivo', tipo: '' }
}

/** Copia el archivo al bucket privado "adjuntos" (BuilderBot lo borra en unos días) y lo une al mensaje. */
async function guardarArchivo(leadId: string, archivo: ArchivoEntrante): Promise<void> {
  if (!archivo.url) return
  const descarga = await descargarArchivo(archivo.url, 16 * 1024 * 1024)
  if (!descarga) {
    console.warn('[genesys] No se pudo descargar el archivo del lead', leadId)
    return
  }
  const tipo = archivo.tipo || descarga.tipo || 'application/octet-stream'
  const base = archivo.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'archivo'
  const extension = archivo.nombre.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase()
    ?? EXTENSIONES[tipo.split(';')[0]] ?? archivo.url.match(/\.([a-z0-9]{1,5})(\?|$)/i)?.[1]?.toLowerCase() ?? 'bin'
  const ruta = `${leadId}/${Date.now()}-${base}.${extension}`
  const subida = await supabase.storage.from('adjuntos').upload(ruta, descarga.datos, { contentType: tipo.split(';')[0], upsert: false })
  if (subida.error) {
    console.error('[genesys] No se pudo guardar el archivo:', subida.error.message)
    return
  }
  // El mensaje que acaba de guardar registrar_lead (último de este lead con ese texto)
  const { data: mensaje } = await supabase.from('lead_interacciones').select('id')
    .eq('lead_id', leadId).eq('tipo', 'mensaje_lead').eq('contenido', archivo.texto).is('adjunto_url', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (mensaje) await supabase.from('lead_interacciones').update({ adjunto_url: `adjuntos/${ruta}` }).eq('id', mensaje.id)
}

/**
 * Reenvía a "<id>@lid" una respuesta de Genesys que BuilderBot mandó a una dirección que no existe.
 * Las respuestas en varias partes llegan casi juntas: se espera según su orden para no desordenarlas.
 */
async function reenviarALid(numero: string, texto: string, media: string | undefined, registroId: number | null) {
  const desde = new Date(Date.now() - 20_000).toISOString()
  const { count } = await supabase.from('webhook_eventos').select('id', { count: 'exact', head: true })
    .eq('payload->cuerpo->>eventName', 'message.outgoing').eq('payload->cuerpo->data->>from', numero)
    .gte('recibido_at', desde).lt('id', registroId ?? Number.MAX_SAFE_INTEGER)
  await new Promise((r) => setTimeout(r, Math.min(count ?? 0, 8) * 2_500))
  const inicio = Date.now()
  const envio = await enviarWhatsApp(`${numero}@lid`, texto, media)
  if (!envio.ok) console.error('[genesys] No se pudo reenviar a @lid:', envio.error)
  // Diagnóstico: queda anotado en el evento original
  if (registroId) {
    await supabase.from('webhook_eventos')
      .update({ procesado: `respuesta del bot guardada · reenviada a @lid (${envio.ok ? 'ok' : 'error'}, ${Math.round((Date.now() - inicio) / 1000)} s)` })
      .eq('id', registroId)
  }
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
  const esLid = jid.endsWith('@lid') && !!telefono && jid.replace(/\D/g, '') === telefono

  if (!telefono) { await marcar('sin teléfono'); return { ok: true, procesado: 'sin teléfono' } }
  if (saliente) {
    const datos = ((cuerpo as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>
    const destinoJid = String(((datos.respMessage as { key?: { remoteJid?: string } } | undefined)?.key?.remoteJid) ?? '')
    // Eco de un envío del CRM a "<id>@lid": ya está guardado en el chat
    if (destinoJid.endsWith('@lid')) {
      await marcar('saliente @lid (envío del CRM)')
      return { ok: true, procesado: 'saliente @lid' }
    }
    // BuilderBot respondió a un contacto con número oculto en "<id>@s.whatsapp.net": no le llega.
    // El CRM reenvía la respuesta a "<id>@lid", que sí se entrega.
    const lid = texto && destinoJid.endsWith('@s.whatsapp.net') && !esAvisoParaAsesor(texto) ? await esContactoLid(supabase, telefono) : false
    console.log('[genesys] saliente', telefono, destinoJid, 'lid:', lid)
    if (lid && texto) {
      const media = ((datos.options as { media?: unknown } | undefined)?.media)
      EdgeRuntime.waitUntil(reenviarALid(telefono, texto, typeof media === 'string' ? media : undefined, registroId))
    }
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
  // Documento, nota de voz, imagen o ubicación: texto legible y copia del archivo
  const archivo = archivoEntrante(cuerpo, texto)
  const r = await registrar({ telefono, mensaje: archivo?.texto ?? texto ?? undefined, es_lid: esLid })
  if (archivo?.url && typeof r.lead_id === 'string') EdgeRuntime.waitUntil(guardarArchivo(r.lead_id, archivo))
  await marcar(archivo ? `archivo del lead guardado (${archivo.texto.split('\n')[0]})` : texto ? 'mensaje del lead guardado' : 'contacto registrado (sin texto)')
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

/**
 * Un lead de otro asesor vino en persona y lo atendió otro (avisar_visita en la base):
 * el lead sigue siendo de su asesor, a quien se le avisa por WhatsApp.
 */
async function avisarVisita(cuerpo: Cuerpo): Promise<Respuesta> {
  const leadId = typeof cuerpo.lead_id === 'string' ? cuerpo.lead_id : null
  if (!leadId) return { ok: false, error: 'falta lead_id' }
  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead?.asesor_id || lead.eliminado_at) return { ok: true, avisado: false }
  const { data: asesor } = await supabase.from('asesores').select('telefono').eq('id', lead.asesor_id).single()
  if (!asesor?.telefono) return { ok: true, avisado: false }
  const atendio = typeof cuerpo.atendio === 'string' ? cuerpo.atendio : 'otro asesor'
  const como = typeof cuerpo.como === 'string' ? cuerpo.como : null
  const texto = [
    '*🏢 TU LEAD VINO A LA OFICINA*',
    `Lo atendió *${atendio}*${como ? ` (${como})` : ''}. Sigue siendo tu lead: dale seguimiento.`,
    '',
    `*Nombre:* ${lead.nombre ?? 'Sin nombre'}`,
    `*Interés:* ${lead.modalidad ?? lead.carrera_interes ?? 'Consulta general'}`,
    `*Celular:* ${lead.telefono}`,
    `*Ficha en el CRM:* ${PANEL_URL}/leads/${lead.id}`,
  ].join('\n')
  const envio = await enviarWhatsApp(asesor.telefono, texto)
  if (!envio.ok) console.error('[genesys] No se pudo avisar la visita al asesor:', envio.error)

  // Quien lo atendió queda de apoyo: ve el chat y puede enviarle información
  const atendioId = typeof cuerpo.atendio_id === 'string' ? cuerpo.atendio_id : null
  const { data: apoyo } = atendioId
    ? await supabase.from('asesores').select('telefono').eq('id', atendioId).maybeSingle()
    : { data: null }
  if (apoyo?.telefono && apoyo.telefono !== asesor.telefono) {
    const { data: dueno } = await supabase.from('asesores').select('nombre').eq('id', lead.asesor_id).single()
    const aviso = await enviarWhatsApp(apoyo.telefono, [
      '*🤝 QUEDASTE DE APOYO*',
      `${lead.nombre ?? lead.telefono} es lead de *${dueno?.nombre ?? 'otro asesor'}* y sigue siendo suyo.`,
      'Puedes ver su conversación y enviarle información desde el CRM:',
      `${PANEL_URL}/leads/${lead.id}#chat`,
    ].join('\n'))
    if (!aviso.ok) console.error('[genesys] No se pudo avisar al asesor de apoyo:', aviso.error)
  }
  return { ok: true, avisado: envio.ok }
}

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
    return responder({ ok: false, status: 'error', error: 'error_interno' }, 500)
  }
})
