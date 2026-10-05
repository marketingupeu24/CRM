'use server'

// Acciones sobre leads. Todas usan la sesión del asesor: el RLS decide qué puede hacer
// (el asesor solo toca sus leads; el admin, todos).
import { revalidatePath } from 'next/cache'
import { ESTADOS_LEAD, type LeadEstado } from '@crm/db'
import { mensajeError } from '@/lib/formato'
import { crearClienteServidor } from '@/lib/supabase/server'
import { obtenerSesion } from '@/lib/sesion'

export interface Resultado {
  error?: string
  ok?: boolean
}

function refrescar(leadId?: string) {
  revalidatePath('/leads')
  revalidatePath('/kanban')
  if (leadId) revalidatePath(`/leads/${leadId}`)
}

/** Mueve el lead a otro estado (ficha del lead y Kanban). */
export async function cambiarEstado(leadId: string, estado: LeadEstado, motivo?: string): Promise<Resultado> {
  if (!ESTADOS_LEAD.includes(estado)) return { error: 'Estado no válido.' }

  const supabase = await crearClienteServidor()
  const cambios: { estado: LeadEstado; motivo_no_interes?: string | null } = { estado }
  if (estado === 'lead_perdido' || estado === 'lead_no_interesado') cambios.motivo_no_interes = motivo?.trim() || null

  const { data, error } = await supabase.from('leads').update(cambios).eq('id', leadId).select('id')
  if (error) return { error: mensajeError(error) }
  if (!data.length) return { error: 'No tienes permiso para modificar este lead.' }

  refrescar(leadId)
  return { ok: true }
}

/** Nota del asesor en el historial del lead. */
export async function agregarNota(leadId: string, _previo: Resultado, formData: FormData): Promise<Resultado> {
  const contenido = String(formData.get('nota') ?? '').trim()
  if (!contenido) return { error: 'Escribe la nota.' }
  if (contenido.length > 2000) return { error: 'La nota es muy larga (máximo 2000 caracteres).' }

  const { perfil } = await obtenerSesion()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('lead_interacciones').insert({
    lead_id: leadId, tipo: 'nota_asesor', contenido, autor_id: perfil.id,
  })
  if (error) return { error: mensajeError(error) }

  refrescar(leadId)
  return { ok: true }
}

export async function eliminarNota(leadId: string, notaId: number): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('lead_interacciones').delete().eq('id', notaId).select('id')
  if (error) return { error: mensajeError(error) }
  if (!data.length) return { error: 'No puedes eliminar esta nota.' }
  refrescar(leadId)
  return { ok: true }
}

/** Solo admin (lo impide también el trigger de la base de datos). */
export async function reasignarAsesor(leadId: string, asesorId: string): Promise<Resultado> {
  const { puede } = await obtenerSesion()
  if (!puede('asignar')) return { error: 'No tienes permiso para reasignar leads.' }

  const supabase = await crearClienteServidor()
  const { data: lead } = await supabase.from('leads').select('estado').eq('id', leadId).single()
  const estadoAntesDeAsignar: LeadEstado[] = ['lead_nuevo', 'lead_en_conversacion', 'lead_no_interesado', 'lead_interesado']
  const { error } = await supabase.from('leads').update({
    asesor_id: asesorId,
    // Un lead que aún no tenía asesor pasa a asignado
    ...(lead && estadoAntesDeAsignar.includes(lead.estado) ? { estado: 'lead_asignado' as const } : {}),
  }).eq('id', leadId)
  if (error) return { error: mensajeError(error) }

  refrescar(leadId)
  return { ok: true }
}

/** Datos del lead que el asesor puede corregir desde la ficha. */
export async function actualizarDatos(leadId: string, _previo: Resultado, formData: FormData): Promise<Resultado> {
  const texto = (campo: string) => String(formData.get(campo) ?? '').trim() || null
  const dni = texto('dni')?.replace(/\D/g, '') || null
  if (dni && !/^\d{8,12}$/.test(dni)) return { error: 'El DNI debe tener entre 8 y 12 dígitos.' }

  // El celular solo lo cambia el admin: es el número al que escribe el chat del CRM
  const { puede } = await obtenerSesion()
  let telefono: string | undefined
  if (puede('editar_celular') && formData.has('telefono')) {
    const digitos = String(formData.get('telefono') ?? '').replace(/\D/g, '')
    telefono = /^9\d{8}$/.test(digitos) ? `51${digitos}` : digitos
    if (!/^\d{9,15}$/.test(telefono)) return { error: 'Revisa el celular (9 dígitos, o con código de país).' }
  }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('leads').update({
    ...(telefono ? { telefono } : {}),
    nombre: texto('nombre'),
    dni,
    carrera_interes: texto('carrera_interes'),
    modalidad: texto('modalidad'),
    convocatoria: texto('convocatoria'),
    sede: texto('sede'),
    origen_campana: texto('origen_campana'),
  }).eq('id', leadId)
  if (error?.code === '23505') {
    return { error: error.message.includes('dni') ? 'Ya existe otro lead con ese DNI.' : 'Ya existe otro lead con ese celular.' }
  }
  if (error) return { error: mensajeError(error) }

  refrescar(leadId)
  return { ok: true }
}

export interface ResultadoMasivo extends Resultado {
  cambiados?: number
}

const ESTADOS_ANTES_DE_ASIGNAR: LeadEstado[] = ['lead_nuevo', 'lead_en_conversacion', 'lead_no_interesado', 'lead_interesado']

/**
 * Acciones masivas desde la lista de leads: cambiar estado o (solo admin) asignar asesor.
 * El RLS limita qué filas cambia cada usuario.
 */
export async function accionMasiva(
  ids: string[],
  accion: { tipo: 'estado'; estado: LeadEstado; motivo?: string } | { tipo: 'asesor'; asesorId: string },
): Promise<ResultadoMasivo> {
  const lista = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200)
  if (!lista.length) return { error: 'Selecciona al menos un lead.' }
  const supabase = await crearClienteServidor()

  if (accion.tipo === 'estado') {
    if (!ESTADOS_LEAD.includes(accion.estado)) return { error: 'Estado no válido.' }
    const conMotivo = accion.estado === 'lead_perdido' || accion.estado === 'lead_no_interesado'
    if (conMotivo && !accion.motivo?.trim()) return { error: 'Elige el motivo.' }
    const { data, error } = await supabase.from('leads')
      .update({ estado: accion.estado, ...(conMotivo ? { motivo_no_interes: accion.motivo!.trim() } : {}) })
      .in('id', lista).select('id')
    if (error) return { error: mensajeError(error) }
    refrescar()
    return { ok: true, cambiados: data.length }
  }

  const { puede } = await obtenerSesion()
  if (!puede('asignar')) return { error: 'No tienes permiso para asignar leads.' }
  if (!accion.asesorId) return { error: 'Elige un asesor.' }
  // Los que aún no tenían asesor pasan a "asignado"; el resto conserva su estado
  const [{ data: a, error: e1 }, { data: b, error: e2 }] = await Promise.all([
    supabase.from('leads').update({ asesor_id: accion.asesorId, estado: 'lead_asignado' })
      .in('id', lista).in('estado', ESTADOS_ANTES_DE_ASIGNAR).select('id'),
    supabase.from('leads').update({ asesor_id: accion.asesorId })
      .in('id', lista).not('estado', 'in', `(${ESTADOS_ANTES_DE_ASIGNAR.join(',')})`).select('id'),
  ])
  if (e1 || e2) return { error: mensajeError((e1 ?? e2)!) }
  refrescar()
  return { ok: true, cambiados: (a?.length ?? 0) + (b?.length ?? 0) }
}

/** Papelera (solo admin): el lead desaparece del panel y se puede restaurar desde /papelera. */
export async function enviarAPapelera(ids: string[]): Promise<ResultadoMasivo> {
  const { puede } = await obtenerSesion()
  if (!puede('papelera')) return { error: 'No tienes permiso para eliminar leads.' }
  const lista = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500)
  if (!lista.length) return { error: 'Selecciona al menos un lead.' }
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('eliminar_leads', { p_ids: lista })
  if (error) return { error: mensajeError(error) }
  refrescar()
  revalidatePath('/papelera')
  return { ok: true, cambiados: data ?? 0 }
}

/** Pausa a Genesys 5 horas para este lead (el asesor conversa con él) o lo reactiva. */
export async function pausarBot(leadId: string, pausar: boolean): Promise<Resultado> {
  const supabase = await crearClienteServidor()
  const hasta = pausar ? new Date(Date.now() + 5 * 3_600_000).toISOString() : null
  const { data, error } = await supabase.from('leads').update({ bot_pausado_hasta: hasta }).eq('id', leadId).select('id')
  if (error) return { error: mensajeError(error) }
  if (!data.length) return { error: 'No tienes permiso para modificar este lead.' }
  refrescar(leadId)
  return { ok: true }
}
