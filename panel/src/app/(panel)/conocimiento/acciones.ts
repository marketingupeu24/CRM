'use server'

// Base de conocimiento de Genesys (editar requiere el módulo "conocimiento"; el RLS también lo exige).
import { revalidatePath } from 'next/cache'
import { CATEGORIAS_CONOCIMIENTO } from '@crm/db'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

function refrescar() {
  revalidatePath('/conocimiento')
  revalidatePath('/revision-bot')
}

export async function guardarEntrada(id: number | null, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const texto = (k: string) => String(formData.get(k) ?? '').trim()
  const categoria = texto('categoria')
  const titulo = texto('titulo')
  const contenido = texto('contenido')
  const orden = Number.parseInt(texto('orden') || '100', 10) || 100
  const activo = formData.get('activo') === 'on'
  if (!(categoria in CATEGORIAS_CONOCIMIENTO)) return { error: 'Elige una sección.' }
  if (!titulo || !contenido) return { error: 'Título y contenido son obligatorios.' }
  if (titulo.length > 120) return { error: 'El título admite máximo 120 caracteres.' }
  if (contenido.length > 6000) return { error: 'El contenido admite máximo 6000 caracteres.' }

  const supabase = await crearClienteServidor()
  const datos = { categoria, titulo, contenido, orden, activo }
  const { error } = id
    ? await supabase.from('conocimiento').update(datos).eq('id', id)
    : await supabase.from('conocimiento').insert(datos)
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: id ? 'Guardado. Copia el texto actualizado a BuilderBot.' : 'Agregado. Copia el texto actualizado a BuilderBot.' }
}

export async function eliminarEntrada(id: number): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('conocimiento').delete().eq('id', id)
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: 'Eliminado.' }
}

/** Marca (o desmarca) respuestas del bot como revisadas. */
export async function marcarRevisada(ids: number[], revisada: boolean): Promise<Resultado> {
  const { perfil } = await exigirPermiso('conocimiento')
  const lista = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0).slice(0, 300)
  if (!lista.length) return { error: 'Nada que marcar.' }
  const supabase = await crearClienteServidor()
  const { error } = revisada
    ? await supabase.from('revision_bot').upsert(lista.map((interaccion_id) => ({ interaccion_id, revisada_por: perfil.id })), { onConflict: 'interaccion_id', ignoreDuplicates: true })
    : await supabase.from('revision_bot').delete().in('interaccion_id', lista)
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: revisada ? 'Marcada como revisada.' : 'Vuelve a pendientes.' }
}
