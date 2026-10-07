import type { Metadata } from 'next'
import { MODULOS } from '@crm/db'
import { Ausencia } from '@/components/Ausencia'
import { etiquetaRol, obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FormularioClave } from './FormularioClave'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function PaginaCuenta() {
  const sesion = await obtenerSesion()
  const { perfil } = sesion
  const supabase = await crearClienteServidor()
  const { data: reemplazos } = await supabase.rpc('posibles_reemplazos')

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Mi cuenta</h1>
      <section className="tarjeta p-6">
        <dl className="grid grid-cols-3 gap-y-3 text-sm">
          <dt className="text-slate-500">Nombre</dt><dd className="col-span-2 font-medium">{perfil.nombre}</dd>
          <dt className="text-slate-500">Usuario</dt><dd className="col-span-2 font-mono">{perfil.usuario}</dd>
          <dt className="text-slate-500">Rol</dt><dd className="col-span-2">{etiquetaRol(sesion)}</dd>
          {perfil.telefono && (<><dt className="text-slate-500">Celular</dt><dd className="col-span-2">{perfil.telefono}</dd></>)}
        </dl>
      </section>
      <section className="tarjeta p-6">
        <h2 className="mb-1 font-semibold">Tus módulos</h2>
        <p className="mb-4 text-xs text-slate-500">{sesion.superadmin ? 'Como super admin tienes acceso a todo.' : 'Los define el super admin. Si necesitas otro, pídeselo.'}</p>
        <ul className="flex flex-wrap gap-2">
          {MODULOS.filter((m) => sesion.puede(m.clave)).map((m) => (
            <li key={m.clave} className="rounded-full bg-marca-50 px-3 py-1 text-xs font-medium text-marca-700">{m.titulo}</li>
          ))}
          {!sesion.permisos.length && <li className="text-sm text-slate-500">Ninguno por ahora.</li>}
        </ul>
      </section>
      <section className="tarjeta p-6">
        <h2 className="mb-1 font-semibold">Ausencia (viaje, permiso)</h2>
        <p className="mb-4 text-xs text-slate-500">
          Mientras estés ausente no recibes leads nuevos y tus clientes siguen siendo tuyos.
          Quien te cubra ve sus chats, puede escribirles y recibe los avisos de sus mensajes. Al terminar, todo vuelve como estaba.
        </p>
        <Ausencia asesor={perfil} reemplazos={reemplazos ?? []} />
      </section>
      <section className="tarjeta p-6">
        <h2 className="mb-4 font-semibold">Cambiar contraseña</h2>
        <FormularioClave />
      </section>
    </div>
  )
}
