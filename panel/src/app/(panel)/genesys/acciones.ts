'use server'

// Prompt de Genesys por partes: fichas pequeñas (requiere el módulo "conocimiento"; el RLS también).
import { revalidatePath } from 'next/cache'
import { PARTES_GENESYS } from '@crm/db'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

export async function guardarFicha(id: number | null, parte: string, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const definicion = PARTES_GENESYS.find((p) => p.clave === parte)
  if (!definicion) return { error: 'Parte no válida.' }
  const titulo = String(formData.get('titulo') ?? '').trim().replace(/\s+/g, ' ')
  if (titulo.length < 2) return { error: `Escribe el nombre (${definicion.nombreFicha.toLowerCase()}).` }
  const campos: Record<string, string> = {}
  for (const c of definicion.campos) {
    const valor = String(formData.get(c.clave) ?? '').replace(/\r\n/g, '\n').trim()
    if (valor.length > 6000) return { error: `"${c.etiqueta}" admite máximo 6000 caracteres.` }
    if (c.tipo === 'opciones' && valor && !c.opciones?.includes(valor)) return { error: `Elige una opción válida en "${c.etiqueta}".` }
    campos[c.clave] = valor
  }
  const orden = Number.parseInt(String(formData.get('orden') ?? ''), 10)
  const supabase = await crearClienteServidor()
  const datos = { parte, titulo: titulo.slice(0, 160), campos, ...(Number.isFinite(orden) ? { orden } : {}) }
  const { error } = id
    ? await supabase.from('genesys_fichas').update(datos).eq('id', id)
    : await supabase.from('genesys_fichas').insert({ ...datos, activo: true })
  if (error) return { error: mensajeError(error) }
  revalidatePath('/genesys')
  return { ok: id ? 'Guardado.' : 'Ficha agregada.' }
}

export async function cambiarActivo(id: number, activo: boolean): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('genesys_fichas').update({ activo }).eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/genesys')
  return { ok: activo ? 'Incluida en el prompt.' : 'Ya no va en el prompt.' }
}

export async function eliminarFicha(id: number): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('genesys_fichas').delete().eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/genesys')
  return { ok: 'Ficha eliminada.' }
}

/** "Ya lo pegué en BuilderBot": guarda la versión para saber qué tiene el bot y poder volver atrás. */
export async function registrarVersion(texto: string, nota: string): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  if (!texto.trim()) return { error: 'El prompt está vacío.' }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('genesys_versiones').insert({ texto, caracteres: texto.length, nota: nota.trim().slice(0, 200) })
  if (error) return { error: mensajeError(error) }
  revalidatePath('/genesys')
  return { ok: 'Listo: quedó registrado como la versión que tiene BuilderBot.' }
}
