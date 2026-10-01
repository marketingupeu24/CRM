import { BotonBuscar } from '@/components/BotonBuscar'
import { Navegacion } from '@/components/Navegacion'
import { PaletaComandos } from '@/components/PaletaComandos'
import { RefrescoEnVivo } from '@/components/RefrescoEnVivo'
import { SelectorTema } from '@/components/SelectorTema'
import { obtenerSesion } from '@/lib/sesion'
import { contarPendientes } from '@/lib/pendientes'
import { crearClienteServidor } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { COOKIE_TEMA, type Tema } from '@/lib/tema'
import { cerrarSesion } from '../login/acciones'
import { FormularioClave } from './cuenta/FormularioClave'

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const { perfil, esAdmin, debeCambiarClave } = await obtenerSesion()
  const supabase = await crearClienteServidor()
  const [{ count: sinResponder }, pendientes] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('sin_responder', true),
    contarPendientes(supabase),
  ])
  const temaGuardado = ((await cookies()).get(COOKIE_TEMA)?.value ?? 'auto') as Tema
  const iniciales = perfil.nombre.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()

  return (
    <div className="min-h-screen md:flex">
      {!debeCambiarClave && <RefrescoEnVivo />}
      {!debeCambiarClave && <PaletaComandos esAdmin={esAdmin} />}

      <aside className="bg-lateral p-4 md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col md:overflow-y-auto">
        <div className="mb-4 flex items-center gap-3 px-2 md:mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-marca-600 to-violet-500 font-bold text-white shadow">
            A
          </div>
          <div className="leading-tight">
            <p className="font-semibold text-white">CRM Admisión</p>
            <p className="text-xs text-lateral-texto">{esAdmin ? 'Administrador' : 'Asesor'}</p>
          </div>
        </div>

        {!debeCambiarClave && <BotonBuscar />}
        {!debeCambiarClave && <Navegacion esAdmin={esAdmin} sinResponder={sinResponder ?? 0} pendientes={pendientes} />}

        <div className="mt-6 space-y-3 border-t border-white/10 pt-4 md:mt-auto">
          <SelectorTema inicial={temaGuardado} />
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lateral-activo text-xs font-semibold text-white">
              {iniciales}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-white">{perfil.nombre}</p>
              <p className="truncate font-mono text-xs text-lateral-texto">{perfil.usuario}</p>
            </div>
            <form action={cerrarSesion}>
              <button title="Cerrar sesión" aria-label="Cerrar sesión" className="rounded-lg px-2 py-1 text-sm text-lateral-texto hover:bg-white/10 hover:text-white">
                ⏻
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:ml-64 md:p-8">
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
