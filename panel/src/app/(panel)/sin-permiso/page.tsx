import type { Metadata } from 'next'
import { obtenerSesion, rutaInicio } from '@/lib/sesion'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Sin acceso' }

export default async function PaginaSinPermiso() {
  const { permisos } = await obtenerSesion()
  const inicio = rutaInicio(permisos)
  if (inicio !== '/sin-permiso') redirect(inicio as never)

  return (
    <div className="mx-auto max-w-md">
      <div className="tarjeta p-8 text-center">
        <p className="text-4xl" aria-hidden>🔐</p>
        <h1 className="mt-3 text-xl font-semibold">Aún no tienes módulos habilitados</h1>
        <p className="mt-2 text-sm text-slate-500">
          Pide al super admin que te dé acceso desde <b>Módulos y permisos</b>. Mientras tanto puedes cambiar tu contraseña en Mi cuenta.
        </p>
      </div>
    </div>
  )
}
