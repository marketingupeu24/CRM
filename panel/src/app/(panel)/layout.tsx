import { Navegacion } from '@/components/Navegacion'
import { RefrescoEnVivo } from '@/components/RefrescoEnVivo'
import { obtenerSesion } from '@/lib/sesion'
import { contarPendientes } from '@/lib/pendientes'
import { crearClienteServidor } from '@/lib/supabase/server'
import { cerrarSesion } from '../login/acciones'
import { FormularioClave } from './cuenta/FormularioClave'

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const { perfil, esAdmin, debeCambiarClave } = await obtenerSesion()
  const supabase = await crearClienteServidor()
  const [{ count: sinResponder }, pendientes] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('sin_responder', true),
    contarPendientes(supabase),
  ])

  return (
    <div className="min-h-screen md:flex">
      {!debeCambiarClave && <RefrescoEnVivo />}
      <aside className="bg-marca-800 p-4 md:fixed md:inset-y-0 md:flex md:w-60 md:flex-col">
        <div className="mb-4 flex items-center gap-3 px-2 md:mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-bold text-marca-700">A</div>
          <div className="leading-tight">
            <p className="font-semibold text-white">CRM Admisión</p>
            <p className="text-xs text-marca-100">{esAdmin ? 'Administrador' : 'Asesor'}</p>
          </div>
        </div>
        {!debeCambiarClave && <Navegacion esAdmin={esAdmin} sinResponder={sinResponder ?? 0} pendientes={pendientes} />}
        <div className="mt-4 border-t border-white/15 pt-4 md:mt-auto">
          <p className="truncate px-2 text-sm font-medium text-white">{perfil.nombre}</p>
          <p className="truncate px-2 font-mono text-xs text-marca-100">{perfil.usuario}</p>
          <form action={cerrarSesion}>
            <button className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-sm text-marca-100 hover:bg-white/10 hover:text-white">
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:ml-60 md:p-8">
        {debeCambiarClave ? (
          <div className="mx-auto max-w-md">
            <div className="tarjeta p-6">
              <h1 className="text-xl font-semibold">Crea tu contraseña</h1>
              <p className="mt-1 mb-6 text-sm text-slate-500">
                Por seguridad, antes de continuar debes reemplazar la contraseña temporal que te dio el administrador.
              </p>
              <FormularioClave />
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
