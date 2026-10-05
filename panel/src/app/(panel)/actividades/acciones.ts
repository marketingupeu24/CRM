'use server'

// Actividades con QR (ferias, visitas a colegios). El RLS limita quién crea y edita.
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

const TIPOS = ['feria', 'colegio', 'charla', 'otro']

export async function guardarActividad(id: number | null, _previo: Resultado, formData: FormData): Promise<Resultado> {
  const { perfil, puede } = await exigirPermiso('actividades')
  const texto = (k: string) => String(formData.get(k) ?? '').trim()
  const nombre = texto('nombre')
  const tipo = TIPOS.includes(texto('tipo')) ? texto('tipo') : 'feria'
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(texto('fecha')) ? texto('fecha') : null
  if (nombre.length < 3) return { error: 'Ponle un nombre a la actividad (ej.: Feria vocacional Juliaca 2026).' }
  if (nombre.length > 120) return { error: 'El nombre admite máximo 120 caracteres.' }

  // Responsable: uno mismo, salvo quien puede asignar (elige a cualquier asesor)
  const responsable = puede('asignar') && /^[0-9a-f-]{36}$/i.test(texto('responsable_id')) ? texto('responsable_id') : perfil.id
  const datos = {
    nombre,
    tipo,
    lugar: texto('lugar').slice(0, 120) || null,
    fecha,
    asignacion: texto('asignacion') === 'rotacion' ? 'rotacion' : 'responsable',
    bienvenida: formData.get('bienvenida') === 'on',
    responsable_id: responsable,
  }
  const supabase = await crearClienteServidor()
  const { error } = id
    ? await supabase.from('actividades').update(datos).eq('id', id)
    : await supabase.from('actividades').insert(datos)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/actividades')
  return { ok: id ? 'Actividad actualizada.' : 'Actividad creada: ya puedes descargar su QR.' }
}

export async function cambiarActiva(id: number, activa: boolean): Promise<Resultado> {
  await exigirPermiso('actividades')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('actividades').update({ activa }).eq('id', id).select('id')
  if (error) return { error: mensajeError(error) }
  if (!data.length) return { error: 'Solo el responsable puede cambiar esta actividad.' }
  revalidatePath('/actividades')
  return { ok: activa ? 'Formulario abierto.' : 'Formulario cerrado: el QR ya no recibe registros.' }
}
