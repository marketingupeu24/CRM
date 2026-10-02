'use server'

// Papelera de leads y usuarios (solo admin; las funciones de la base también lo exigen).
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

function refrescar() {
  for (const ruta of ['/papelera', '/leads', '/kanban', '/chats', '/pendientes', '/dashboard', '/usuarios']) revalidatePath(ruta)
}

const idsValidos = (ids: string[]) => [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 1000)

export async function restaurarLeads(ids: string[]): Promise<Resultado> {
  await exigirPermiso('papelera')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('restaurar_leads', { p_ids: idsValidos(ids) })
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: `${data} ${data === 1 ? 'lead restaurado' : 'leads restaurados'}.` }
}

export async function borrarLeads(ids: string[]): Promise<Resultado> {
  await exigirPermiso('papelera')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('borrar_leads_definitivo', { p_ids: idsValidos(ids) })
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: `${data} ${data === 1 ? 'lead borrado' : 'leads borrados'} para siempre.` }
}

export async function restaurarAsesor(id: string): Promise<Resultado> {
  await exigirPermiso('usuarios')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('restaurar_asesor', { p_id: id })
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: 'Usuario restaurado (inactivo: actívalo en Asesores y usuarios para que reciba leads).' }
}

export async function borrarAsesor(id: string): Promise<Resultado> {
  await exigirPermiso('usuarios')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('borrar_asesor_definitivo', { p_id: id })
  if (error) return { error: mensajeError(error) }
  refrescar()
  return { ok: 'Usuario borrado para siempre.' }
}
