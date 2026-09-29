// =====================================================================
//  Reglas del dominio de leads usadas por la API de Genesys.
//  Mismas reglas de normalización que el Apps Script de admisión.
// =====================================================================

/** Estados en los que Genesys todavía atiende al lead. En los demás, el lead ya es del asesor. */
export const ESTADOS_ATENDIDOS_POR_BOT = ['lead_nuevo', 'lead_en_conversacion', 'lead_no_interesado'] as const

export function botAtiendeLead(estado: string): boolean {
  return (ESTADOS_ATENDIDOS_POR_BOT as readonly string[]).includes(estado)
}

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
