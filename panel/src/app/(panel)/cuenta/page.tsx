import type { Metadata } from 'next'
import { obtenerSesion } from '@/lib/sesion'
import { FormularioClave } from './FormularioClave'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function PaginaCuenta() {
  const { perfil, esAdmin } = await obtenerSesion()

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Mi cuenta</h1>
      <section className="tarjeta p-6">
        <dl className="grid grid-cols-3 gap-y-3 text-sm">
          <dt className="text-slate-500">Nombre</dt><dd className="col-span-2 font-medium">{perfil.nombre}</dd>
          <dt className="text-slate-500">Usuario</dt><dd className="col-span-2 font-mono">{perfil.usuario}</dd>
          <dt className="text-slate-500">Rol</dt><dd className="col-span-2">{esAdmin ? 'Administrador' : 'Asesor'}</dd>
          {perfil.telefono && (<><dt className="text-slate-500">Celular</dt><dd className="col-span-2">{perfil.telefono}</dd></>)}
        </dl>
      </section>
      <section className="tarjeta p-6">
        <h2 className="mb-4 font-semibold">Cambiar contraseña</h2>
        <FormularioClave />
      </section>
    </div>
  )
}
