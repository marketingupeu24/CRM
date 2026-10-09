// Genesys · Registro de leads desde el bot: registrar, webhook (datos confirmados), QR de asesor, no-interesado y respuesta-bot.
import { botAtiendeLead, leadEnEtapaBot, normalizarOrigen, elegir, type Fuente, FUENTES, HORARIO_ATENCION_TEXTO, normalizarDni, normalizarTelefono, proximaAtencion, textoProximaAtencion, valorResuelto } from '../_shared/dominio.ts'
import { enviarWhatsApp } from '../_shared/builderbot.ts'
import { destinoWhatsApp } from '../_shared/lid.ts'
import { type Lead, type Cuerpo, type Respuesta, type ResultadoProcesar, supabase, MODO, ErrorApi, telefonoDe, buscarLead, registrarEvento, telefonosAsesores, fechaYHorario, FERIADOS } from './comun.ts'
import { type TipoAviso, notificarAsesor, avisarMensajeNuevo, avisarFueraDeHorario } from './avisos.ts'
import { contextoSinRegistrar, leadRegistrado, contextoDelAlumno } from './contexto.ts'

// Runtime de Supabase Edge Functions: mantiene viva una tarea después de responder
declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void }

/** Código del QR personal de un asesor en el mensaje: "(Cód. A-3F9C21)". */
export const CODIGO_QR_ASESOR = /c[oó]d\.?\s*a-([0-9a-f]{6})\b/i

/** Código del QR por persona (datos escritos por el asesor): "(Cód. P-1A2B3C4D)". */
export const CODIGO_PRERREGISTRO = /c[oó]d\.?\s*p-([0-9a-f]{8})\b/i

/**
 * El mensaje viene del QR personal de un asesor (lo atiende en persona): el lead es suyo y queda contactado, se avisa
 * al asesor y Genesys confirma al interesado. Devuelve el lead actualizado si se asignó.
 */
export async function asignarPorQrAsesor(lead: Lead, mensaje: string, telefono: string, esLid: boolean): Promise<Lead | null> {
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
    `¡Listo${persona ? `, ${persona}` : ''}, ya quedaste registrado(a)! 😊 Soy Genesys, de *Admisión de la Universidad Peruana Unión*, campus Juliaca`,
    `${asesor ? `Tu asesor(a) *${asesor}*` : 'Tu asesor(a)'} te sigue atendiendo, y por este chat te enviaremos la información que necesites.`,
  ].join('\n')))
  return actualizado
}

export async function registrar(cuerpo: Cuerpo): Promise<Respuesta> {
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
export const MINUTOS_REGISTRO_REPETIDO = 30

/** Lead registrado hace poco con exactamente los mismos datos (nombre, documento y carrera). */
export async function registroRepetido(telefono: string | null, dni: string | null, nombre: string | null, carrera: string | null) {
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
export const INSTRUCCION_REGISTRADO = 'REGISTRO COMPLETADO. Confirma al alumno UNA sola vez y no vuelvas a llamar a esta herramienta en esta conversación.'

/** Fuera de horario: lo que se agrega al mensaje y a la instrucción de Genesys tras registrar. */
export function notaHorario(): { cliente: string; instruccion: string } {
  const apertura = proximaAtencion(new Date(), FERIADOS)
  if (!apertura) return { cliente: '', instruccion: '' }
  const cuando = textoProximaAtencion(apertura)
  return {
    cliente: ` Ahora estamos fuera del horario de atención (${HORARIO_ATENCION_TEXTO}): tu asesor(a) te escribirá ${cuando}.`,
    instruccion: ` Estamos FUERA DEL HORARIO de atención: dile que su asesor(a) le escribirá ${cuando}.`,
  }
}

export async function webhook(cuerpo: Cuerpo): Promise<Respuesta> {
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
export async function noInteresado(cuerpo: Cuerpo): Promise<Respuesta> {
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
export async function respuestaBot(cuerpo: Cuerpo): Promise<Respuesta> {
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
