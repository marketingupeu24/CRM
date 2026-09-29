// =====================================================================
//  @crm/db - Tipos y constantes del dominio de leads
//  Compartido por el bot (servidor) y el panel. No contiene claves.
// =====================================================================
import { Constants, type Database, type Tables } from './database.types'

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from './database.types'

export type Lead = Tables<'leads'>
export type Asesor = Tables<'asesores'>
export type LeadInteraccion = Tables<'lead_interacciones'>
export type LeadEstado = Database['public']['Enums']['lead_estado']
export type AsesorRol = Database['public']['Enums']['asesor_rol']
export type InteraccionTipo = Database['public']['Enums']['interaccion_tipo']

/** Estados del embudo, en orden. */
export const ESTADOS_LEAD: readonly LeadEstado[] = Constants.public.Enums.lead_estado

/** Nombre de cada estado para mostrar en la interfaz. */
export const ETIQUETAS_ESTADO: Record<LeadEstado, string> = {
  lead_nuevo: 'Nuevo',
  lead_en_conversacion: 'En conversación',
  lead_no_interesado: 'No interesado',
  lead_interesado: 'Interesado',
  lead_asignado: 'Asignado',
  lead_contactado: 'Contactado',
  lead_inscrito: 'Inscrito',
  lead_matriculado: 'Matriculado',
  lead_perdido: 'Perdido',
}

/**
 * Estados en los que el bot Genesys todavía atiende al lead (igual que en _shared/dominio.ts).
 * En cualquier otro estado el lead ya pasó a un asesor y el bot no le responde.
 */
export const ESTADOS_ATENDIDOS_POR_BOT: readonly LeadEstado[] = [
  'lead_nuevo',
  'lead_en_conversacion',
  'lead_no_interesado',
]

export function botAtiendeLead(estado: LeadEstado): boolean {
  return ESTADOS_ATENDIDOS_POR_BOT.includes(estado)
}

export const FUENTES = ['whatsapp_genesys', 'manual', 'google_form', 'web'] as const
export type Fuente = (typeof FUENTES)[number]

export const ETIQUETAS_FUENTE: Record<Fuente, string> = {
  whatsapp_genesys: 'WhatsApp (Genesys)',
  manual: 'Registro manual',
  google_form: 'Google Form',
  web: 'Formulario web',
}

export const PROGRAMAS = { pregrado: 'Pregrado', cepre: 'CePre' } as const
export type Programa = keyof typeof PROGRAMAS

/**
 * El panel se usa con usuario (ej. "danna.lima"), sin correo. Supabase Auth necesita
 * un email, así que se usa uno interno que nadie ve. Igual que email_de_usuario() en SQL.
 */
export const DOMINIO_EMAIL_INTERNO = 'crm.local'

export function emailDeUsuario(usuario: string): string {
  return `${usuario.trim().toLowerCase()}@${DOMINIO_EMAIL_INTERNO}`
}
