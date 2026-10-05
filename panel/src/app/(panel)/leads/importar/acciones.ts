'use server'

// Importar varios alumnos: todo el trabajo (duplicados, asignación pareja, avisos) lo hace importar_leads().
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import type { FilaImportar } from '@/lib/importar'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface ResultadoFila {
  fila: number
  estado: 'nuevo' | 'actualizado' | 'omitido' | 'error'
  mensaje: string
  lead_id: string | null
}

export async function importarLeads(
  filas: FilaImportar[],
  opciones: { actividadId: number | null; asesorId: string | null; origen: string | null },
): Promise<{ error?: string; resultados?: ResultadoFila[] }> {
  await exigirPermiso('registrar')
  const utiles = filas.filter((f) => f.nombre.trim() || f.celular.trim()).slice(0, 500)
  if (!utiles.length) return { error: 'Escribe o pega al menos un alumno.' }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('importar_leads', {
    p_filas: utiles.map((f) => ({ ...f })),
    p_actividad_id: opciones.actividadId ?? undefined,
    p_asesor_id: opciones.asesorId && /^[0-9a-f-]{36}$/i.test(opciones.asesorId) ? opciones.asesorId : undefined,
    p_repartir: opciones.asesorId === 'repartir',
    p_origen: opciones.origen ?? undefined,
  })
  if (error) return { error: mensajeError(error) }
  revalidatePath('/leads')
  revalidatePath('/actividades')
  return { resultados: (data ?? []) as ResultadoFila[] }
}
