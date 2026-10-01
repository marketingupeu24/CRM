'use server'

// Campañas (solo admin; el RLS también lo exige).
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirAdmin } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function refrescar() {
  revalidatePath('/campanas')
  revalidatePath('/leads')
  revalidatePath('/dashboard')
}

export async function guardarCampana(id: number | null, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirAdmin()
  const texto = (k: string) => String(formData.get(k) ?? '').trim()
  const nombre = texto('nombre')
  const origen = texto('origen') || null
  const inicio = texto('inicio')
  const fin = texto('fin')
  if (!nombre) return { error: 'Ponle un nombre a la campaña.' }
  if (nombre.length > 80) return { error: 'El nombre admite máximo 80 caracteres.' }
  if (!FECHA.test(inicio) || !FECHA.test(fin)) return { error: 'Indica la fecha de inicio y de fin.' }
  if (fin < inicio) return { error: 'La fecha de fin no puede ser antes del inicio.' }

  const supabase = await crearClienteServidor()
  const datos = { nombre, origen, inicio, fin }
  const { error } = id
    ? await supabase.from('campanas').update(datos).eq('id', id)
    : await supabase.from('campanas').insert(datos)
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: id ? 'Campaña actualizada.' : 'Campaña creada.' }
}

export async function cambiarActiva(id: number, activa: boolean): Promise<Resultado> {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('campanas').update({ activa }).eq('id', id)
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: activa ? 'Activada.' : 'Archivada.' }
}

/** Borra solo la campaña: los leads no se tocan. */
export async function eliminarCampana(id: number): Promise<Resultado> {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('campanas').delete().eq('id', id)
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: 'Eliminada.' }
}
