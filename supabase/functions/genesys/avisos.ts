// Genesys · Avisos por WhatsApp a los asesores (lead nuevo, mensaje nuevo, asignación, visita, ausencia) y al alumno (fuera de horario, bienvenida).
import { ESTADOS_AVISO_MENSAJE, type Fuente, FUENTES, HORARIO_ATENCION_TEXTO, textoProximaAtencion } from '../_shared/dominio.ts'
import { enviarWhatsApp } from '../_shared/builderbot.ts'
import { destinoWhatsApp } from '../_shared/lid.ts'
import { enviarPush } from '../_shared/push.ts'
import { type Lead, type Cuerpo, type Respuesta, supabase, PANEL_URL, MINUTOS_ENTRE_AVISOS, telefonosAsesores, fechaCorta } from './comun.ts'

// Runtime de Supabase Edge Functions: mantiene viva una tarea después de responder
declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void }

export const ENCABEZADO_POR_FUENTE: Record<Fuente, string> = {
  whatsapp_genesys: '*NUEVO PROSPECTO*',
  google_form: '*NUEVO FORMULARIO*',
  web: '*REGISTRO WEB*',
  manual: '*REGISTRO MANUAL*',
  actividad: '*REGISTRO POR QR (FERIA / COLEGIO)*',
}

export type TipoAviso = 'nuevo' | 'reenvio' | 'reconsulta' | 'reasignado' | 'asignado'

export function mensajeNuevoLead(lead: Lead, fuente: Fuente, tipo: TipoAviso = 'nuevo', asignadoPor?: string | null): string {
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
export async function notificarAsesor(lead: Lead, telefonoAsesor: string, fuente: Fuente, tipo: TipoAviso = 'nuevo', asignadoPor?: string | null) {
  // Lead en la papelera: no se molesta al asesor
  if (lead.eliminado_at) return false
  const texto = mensajeNuevoLead(lead, fuente, tipo, asignadoPor)
  // También a la app del CRM (si el asesor activó las notificaciones en su celular o PC)
  EdgeRuntime.waitUntil(enviarPush(supabase, lead.asesor_id, {
    titulo: tipo === 'reasignado' ? '🔁 Lead reasignado a ti' : tipo === 'asignado' ? '📌 Lead asignado a ti' : tipo === 'reconsulta' ? '🔁 Volvió a consultar' : '🆕 Nuevo lead',
    cuerpo: `${lead.nombre ?? lead.telefono} · ${lead.modalidad ?? lead.carrera_interes ?? 'Consulta general'}`,
    url: `/leads/${lead.id}`, etiqueta: `lead-${lead.id}`,
  }))
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
export async function avisarMensajeNuevo(lead: Lead, mensaje: string) {
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

  const { data: asesor } = await supabase.from('asesores')
    .select('telefono, nombre, ausencia_activa, ausente_hasta, ausente_reemplazo').eq('id', lead.asesor_id).single()
  if (!asesor) return
  // Asesor ausente con reemplazo: el aviso va a quien lo cubre (el lead sigue siendo del asesor)
  const { data: reemplazo } = asesor.ausencia_activa && asesor.ausente_reemplazo
    ? await supabase.from('asesores').select('telefono').eq('id', asesor.ausente_reemplazo).maybeSingle()
    : { data: null }
  const destino = reemplazo?.telefono ?? asesor.telefono
  if (!destino) return
  const texto = [
    `💬 *Nuevo mensaje de ${lead.nombre ?? lead.telefono}*`,
    reemplazo?.telefono ? `(lead de ${asesor.nombre}: lo cubres hasta el ${fechaCorta(asesor.ausente_hasta)})` : null,
    '',
    mensaje.length > 300 ? mensaje.slice(0, 300) + '…' : mensaje,
    '',
    `Responde desde el CRM: ${PANEL_URL}/leads/${lead.id}#chat`,
  ].filter((linea) => linea !== null).join('\n')
  EdgeRuntime.waitUntil(enviarPush(supabase, reemplazo?.telefono ? asesor.ausente_reemplazo : lead.asesor_id, {
    titulo: `💬 ${lead.nombre ?? lead.telefono}`,
    cuerpo: mensaje, url: `/leads/${lead.id}#chat`, etiqueta: `chat-${lead.id}`,
  }))
  const envio = await enviarWhatsApp(destino, texto)
  if (!envio.ok) console.error('[genesys] No se pudo avisar el mensaje nuevo al asesor:', envio.error)
}


/**
 * Quien escribe fuera del horario de atención (y su asesor no puede responder ahora) recibe una sola
 * vez por cierre el horario y cuándo le responderán. reservar_aviso_horario evita repetirlo.
 */
export async function avisarFueraDeHorario(lead: Lead, telefono: string) {
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

/** Saludo de Genesys al alumno que se registró con el QR de una feria o visita a colegio. */
export function mensajeBienvenida(lead: Lead, actividad: string | null, asesor: string | null): string {
  const primerNombre = (lead.nombre ?? '').trim().split(/\s+/)[0]
  const asesorNombre = asesor?.trim().split(/\s+/).slice(0, 2).join(' ')
  return [
    `¡Hola${primerNombre ? ' ' + primerNombre : ''}! 👋 Gracias por registrarte${actividad ? ` en *${actividad}*` : ''}.`,
    'Soy Genesys, la asesora virtual de *Admisión de la Universidad Peruana Unión*, campus Juliaca 🎓',
    asesorNombre ? `Tu asesor(a) *${asesorNombre}* te escribirá pronto con toda la información.` : 'Un asesor(a) te escribirá pronto con toda la información.',
    'Si tienes alguna pregunta, escríbeme por aquí 😊',
  ].join('\n')
}

/** Más leads que esto para un mismo asesor: un solo mensaje de resumen en vez de uno por lead. */
export const MAXIMO_AVISOS_DETALLADOS = 3

/**
 * Un usuario del panel asignó leads a un asesor (trigger leads_aviso_asignacion_*).
 * Se avisa al asesor nuevo por WhatsApp, en cualquier modo (sombra o activo).
 */
export async function notificarAsignacion(cuerpo: Cuerpo): Promise<Respuesta> {
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
export async function avisarVisita(cuerpo: Cuerpo): Promise<Respuesta> {
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

/** Se programó una ausencia con reemplazo (programar_ausencia): se avisa a quien cubrirá. */
export async function avisarAusencia(cuerpo: Cuerpo): Promise<Respuesta> {
  const asesorId = typeof cuerpo.asesor_id === 'string' ? cuerpo.asesor_id : null
  if (!asesorId) return { ok: false, error: 'falta asesor_id' }
  const { data: ausente } = await supabase.from('asesores')
    .select('nombre, ausente_desde, ausente_hasta, ausente_motivo, ausente_reemplazo')
    .eq('id', asesorId).maybeSingle()
  const { data: cubre } = ausente?.ausente_reemplazo
    ? await supabase.from('asesores').select('telefono').eq('id', ausente.ausente_reemplazo).maybeSingle()
    : { data: null }
  const telefono = cubre?.telefono
  if (!ausente || !telefono) return { ok: true, avisado: false }
  const envio = await enviarWhatsApp(telefono, [
    '*🧳 CUBRES A UN COMPAÑERO*',
    `*${ausente.nombre}* estará ausente${ausente.ausente_motivo ? ` (${ausente.ausente_motivo})` : ''}:`,
    `desde el ${fechaCorta(ausente.ausente_desde)} hasta el ${fechaCorta(ausente.ausente_hasta)}`,
    '',
    'Mientras tanto te llegan los avisos de sus clientes y puedes ver sus chats y escribirles (siguen siendo sus leads).',
    `Encuéntralos en el CRM: ${PANEL_URL}/leads (🤝 Atendidos como apoyo)`,
  ].join('\n'))
  return { ok: true, avisado: envio.ok }
}

/**
 * Error interno del bot: queda en alertas_sistema y se avisa por WhatsApp a los super admin
 * (como máximo una vez por hora por el mismo error, para no llenarlos de mensajes).
 */
export async function alertarError(accion: string, error: unknown) {
  try {
    const detalle = error instanceof Error ? error.message : String(error)
    const { data: avisar } = await supabase.rpc('registrar_error', { p_clave: `genesys/${accion}`, p_detalle: detalle })
    if (!avisar) return
    const { data: admins } = await supabase.from('asesores').select('telefono')
      .eq('superadmin', true).is('eliminado_at', null).not('telefono', 'is', null)
    const texto = [
      '*⚠️ ERROR EN EL CRM*',
      `Falló la acción *${accion}* del bot Genesys.`,
      `Detalle: ${detalle.slice(0, 300)}`,
      '',
      'Si se repite, revisa los registros de la función en Supabase. (Aviso máximo una vez por hora)',
    ].join('\n')
    for (const a of admins ?? []) await enviarWhatsApp(a.telefono!, texto)
  } catch (e) {
    console.error('[genesys] No se pudo avisar el error:', e)
  }
}
