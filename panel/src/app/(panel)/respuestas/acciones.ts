'use server'

// Respuestas rápidas del chat: para todos (las administra quien tiene el permiso "respuestas")
// o personales de cada asesor. Cada uno elige cuáles usa. El RLS también lo exige.
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refrescar() {
  revalidatePath('/respuestas')
  revalidatePath('/leads/[id]', 'page')
  revalidatePath('/chats/[id]', 'page')
}

function datos(formData: FormData) {
  const titulo = String(formData.get('titulo') ?? '').trim()
  const contenido = String(formData.get('contenido') ?? '').trim()
  const orden = Number.parseInt(String(formData.get('orden') ?? '100'), 10) || 100
  const para = String(formData.get('para') ?? '')
  return { titulo, contenido, orden, para }
}

/** "para" = 'todos' o el id del asesor dueño. Sin el permiso "respuestas" siempre es personal propia. */
export async function guardarRespuesta(id: number | null, _previo: Resultado, formData: FormData): Promise<Resultado> {
  const { perfil, puede } = await exigirPermiso('chats')
  const { titulo, contenido, orden, para } = datos(formData)
  if (!titulo || !contenido) return { error: 'Título y mensaje son obligatorios.' }
  if (titulo.length > 80) return { error: 'El título admite máximo 80 caracteres.' }
  if (contenido.length > 1500) return { error: 'El mensaje admite máximo 1500 caracteres.' }

  let asesorId: string | null = perfil.id
  if (puede('respuestas')) {
    if (para === 'todos') asesorId = null
    else if (UUID.test(para)) asesorId = para
  }

  const supabase = await crearClienteServidor()
  const { data, error } = id
    ? await supabase.from('respuestas_rapidas').update({ titulo, contenido, orden, asesor_id: asesorId }).eq('id', id).select('id')
    : await supabase.from('respuestas_rapidas').insert({ titulo, contenido, orden, asesor_id: asesorId }).select('id')
  if (error) return { error: mensajeError(error) }
  if (!data.length) return { error: 'No puedes modificar esta respuesta.' }
  refrescar()
  return { ok: id ? 'Respuesta actualizada.' : 'Respuesta creada.' }
}

export async function cambiarActiva(id: number, activa: boolean): Promise<Resultado> {
  await exigirPermiso('chats')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('respuestas_rapidas').update({ activa }).eq('id', id).select('id')
  if (error) return { error: mensajeError(error) }
  if (!data.length) return { error: 'No puedes modificar esta respuesta.' }
  refrescar()
  return { ok: activa ? 'Activada.' : 'Desactivada.' }
}

/** Solo con el permiso "respuestas": pasarla a "para todos" o hacerla personal de un asesor. */
export async function cambiarPara(id: number, para: string): Promise<Resultado> {
  await exigirPermiso('respuestas')
  if (para !== 'todos' && !UUID.test(para)) return { error: 'Elige para quién es.' }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('respuestas_rapidas').update({ asesor_id: para === 'todos' ? null : para }).eq('id', id)
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: para === 'todos' ? 'Ahora es para todos.' : 'Ahora es personal.' }
}

/** Cada asesor elige si usa una respuesta en su chat. */
export async function cambiarUso(id: number, usar: boolean): Promise<Resultado> {
  const { perfil } = await exigirPermiso('chats')
  const supabase = await crearClienteServidor()
  const { error } = usar
    ? await supabase.from('respuestas_ocultas').delete().eq('asesor_id', perfil.id).eq('respuesta_id', id)
    : await supabase.from('respuestas_ocultas').upsert({ asesor_id: perfil.id, respuesta_id: id }, { ignoreDuplicates: true })
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: usar ? 'La usarás en tu chat.' : 'Ya no sale en tu chat.' }
}

export async function eliminarRespuesta(id: number): Promise<Resultado> {
  await exigirPermiso('chats')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('respuestas_rapidas').delete().eq('id', id).select('id')
  if (error) return { error: mensajeError(error) }
  if (!data.length) return { error: 'No puedes eliminar esta respuesta.' }
  refrescar()
  return { ok: 'Eliminada.' }
}
