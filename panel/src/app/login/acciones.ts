'use server'

import { redirect } from 'next/navigation'
import { emailDeUsuario } from '@crm/db'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface EstadoLogin {
  error?: string
  usuario?: string
}

/** Ingreso con usuario (ej. "danna.lima") y contraseña. Sin correo. */
export async function iniciarSesion(_previo: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const usuario = String(formData.get('usuario') ?? '').trim().toLowerCase()
  const clave = String(formData.get('clave') ?? '')
  if (!usuario || !clave) return { error: 'Ingresa tu usuario y contraseña.', usuario }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signInWithPassword({ email: emailDeUsuario(usuario), password: clave })
  if (error) {
    return {
      error: error.code === 'invalid_credentials'
        ? 'Usuario o contraseña incorrectos.'
        : 'No se pudo iniciar sesión. Intenta de nuevo.',
      usuario,
    }
  }
  redirect('/')
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor()
  await supabase.auth.signOut()
  redirect('/login')
}
