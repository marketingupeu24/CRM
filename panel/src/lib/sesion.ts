// Datos del usuario que está usando el panel (una sola consulta por petición).
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Asesor } from '@crm/db'
import { crearClienteServidor } from './supabase/server'

export interface Sesion {
  userId: string
  perfil: Asesor
  esAdmin: boolean
  debeCambiarClave: boolean
}

export const obtenerSesion = cache(async (): Promise<Sesion> => {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('asesores').select('*').eq('user_id', user.id).maybeSingle()
  if (!perfil) redirect('/login?error=sin_perfil')

  return {
    userId: user.id,
    perfil,
    esAdmin: perfil.rol === 'admin',
    debeCambiarClave: user.user_metadata?.debe_cambiar_clave === true,
  }
})

/** Para páginas y acciones solo de administrador. */
export async function exigirAdmin(): Promise<Sesion> {
  const sesion = await obtenerSesion()
  if (!sesion.esAdmin) redirect('/leads')
  return sesion
}
