'use server'

// Tareas ("próxima acción") del asesor sobre sus leads. El RLS limita cada acción.
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: boolean
}

function refrescar(leadId?: string) {
  revalidatePath('/pendientes')
  if (leadId) revalidatePath(`/leads/${leadId}`)
}

/** Agenda una tarea. venceIso viene del navegador ya convertido a ISO (hora de Lima del usuario). */
export async function crearTarea(leadId: string, titulo: string, venceIso: string): Promise<Resultado> {
  const limpio = titulo.trim()
  if (!limpio) return { error: 'Escribe qué hay que hacer.' }
  if (limpio.length > 300) return { error: 'Máximo 300 caracteres.' }
  const vence = new Date(venceIso)
  if (Number.isNaN(vence.getTime())) return { error: 'Fecha no válida.' }

  const { perfil } = await obtenerSesion()
  const supabase = await crearClienteServidor()
  // El responsable es el asesor del lead (si el admin agenda, la tarea queda para el asesor del lead)
  const { data: lead } = await supabase.from('leads').select('asesor_id').eq('id', leadId).maybeSingle()
  if (!lead) return { error: 'No tienes acceso a este lead.' }

  const { error } = await supabase.from('tareas').insert({
    lead_id: leadId,
    asesor_id: lead.asesor_id ?? perfil.id,
    titulo: limpio,
    vence_at: vence.toISOString(),
    creada_por: perfil.id,
  })
  if (error) return { error: mensajeError(error) }
  refrescar(leadId)
  return { ok: true }
}

export async function completarTarea(tareaId: number, leadId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('tareas')
    .update({ completada_at: new Date().toISOString() }).eq('id', tareaId).select('id')
  if (error) return { error: mensajeError(error) }
  if (!data.length) return { error: 'No puedes modificar esta tarea.' }
  refrescar(leadId)
  return { ok: true }
}

/** Pospone la tarea: +1 día desde su vencimiento (o desde ahora si ya venció). */
export async function posponerTarea(tareaId: number, leadId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data: tarea } = await supabase.from('tareas').select('vence_at').eq('id', tareaId).maybeSingle()
  if (!tarea) return { error: 'No puedes modificar esta tarea.' }
  const base = Math.max(Date.parse(tarea.vence_at), Date.now())
  const { error } = await supabase.from('tareas')
    .update({ vence_at: new Date(base + 86_400_000).toISOString() }).eq('id', tareaId)
  if (error) return { error: mensajeError(error) }
  refrescar(leadId)
  return { ok: true }
}

export async function eliminarTarea(tareaId: number, leadId: string): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('tareas').delete().eq('id', tareaId)
  if (error) return { error: mensajeError(error) }
  refrescar(leadId)
  return { ok: true }
}
