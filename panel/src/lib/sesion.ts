// Datos del usuario que está usando el panel (una sola consulta por petición) y sus permisos.
// Los permisos se validan también en la base (RLS y funciones): esto solo decide qué se muestra.
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { CLAVES_MODULOS, MODULOS, type Asesor, type Modulo } from '@crm/db'
import { crearClienteServidor } from './supabase/server'

export interface Sesion {
  userId: string
  perfil: Asesor
  superadmin: boolean
  /** Módulos habilitados (el super admin tiene todos). */
  permisos: Modulo[]
  puede: (modulo: Modulo) => boolean
  /** Ve los leads de todo el equipo (columna asesor, filtros por asesor, etc.). */
  esAdmin: boolean
  debeCambiarClave: boolean
}

export const obtenerSesion = cache(async (): Promise<Sesion> => {
  const supabase = await crearClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('asesores').select('*').eq('user_id', user.id).maybeSingle()
  if (!perfil) redirect('/salir?motivo=sin_perfil')
  if (perfil.eliminado_at) redirect('/salir?motivo=eliminado')

  const permisos = perfil.superadmin
    ? [...CLAVES_MODULOS]
    : CLAVES_MODULOS.filter((m) => perfil.permisos.includes(m))
  const puede = (modulo: Modulo) => permisos.includes(modulo)

  return {
    userId: user.id,
    perfil,
    superadmin: perfil.superadmin,
    permisos,
    puede,
    esAdmin: puede('ver_todos'),
    debeCambiarClave: user.user_metadata?.debe_cambiar_clave === true,
  }
})

/** Primera página a la que el usuario tiene acceso (o la página "sin permisos"). */
export function rutaInicio(permisos: readonly Modulo[]): string {
  const orden: Modulo[] = ['leads', 'pendientes', 'chats', 'kanban', 'dashboard', 'campanas', 'registrar', 'papelera', 'usuarios', 'respuestas']
  const m = orden.find((clave) => permisos.includes(clave))
  return MODULOS.find((x) => x.clave === m)?.ruta ?? '/sin-permiso'
}

/** Para páginas y acciones de un módulo: sin permiso, lleva a su página de inicio. */
export async function exigirPermiso(modulo: Modulo): Promise<Sesion> {
  const sesion = await obtenerSesion()
  if (!sesion.puede(modulo)) redirect(rutaInicio(sesion.permisos) as never)
  return sesion
}

export async function exigirSuperadmin(): Promise<Sesion> {
  const sesion = await obtenerSesion()
  if (!sesion.superadmin) redirect(rutaInicio(sesion.permisos) as never)
  return sesion
}

/** Nombre del tipo de usuario para mostrar. */
export function etiquetaRol(sesion: Pick<Sesion, 'superadmin' | 'perfil'>): string {
  if (sesion.superadmin) return 'Super admin'
  return sesion.perfil.rol === 'admin' ? 'Administrador' : 'Asesor'
}
