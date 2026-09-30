// Reglas del chat de WhatsApp, compartidas por el servidor y el navegador.
import type { LeadInteraccion } from '@crm/db'

const TIPOS_CHAT = new Set(['mensaje_lead', 'respuesta_bot', 'mensaje_asesor'])
export const PREFIJO_DATOS_BOT = 'Datos entregados a Genesys:'

/** Qué interacciones se muestran en el chat (el resto va a "Actividad"). */
export function esDelChat(m: Pick<LeadInteraccion, 'tipo' | 'contenido'>): boolean {
  return TIPOS_CHAT.has(m.tipo) || (m.tipo === 'sistema' && (m.contenido ?? '').startsWith(PREFIJO_DATOS_BOT))
}
