'use server'

// Pruebas del prompt de Genesys (módulo "conocimiento"; el RLS también lo exige).
import { revalidatePath } from 'next/cache'
import type { FichaGenesys } from '@crm/db'
import { mensajeError } from '@/lib/formato'
import { promptGenesys } from '@/lib/genesys'
import { evaluar, proveedorIA, responderConIA, type Prueba } from '@/lib/pruebas-genesys'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface ResultadoPrueba {
  error?: string
  ok?: boolean
  respuesta?: string
  detalle?: string
}

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>

/** El prompt tal como está ahora en el CRM (el mismo que se copia para BuilderBot). */
async function armarPrompt(supabase: Cliente): Promise<string> {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
  const [{ data: fichas }, { data: feriados }] = await Promise.all([
    supabase.from('genesys_fichas').select('id, parte, titulo, campos, activo, orden').order('orden').order('titulo'),
    supabase.from('feriados').select('fecha, nombre').gte('fecha', hoy).order('fecha').limit(30),
  ])
  return promptGenesys((fichas ?? []) as FichaGenesys[], new Date(), feriados ?? [])
}

/** El prompt actual (para la página de pruebas). */
export async function promptActual(): Promise<string> {
  await exigirPermiso('conocimiento')
  return armarPrompt(await crearClienteServidor())
}

/** Hace una pregunta al modelo con el prompt actual, la evalúa y guarda el resultado. */
export async function probarPregunta(id: number): Promise<ResultadoPrueba> {
  await exigirPermiso('conocimiento')
  if (!proveedorIA()) return { error: 'Falta configurar la clave de IA (OPENAI_API_KEY o ANTHROPIC_API_KEY) en Vercel.' }
  const supabase = await crearClienteServidor()
  const { data: p } = await supabase.from('genesys_pruebas').select('id, pregunta, debe_incluir, no_debe_incluir').eq('id', id).maybeSingle()
  if (!p) return { error: 'Prueba no encontrada.' }
  const hoy = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const contexto = `CONTEXTO DEL ALUMNO (desde el CRM): Alumno nuevo: todavía no ha dado sus datos. Hoy es ${hoy} (hora de Perú).`
  try {
    const respuesta = await responderConIA(await armarPrompt(supabase), p.pregunta, contexto)
    const ev = evaluar(respuesta, p as Prueba)
    const detalle = ev.ok ? 'Correcta' : [
      ev.faltan.length ? `Le faltó: ${ev.faltan.join(', ')}` : '',
      ev.prohibidas.length ? `Dijo lo que no debe: ${ev.prohibidas.join(', ')}` : '',
    ].filter(Boolean).join(' · ')
    await supabase.from('genesys_pruebas').update({
      ultima_respuesta: respuesta.slice(0, 4000), ultimo_resultado: ev.ok, ultimo_detalle: detalle, probado_at: new Date().toISOString(),
    }).eq('id', id)
    return { ok: ev.ok, respuesta, detalle }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo consultar la IA.' }
  }
}

/** Al terminar de probar todas: recarga la página con los resultados guardados. */
export async function refrescarPruebas(): Promise<void> {
  revalidatePath('/genesys/pruebas')
}

const lista = (valor: FormDataEntryValue | null) =>
  String(valor ?? '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20)

export async function guardarPrueba(id: number | null, _previo: ResultadoPrueba, formData: FormData): Promise<ResultadoPrueba> {
  await exigirPermiso('conocimiento')
  const pregunta = String(formData.get('pregunta') ?? '').trim()
  if (pregunta.length < 2 || pregunta.length > 500) return { error: 'Escribe la pregunta (máximo 500 caracteres).' }
  const datos = { pregunta, debe_incluir: lista(formData.get('debe_incluir')), no_debe_incluir: lista(formData.get('no_debe_incluir')) }
  const supabase = await crearClienteServidor()
  const { error } = id
    ? await supabase.from('genesys_pruebas').update(datos).eq('id', id)
    : await supabase.from('genesys_pruebas').insert(datos)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/genesys/pruebas')
  return { ok: true }
}

export async function eliminarPrueba(id: number): Promise<ResultadoPrueba> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('genesys_pruebas').delete().eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/genesys/pruebas')
  return { ok: true }
}
