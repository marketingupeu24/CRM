// Reglas de las alertas automáticas de seguimiento (página Pendientes y contador del menú).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@crm/db'

/** Lead asignado al que nadie escribió después de estas horas. */
export const HORAS_SIN_CONTACTAR = 2
/** Lead contactado sin ningún movimiento durante estos días. */
export const DIAS_SIN_ACTIVIDAD = 3

export function limitesAlertas(ahora = Date.now()) {
  return {
    contacto: new Date(ahora - HORAS_SIN_CONTACTAR * 3_600_000).toISOString(),
    actividad: new Date(ahora - DIAS_SIN_ACTIVIDAD * 86_400_000).toISOString(),
  }
}

export function finDeHoyLima(): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
  return `${hoy}T23:59:59-05:00`
}

/** Total para el contador del menú: tareas vencidas o de hoy + leads sin contactar + sin actividad. */
export async function contarPendientes(supabase: SupabaseClient<Database>): Promise<number> {
  const { contacto, actividad } = limitesAlertas()
  const [tareas, sinContactar, inactivos] = await Promise.all([
    supabase.from('tareas').select('id', { count: 'exact', head: true }).is('completada_at', null).lte('vence_at', finDeHoyLima()),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('estado', 'lead_asignado').lt('fecha_asignado', contacto),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('estado', 'lead_contactado').lt('ultimo_contacto', actividad).lt('updated_at', actividad)
      .or(`ultima_respuesta_at.is.null,ultima_respuesta_at.lt.${actividad}`),
  ])
  return (tareas.count ?? 0) + (sinContactar.count ?? 0) + (inactivos.count ?? 0)
}
