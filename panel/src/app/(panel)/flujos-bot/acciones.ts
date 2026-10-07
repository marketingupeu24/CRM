'use server'

// Flujos de BuilderBot (copia de cada flujo de Genesys para revisarlo y mejorar su prompt).
// Requiere el módulo "conocimiento"; el RLS también lo exige.
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

const DISPARADORES = ['general', 'accion', 'palabras']

export async function guardarFlujo(id: number | null, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const texto = (k: string) => String(formData.get(k) ?? '').trim()
  const nombre = texto('nombre')
  const disparador = DISPARADORES.includes(texto('disparador')) ? texto('disparador') : 'palabras'
  const palabras = [...new Set(texto('palabras').split(/[,\n]/).map((p) => p.trim()).filter(Boolean))].slice(0, 200)
  const prompt = String(formData.get('prompt') ?? '')
  const notas = texto('notas')
  if (nombre.length < 2) return { error: 'Ponle el nombre del flujo (como en BuilderBot).' }
  if (prompt.length > 20000) return { error: 'El prompt admite máximo 20 000 caracteres.' }

  const supabase = await crearClienteServidor()
  const datos = { nombre: nombre.slice(0, 80), disparador, palabras, prompt, notas: notas.slice(0, 4000) }
  const { error } = id
    ? await supabase.from('flujos_bot').update(datos).eq('id', id)
    : await supabase.from('flujos_bot').insert(datos)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/flujos-bot')
  return { ok: id ? 'Guardado.' : 'Flujo agregado.' }
}

export async function eliminarFlujo(id: number): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('flujos_bot').delete().eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/flujos-bot')
  return { ok: 'Flujo eliminado.' }
}
