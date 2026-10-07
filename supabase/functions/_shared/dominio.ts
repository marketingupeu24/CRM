// =====================================================================
//  Reglas del dominio de leads usadas por la API de Genesys.
//  Mismas reglas de normalización que el Apps Script de admisión.
// =====================================================================

/** Etapas previas al asesor: el lead todavía está con Genesys (sirve para no retroceder estados). */
export const ESTADOS_ETAPA_BOT = ['lead_nuevo', 'lead_en_conversacion', 'lead_no_interesado'] as const

export function leadEnEtapaBot(estado: string): boolean {
  return (ESTADOS_ETAPA_BOT as readonly string[]).includes(estado)
}

/** Esperando o recién asignado a su asesor: Genesys no le responde. */
export const ESTADOS_SIN_BOT = ['lead_interesado', 'lead_asignado'] as const

/**
 * ¿Genesys debe responder ahora a este lead?
 * No, si espera a su asesor o si el bot está en pausa (el asesor conversa con él: 5 h
 * desde su último mensaje o desde que pasó a contactado).
 */
export function botAtiendeLead(estado: string, botPausadoHasta?: string | null, ahora = Date.now()): boolean {
  if ((ESTADOS_SIN_BOT as readonly string[]).includes(estado)) return false
  return !botPausadoHasta || Date.parse(botPausadoHasta) <= ahora
}

/** Estados en los que se avisa al asesor cuando el lead le escribe. */
export const ESTADOS_AVISO_MENSAJE = ['lead_asignado', 'lead_contactado', 'lead_inscrito'] as const

export const FUENTES = ['whatsapp_genesys', 'manual', 'google_form', 'web', 'actividad'] as const
export type Fuente = (typeof FUENTES)[number]

/**
 * Texto limpio o null. También descarta variables de BuilderBot sin resolver
 * (ej. "{nombre}"), igual que validarLeadBot del Apps Script.
 */
export function valorResuelto(valor: unknown): string | null {
  const texto = valor == null ? '' : String(valor).trim()
  return texto === '' || texto.includes('{') ? null : texto
}

/** Primer valor con contenido, como elegirPrimerValor del Apps Script. */
export function elegir(...valores: unknown[]): string | null {
  for (const valor of valores) {
    const texto = valorResuelto(valor)
    if (texto) return texto
  }
  return null
}

/**
 * Deja solo dígitos: "+51 951-301-920" -> "51951301920".
 * Un celular peruano de 9 dígitos (9XXXXXXXX) recibe el código de país 51.
 */
export function normalizarTelefono(valor: unknown): string | null {
  const digitos = String(valor ?? '').replace(/\D/g, '')
  if (/^9\d{8}$/.test(digitos)) return '51' + digitos
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null
}

/**
 * DNI (8 dígitos) o carné de extranjería (hasta 12). Los marcadores del Apps Script
 * como "S/D-FORM-123456" no son un documento real y se descartan.
 */
export function normalizarDni(valor: unknown): string | null {
  const texto = String(valor ?? '').trim()
  if (/^S\/D/i.test(texto)) return null
  const digitos = texto.replace(/\D/g, '')
  return /^\d{8,12}$/.test(digitos) ? digitos : null
}

/** Orígenes del lead ("¿cómo nos conociste?"). Deben coincidir con los del panel. */
export const ORIGENES = [
  'Facebook', 'Instagram', 'TikTok', 'Google', 'Página web', 'Recomendación',
  'Colegio adventista', 'Iglesia', 'Colportaje', 'Feria / colegio', 'Volante / afiche', 'Radio / TV', 'Otro',
] as const

/** Lleva lo que escribió el lead (o la campaña) al origen de la lista: "fb" -> "Facebook". */
export function normalizarOrigen(valor: unknown): string | null {
  const texto = valorResuelto(valor)
  if (!texto) return null
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const reglas: [RegExp, string][] = [
    [/face|\bfb\b|meta/, 'Facebook'], [/insta|\big\b/, 'Instagram'], [/tik ?tok/, 'TikTok'],
    [/google|busca/, 'Google'], [/web|pagina|sitio/, 'Página web'],
    [/recomend|amig|familia|conocid|referid/, 'Recomendación'],
    // Antes de "adventista": "iglesia adventista" es Iglesia, no Colegio adventista
    [/colport/, 'Colportaje'], [/iglesia|templo|pastor|culto/, 'Iglesia'],
    [/adventista|\bcat\b|titicaca/, 'Colegio adventista'], [/feria|colegio|charla|visita/, 'Feria / colegio'],
    [/volante|afiche|panel|letrero/, 'Volante / afiche'], [/radio|tv|tele/, 'Radio / TV'],
  ]
  return reglas.find(([re]) => re.test(t))?.[1] ?? texto.slice(0, 60)
}

// ---------------------------------------------------------------------
// Horario de atención de los asesores (hora de Lima, UTC-5 todo el año).
// Igual que public.franjas_atencion en la base de datos.
// ---------------------------------------------------------------------
export const HORARIO_ATENCION_TEXTO =
  'de lunes a jueves de 8:00 am a 12:30 pm y de 2:00 pm a 6:00 pm, y los viernes de 8:00 am a 1:00 pm (feriados no hay atención)'

/** Franjas por día de la semana (1 = lunes … 7 = domingo), en minutos desde la medianoche. */
const FRANJAS: Record<number, [number, number][]> = {
  1: [[480, 750], [840, 1080]], 2: [[480, 750], [840, 1080]], 3: [[480, 750], [840, 1080]], 4: [[480, 750], [840, 1080]],
  5: [[480, 780]], 6: [], 7: [],
}
const DESFASE_LIMA_MS = -5 * 3_600_000

/**
 * null si está en horario; si no, la próxima apertura.
 * feriados: fechas "AAAA-MM-DD" sin atención (tabla public.feriados).
 */
export function proximaAtencion(ahora = new Date(), feriados: ReadonlySet<string> = new Set()): Date | null {
  const local = new Date(ahora.getTime() + DESFASE_LIMA_MS) // "reloj" de Lima en campos UTC
  const minutos = local.getUTCHours() * 60 + local.getUTCMinutes()
  const diaSemana = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1
  const franjas = (d: Date) => (feriados.has(d.toISOString().slice(0, 10)) ? [] : FRANJAS[diaSemana(d)] ?? [])
  if (franjas(local).some(([a, b]) => minutos >= a && minutos < b)) return null
  for (let i = 0; i <= 14; i++) {
    const dia = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i))
    for (const [a] of franjas(dia)) {
      if (i === 0 && a <= minutos) continue
      return new Date(dia.getTime() + a * 60_000 - DESFASE_LIMA_MS)
    }
  }
  return null
}

/** "hoy a las 2:00 pm", "mañana a las 8:00 am", "el lunes a las 8:00 am" (sin puntos: no parte mensajes) */
export function textoProximaAtencion(apertura: Date, ahora = new Date()): string {
  const local = (d: Date) => new Date(d.getTime() + DESFASE_LIMA_MS)
  const a = local(apertura), h = local(ahora)
  const dias = Math.round((Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) - Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate())) / 86_400_000)
  const hora24 = a.getUTCHours(), min = a.getUTCMinutes()
  const hora = `${((hora24 + 11) % 12) + 1}:${String(min).padStart(2, '0')} ${hora24 < 12 ? 'am' : 'pm'}`
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `el ${nombres[a.getUTCDay()]}`
  return `${cuando} a las ${hora}`
}
