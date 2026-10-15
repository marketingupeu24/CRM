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
  const venceEl = String(formData.get('vence_el') ?? '').trim()
  if (venceEl && !/^\d{4}-\d{2}-\d{2}$/.test(venceEl)) return { error: 'Fecha de vencimiento no válida.' }
  const supabase = await crearClienteServidor()
  const datos: { parte: string; titulo: string; campos: Record<string, string>; orden?: number; vence_el: string | null; activo?: boolean; vencida_at?: null } = {
    parte, titulo: titulo.slice(0, 160), campos, ...(Number.isFinite(orden) ? { orden } : {}), vence_el: venceEl || null,
  }
  // Una ficha que se desactivó por vencer vuelve al prompt si le pones una fecha nueva (o la quitas)
  if (id && (!venceEl || venceEl >= hoyLima())) {
    const { data: actual } = await supabase.from('genesys_fichas').select('vencida_at').eq('id', id).maybeSingle()
    if (actual?.vencida_at) Object.assign(datos, { activo: true, vencida_at: null })
  }
  const { error } = id
    ? await supabase.from('genesys_fichas').update(datos).eq('id', id)
    : await supabase.from('genesys_fichas').insert({ ...datos, activo: true })
  if (error) return { error: mensajeError(error) }
  revalidatePath('/genesys')
  return { ok: id ? 'Guardado.' : 'Ficha agregada.' }
}

function hoyLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}

export async function cambiarActivo(id: number, activo: boolean): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  if (activo) {
    const { data: ficha } = await supabase.from('genesys_fichas').select('vence_el').eq('id', id).maybeSingle()
    if (ficha?.vence_el && ficha.vence_el < hoyLima()) return { error: 'Esta ficha ya venció: edítala, actualiza la información y cambia (o borra) la fecha "Vence el".' }
  }
  const { error } = await supabase.from('genesys_fichas').update(activo ? { activo, vencida_at: null } : { activo }).eq('id', id)
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

/** Feriados: días sin atención (horario, reasignación, recordatorios y Genesys los respetan). */
export async function agregarFeriado(_previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const fecha = String(formData.get('fecha') ?? '')
  const nombre = String(formData.get('nombre') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Elige la fecha.' }
  if (nombre.length < 2) return { error: 'Escribe el nombre del feriado.' }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('feriados').insert({ fecha, nombre: nombre.slice(0, 80) })
  if (error?.code === '23505') return { error: 'Esa fecha ya está como feriado.' }
  if (error) return { error: mensajeError(error) }
  revalidatePath('/genesys')
  return { ok: 'Feriado guardado.' }
}

export async function eliminarFeriado(fecha: string): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('feriados').delete().eq('fecha', fecha)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/genesys')
  return { ok: 'Feriado eliminado.' }
}
