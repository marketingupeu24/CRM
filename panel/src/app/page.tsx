import { redirect } from 'next/navigation'
import { obtenerSesion, rutaInicio } from '@/lib/sesion'

// Cada usuario entra a la primera página de sus módulos
export default async function Inicio() {
  const { permisos } = await obtenerSesion()
  redirect(rutaInicio(permisos) as never)
}
