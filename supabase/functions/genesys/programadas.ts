// Genesys · Tareas que llama el cron: recordatorios, reintentos de avisos, tareas, reasignación, sincronización con BuilderBot y ping.
import { type Fuente, FUENTES, proximaAtencion, valorResuelto } from '../_shared/dominio.ts'
import { cambiarBlacklist, enviarWhatsApp, problemasBuilderBot } from '../_shared/builderbot.ts'
import { type Cuerpo, type Respuesta, supabase, MODO, MAX_INTENTOS_NOTIFICACION, USAR_BLACKLIST, PANEL_URL, registrarEvento, telefonosAsesores, FERIADOS, SELECCION_CON_ASESOR } from './comun.ts'
import { notificarAsesor } from './avisos.ts'
import { destinoWhatsApp } from '../_shared/lid.ts'
import { enviarPush } from '../_shared/push.ts'

/**
 * Avisos al asesor que fallaron (p. ej. BuilderBot respondió "Bot endpoint timed out"):
 * se reintentan cada 10 min (cron genesys-reintentar-avisos) hasta MAX_INTENTOS_NOTIFICACION.
 */
export async function reintentarAvisos(): Promise<number> {
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

export async function reintentar(): Promise<Respuesta> {
  if (MODO !== 'activo') return { ok: true, omitido: 'Solo en modo activo' }
  return { ok: true, notificaciones_reenviadas: await reintentarAvisos() }
}

export async function recordatorios(): Promise<Respuesta> {
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
export async function recordarTareas(): Promise<Respuesta> {
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
    await enviarPush(supabase, lista[0]!.asesor_id, {
      titulo: `⏰ Próxima acción${lista.length > 1 ? ` (${lista.length})` : ''}`,
      cuerpo: lista.slice(0, 3).map((t) => `${t.titulo} — ${t.lead!.nombre ?? t.lead!.telefono}`).join('\n'),
      url: lista.length === 1 ? `/leads/${lista[0]!.lead!.id}` : '/pendientes', etiqueta: 'tareas',
    })
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
export function ping(): Respuesta {
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
export async function sincronizarBot(cuerpo: Cuerpo): Promise<Respuesta> {
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

/**
 * Reasignación automática (cron cada 15 min, solo en modo activo y en horario de oficina):
 * leads asignados que su asesor no contactó en REASIGNAR_HORAS pasan al siguiente asesor.
 */
export async function reasignar(): Promise<Respuesta> {
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

/**
 * Recordatorios automáticos a los alumnos (cron cada 10 minutos). reservar_recordatorios solo
 * entrega un lote en horario de atención; se envían de a uno con pausas para cuidar el número.
 */
export async function recordarAlumnos(): Promise<Respuesta> {
  const { data: lote, error } = await supabase.rpc('reservar_recordatorios', { p_limite: 10 })
  if (error) throw error
  let enviados = 0
  for (const [i, r] of (lote ?? []).entries()) {
    if (i > 0) await new Promise((ok) => setTimeout(ok, 6_000 + Math.random() * 4_000))
    const primer = (t: string | null) => (t ?? '').trim().split(/\s+/)[0] ?? ''
    const texto = r.mensaje
      .replaceAll('{nombre}', primer(r.nombre) || '')
      .replaceAll('{carrera}', r.carrera ?? 'tu carrera')
      .replaceAll('{asesor}', primer(r.asesor) || '')
      .replace(/¡Hola, !/g, '¡Hola!').replace(/ {2,}/g, ' ').replace(/ +([,.!?])/g, '$1')
      + '\n\n(Si no deseas recibir estos avisos, responde NO)'
    const envio = await enviarWhatsApp(await destinoWhatsApp(supabase, r.telefono), texto)
    await supabase.rpc('marcar_recordatorio', { p_recordatorio_id: r.recordatorio_id, p_lead_id: r.lead_id, p_ok: envio.ok, p_error: envio.error })
    if (envio.ok) enviados++
    else console.error('[genesys] Recordatorio a alumno falló:', envio.error)
  }
  return { ok: true, enviados, lote: (lote ?? []).length }
}
