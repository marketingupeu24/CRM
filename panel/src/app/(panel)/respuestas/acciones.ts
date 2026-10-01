'use server'

// Respuestas rápidas del chat (solo admin; el RLS también lo exige).
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirAdmin } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

function datos(formData: FormData) {
  const titulo = String(formData.get('titulo') ?? '').trim()
  const contenido = String(formData.get('contenido') ?? '').trim()
  const orden = Number.parseInt(String(formData.get('orden') ?? '100'), 10) || 100
  return { titulo, contenido, orden }
}

export async function guardarRespuesta(id: number | null, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirAdmin()
  const { titulo, contenido, orden } = datos(formData)
  if (!titulo || !contenido) return { error: 'Título y mensaje son obligatorios.' }
  if (titulo.length > 80) return { error: 'El título admite máximo 80 caracteres.' }

  const supabase = await crearClienteServidor()
  const { error } = id
    ? await supabase.from('respuestas_rapidas').update({ titulo, contenido, orden }).eq('id', id)
    : await supabase.from('respuestas_rapidas').insert({ titulo, contenido, orden })
  if (error) return { error: mensajeError(error) }
  revalidatePath('/respuestas')
  return { ok: id ? 'Respuesta actualizada.' : 'Respuesta creada.' }
}

export async function cambiarActiva(id: number, activa: boolean): Promise<Resultado> {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('respuestas_rapidas').update({ activa }).eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/respuestas')
  return { ok: activa ? 'Activada.' : 'Desactivada.' }
}

export async function eliminarRespuesta(id: number): Promise<Resultado> {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('respuestas_rapidas').delete().eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/respuestas')
  return { ok: 'Eliminada.' }
}
