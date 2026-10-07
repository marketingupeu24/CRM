'use server'

// Ausencia temporal (viaje, permiso): la programa el propio usuario o un admin (la base lo valida).
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface ResultadoAusencia {
  error?: string
  ok?: string
}

const DURACIONES: Record<string, number> = { '4h': 4, '1d': 24, '2d': 48, '3d': 72, '7d': 168 }

/** "2026-10-09T18:00" (hora de Perú, del campo de fecha) -> Date */
function fechaLima(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null
  const d = new Date(`${valor}:00-05:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function programarAusencia(asesorId: string, _previo: ResultadoAusencia, formData: FormData): Promise<ResultadoAusencia> {
  await obtenerSesion()
  const duracion = String(formData.get('duracion') ?? '')
  const ahora = new Date()
  let desde: Date = ahora
  let hasta: Date | null
  if (duracion === 'fechas') {
    desde = fechaLima(String(formData.get('desde') ?? '')) ?? ahora
    hasta = fechaLima(String(formData.get('hasta') ?? ''))
    if (!hasta) return { error: 'Elige la fecha y hora de regreso.' }
  } else {
    const horas = DURACIONES[duracion]
    if (!horas) return { error: 'Elige cuánto tiempo estarás ausente.' }
    hasta = new Date(ahora.getTime() + horas * 3_600_000)
  }
  const reemplazo = String(formData.get('reemplazo') ?? '')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('programar_ausencia', {
    p_asesor_id: asesorId,
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
    p_reemplazo: /^[0-9a-f-]{36}$/i.test(reemplazo) ? reemplazo : undefined,
    p_motivo: String(formData.get('motivo') ?? '').trim() || undefined,
  })
  if (error) return { error: mensajeError(error) }
  revalidatePath('/cuenta')
  revalidatePath('/usuarios')
  return { ok: desde > ahora ? 'Ausencia programada.' : 'Ausencia activada: ya no recibe leads nuevos.' }
}

export async function terminarAusencia(asesorId: string): Promise<ResultadoAusencia> {
  await obtenerSesion()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('terminar_ausencia', { p_asesor_id: asesorId })
  if (error) return { error: mensajeError(error) }
  revalidatePath('/cuenta')
  revalidatePath('/usuarios')
  return { ok: 'Ausencia terminada: vuelve a recibir leads como antes.' }
}
