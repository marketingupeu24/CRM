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

const lista = (v: FormDataEntryValue | null) =>
  String(v ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30)

export async function guardarRecordatorio(id: number | null, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const titulo = String(formData.get('titulo') ?? '').trim()
  const mensaje = String(formData.get('mensaje') ?? '').replace(/\r\n/g, '\n').trim()
  const enviarEl = String(formData.get('enviar_el') ?? '')
  const desdeHora = String(formData.get('desde_hora') ?? '09:00')
  if (titulo.length < 2) return { error: 'Escribe un título.' }
  if (mensaje.length < 10 || mensaje.length > 1500) return { error: 'El mensaje debe tener entre 10 y 1500 caracteres.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(enviarEl)) return { error: 'Elige el día de envío.' }
  if (!/^\d{2}:\d{2}$/.test(desdeHora)) return { error: 'Elige la hora.' }
  const datos = {
    titulo: titulo.slice(0, 120), mensaje, enviar_el: enviarEl, desde_hora: desdeHora,
    carreras: lista(formData.get('carreras')), excluir_carreras: lista(formData.get('excluir_carreras')),
    solo_registrados: formData.get('solo_registrados') === 'on',
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
  return { ok: activo ? 'Activado: se enviará el día indicado, en horario de atención.' : 'Apagado.' }
}

export async function eliminarRecordatorio(id: number): Promise<Resultado> {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('recordatorios_alumnos').delete().eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/recordatorios')
  return { ok: 'Eliminado.' }
}
