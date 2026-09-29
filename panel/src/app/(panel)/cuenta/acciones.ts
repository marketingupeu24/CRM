'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface EstadoClave {
  error?: string
  ok?: boolean
}

/** El usuario cambia su propia contraseña (y se quita la marca de cambio obligatorio). */
export async function cambiarMiClave(_previo: EstadoClave, formData: FormData): Promise<EstadoClave> {
  const nueva = String(formData.get('nueva') ?? '')
  const repetir = String(formData.get('repetir') ?? '')

  if (nueva.length < 8) return { error: 'La nueva contraseña debe tener al menos 8 caracteres.' }
  if (/^\d+$/.test(nueva)) return { error: 'No uses solo números (como tu DNI). Combina letras y números.' }
  if (nueva !== repetir) return { error: 'Las contraseñas no coinciden.' }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.updateUser({ password: nueva, data: { debe_cambiar_clave: false } })
  if (error) {
    return {
      error: error.code === 'same_password'
        ? 'La nueva contraseña debe ser distinta de la actual.'
        : `No se pudo cambiar la contraseña: ${error.message}`,
    }
  }
  revalidatePath('/', 'layout')
  return { ok: true }
}
