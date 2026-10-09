'use server'

// Enlaces y QR por medio (crear y editar: módulo "Crear campañas"; el RLS también lo exige).
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

/** "Flyer feria Juliaca" -> "FLYERFER" (letras y números, máximo 8) */
function codigoDe(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

export async function crearEnlace(_previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirPermiso('gestionar_campanas')
  const nombre = String(formData.get('nombre') ?? '').trim()
  const origen = String(formData.get('origen') === 'otro' ? formData.get('origen_otro') ?? '' : formData.get('origen') ?? '').trim()
  const mensaje = String(formData.get('mensaje') ?? '').trim()
  let codigo = String(formData.get('codigo') ?? '').trim().toUpperCase() || codigoDe(nombre)
  if (nombre.length < 2 || nombre.length > 80) return { error: 'Escribe un nombre (ej. TikTok perfil, Flyer feria Juliaca).' }
  if (origen.length < 2 || origen.length > 60) return { error: 'Elige de qué medio es.' }
  if (mensaje.length < 5 || mensaje.length > 300) return { error: 'El mensaje debe tener entre 5 y 300 caracteres.' }
  if (!/^[A-Z0-9]{3,10}$/.test(codigo)) {
    if (codigo.length < 3) codigo = (codigo + 'UPEU').slice(0, 6)
    else return { error: 'El código solo puede tener letras y números (3 a 10), sin espacios.' }
  }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('enlaces_origen').insert({ nombre, origen, codigo, mensaje })
  if (error?.code === '23505') return { error: `El código ${codigo} ya existe: escribe otro.` }
  if (error) return { error: mensajeError(error) }
  revalidatePath('/enlaces')
  return { ok: 'Enlace creado.' }
}

export async function cambiarActivoEnlace(id: number, activo: boolean): Promise<Resultado> {
  await exigirPermiso('gestionar_campanas')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('enlaces_origen').update({ activo }).eq('id', id)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/enlaces')
  return { ok: activo ? 'Activado.' : 'Desactivado: el enlace y el QR dejan de abrir WhatsApp.' }
}
