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

export const FUENTES = ['whatsapp_genesys', 'manual', 'google_form', 'web'] as const
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
  'Feria / colegio', 'Volante / afiche', 'Radio / TV', 'Otro',
] as const

/** Lleva lo que escribió el lead (o la campaña) al origen de la lista: "fb" -> "Facebook". */
export function normalizarOrigen(valor: unknown): string | null {
  const texto = valorResuelto(valor)
  if (!texto) return null
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const reglas: [RegExp, string][] = [
    [/face|\bfb\b|meta/, 'Facebook'], [/insta|\big\b/, 'Instagram'], [/tik ?tok/, 'TikTok'],
    [/google|busca/, 'Google'], [/web|pagina|sitio/, 'Página web'],
    [/recomend|amig|familia|conocid|referid/, 'Recomendación'], [/feria|colegio|charla|visita/, 'Feria / colegio'],
    [/volante|afiche|panel|letrero/, 'Volante / afiche'], [/radio|tv|tele/, 'Radio / TV'],
  ]
  return reglas.find(([re]) => re.test(t))?.[1] ?? texto.slice(0, 60)
}
