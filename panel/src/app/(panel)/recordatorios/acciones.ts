'use server'

// Recordatorios automáticos a los alumnos (módulo "conocimiento"; el RLS también lo exige).
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { hoyLima } from '@/lib/texto'

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
  const enviarEl = automatico ? hoyLima() : String(formData.get('enviar_el') ?? '')
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
  // Editar uno ya terminado no lo vuelve a enviar: cada recordatorio en fecha se envía una sola vez
  const { error } = id
    ? await supabase.from('recordatorios_alumnos').update(datos).eq('id', id)
    : await supabase.from('recordatorios_alumnos').insert(datos)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/recordatorios')
  return { ok: id ? 'Guardado.' : 'Recordatorio creado (apagado): revísalo y actívalo.' }
}

export async function cambiarActivo(id: number, activo: boolean): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { data: rec } = await supabase.from('recordatorios_alumnos').select('dias_sin_contacto, completado_at').eq('id', id).maybeSingle()
  if (!rec) return { error: 'No se encontró el recordatorio.' }
  if (activo && rec.completado_at) return { error: 'Este recordatorio ya se envió y terminó: se envía una sola vez. Crea uno nuevo si necesitas otro aviso.' }
  let soloLeads: string[] | undefined
  if (activo && rec.dias_sin_contacto === null) {
    // En fecha: se envía una sola vez y solo a los marcados al activarlo (los que se sumen después no lo reciben)
    const { data: candidatos, error: e } = await supabase.rpc('candidatos_recordatorio', { p_id: id })
    if (e) return { error: mensajeError(e) }
    soloLeads = (candidatos ?? []).filter((c) => c.marcado).map((c) => c.id)
    if (!soloLeads.length) return { error: 'No hay alumnos marcados para enviar.' }
  }
  const { error } = await supabase.from('recordatorios_alumnos').update({ activo, ...(soloLeads ? { solo_leads: soloLeads } : {}) }).eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/recordatorios')
  return { ok: activo ? 'Activado: se enviará solo a los marcados, en horario de atención y de a pocos (4 cada 10 minutos). Al terminar se apaga solo.' : 'Apagado.' }
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

/** ids = null (solo automáticos): a todos los que cumplan, también a los que se sumen después; con ids: solo a esos. */
export async function guardarSeleccion(id: number, ids: string[] | null): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  if (ids && !ids.length) return { error: 'Marca al menos un alumno (o apaga el recordatorio).' }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('recordatorios_alumnos')
    .update({ solo_leads: ids ? ids.slice(0, 2000) : null }).eq('id', id)
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
