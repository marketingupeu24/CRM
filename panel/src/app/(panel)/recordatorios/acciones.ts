'use server'

// Recordatorios automáticos a los alumnos (módulo "conocimiento"; el RLS también lo exige).
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

export async function guardarRecordatorio(id: number | null, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const titulo = String(formData.get('titulo') ?? '').trim()
  const mensaje = String(formData.get('mensaje') ?? '').replace(/\r\n/g, '\n').trim()
  // Automático por inactividad: sin fecha fija (empieza hoy) y con los días sin contacto
  const automatico = formData.get('tipo') === 'inactividad'
  const diasSinContacto = Number.parseInt(String(formData.get('dias_sin_contacto') ?? ''), 10)
  const diasMaximo = Number.parseInt(String(formData.get('dias_maximo') ?? '30'), 10)
  const enviarEl = automatico ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()) : String(formData.get('enviar_el') ?? '')
  const desdeHora = String(formData.get('desde_hora') ?? '09:00')
  if (titulo.length < 2) return { error: 'Escribe un título.' }
  if (mensaje.length < 10 || mensaje.length > 1500) return { error: 'El mensaje debe tener entre 10 y 1500 caracteres.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(enviarEl)) return { error: 'Elige el día de envío.' }
  if (!/^\d{2}:\d{2}$/.test(desdeHora)) return { error: 'Elige la hora.' }
  if (automatico && !(diasSinContacto >= 2 && diasSinContacto <= 90)) return { error: 'Días sin contacto: entre 2 y 90.' }
  if (automatico && !(diasMaximo > diasSinContacto && diasMaximo <= 365)) return { error: 'El máximo de días debe ser mayor que los días sin contacto (hasta 365).' }
  // Carreras: "solo las marcadas" o "todas excepto las marcadas"
  const marcadas = formData.getAll('carrera').map((x) => String(x).trim()).filter(Boolean).slice(0, 40)
  const soloMarcadas = formData.get('modo_carreras') === 'solo'
  if (soloMarcadas && !marcadas.length) return { error: 'Marca al menos una carrera (o elige "Todas las carreras").' }
  const datos = {
    titulo: titulo.slice(0, 120), mensaje, enviar_el: enviarEl, desde_hora: desdeHora,
    carreras: soloMarcadas ? marcadas : [], excluir_carreras: soloMarcadas ? [] : marcadas,
    solo_registrados: formData.get('solo_registrados') === 'on',
    dias_sin_contacto: automatico ? diasSinContacto : null,
    ...(automatico ? { dias_maximo: diasMaximo } : {}),
  }
  const supabase = await crearClienteServidor()
  // Al editar uno ya terminado, vuelve a quedar pendiente (solo para quienes aún no lo recibieron)
  const { error } = id
    ? await supabase.from('recordatorios_alumnos').update({ ...datos, completado_at: null }).eq('id', id)
    : await supabase.from('recordatorios_alumnos').insert(datos)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/recordatorios')
  return { ok: id ? 'Guardado.' : 'Recordatorio creado (apagado): revísalo y actívalo.' }
}

export async function cambiarActivo(id: number, activo: boolean): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('recordatorios_alumnos').update({ activo }).eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/recordatorios')
  return { ok: activo ? 'Activado: se enviará en horario de atención y de a pocos.' : 'Apagado.' }
}

export interface Candidato {
  id: string
  nombre: string | null
  telefono: string
  carrera: string | null
  asesor: string | null
  marcado: boolean
}

/** Alumnos que cumplen los filtros del recordatorio (y aún no lo recibieron), con su casilla. */
export async function listarCandidatos(id: number): Promise<{ candidatos?: Candidato[]; error?: string }> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('candidatos_recordatorio', { p_id: id })
  if (error) return { error: mensajeError(error) }
  return { candidatos: (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono, carrera: c.carrera, asesor: c.asesor, marcado: c.marcado })) }
}

/** ids = null: a todos los que cumplan (también a los que se sumen después); con ids: solo a esos. */
export async function guardarSeleccion(id: number, ids: string[] | null): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  if (ids && !ids.length) return { error: 'Marca al menos un alumno (o apaga el recordatorio).' }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('recordatorios_alumnos')
    .update({ solo_leads: ids ? ids.slice(0, 2000) : null, completado_at: null }).eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/recordatorios')
  return { ok: ids ? `Se enviará solo a los ${ids.length} alumno(s) marcados.` : 'Se enviará a todos los que cumplan los filtros.' }
}

export async function eliminarRecordatorio(id: number): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('recordatorios_alumnos').delete().eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/recordatorios')
  return { ok: 'Eliminado.' }
}
