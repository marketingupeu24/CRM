'use server'

// Acciones sobre leads. Todas usan la sesión del asesor: el RLS decide qué puede hacer
// (el asesor solo toca sus leads; el admin, todos).
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
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
  const { esAdmin } = await obtenerSesion()
  if (!esAdmin) return { error: 'Solo un administrador puede reasignar leads.' }

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

  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('leads').update({
    nombre: texto('nombre'),
    dni,
    carrera_interes: texto('carrera_interes'),
    modalidad: texto('modalidad'),
    convocatoria: texto('convocatoria'),
    sede: texto('sede'),
  }).eq('id', leadId)
  if (error) return { error: mensajeError(error) }

  refrescar(leadId)
  return { ok: true }
}

export interface ResultadoRegistro extends Resultado {
  leadId?: string
  duplicado?: boolean
}

/** Registro manual (reemplaza la hoja REGISTRO del Sheet). */
export async function registrarLeadManual(_previo: ResultadoRegistro, formData: FormData): Promise<ResultadoRegistro> {
  const texto = (campo: string) => String(formData.get(campo) ?? '').trim()
  const nombre = texto('nombre')
  const telefono = texto('telefono')
  if (!nombre || !telefono) return { error: 'Nombre y celular son obligatorios.' }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('registrar_lead_manual', {
    p_nombre: nombre,
    p_telefono: telefono,
    p_dni: texto('dni') || undefined,
    p_carrera: texto('carrera') || undefined,
    p_modalidad: texto('modalidad') || undefined,
    p_programa: texto('programa') === 'cepre' ? 'cepre' : 'pregrado',
    p_convocatoria: texto('convocatoria') || undefined,
    p_observacion: texto('observacion') || undefined,
    p_asesor_id: texto('asesor_id') || undefined,
  })
  if (error) return { error: mensajeError(error) }

  const r = data as { status: string; lead_id?: string; mensaje?: string; asesor_nombre?: string }
  if (r.status === 'duplicate') {
    return {
      duplicado: true,
      leadId: r.lead_id,
      error: r.mensaje ?? `Este lead ya estaba registrado${r.asesor_nombre ? ` con ${r.asesor_nombre}` : ''}. No se creó otro.`,
    }
  }

  refrescar()
  redirect(`/leads/${r.lead_id}`)
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
