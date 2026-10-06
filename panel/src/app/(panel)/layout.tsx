import { cookies } from 'next/headers'
import { AvisosEscritorio } from '@/components/AvisosEscritorio'
import { BotonBuscar } from '@/components/BotonBuscar'
import { ProveedorConfirmacion } from '@/components/Confirmacion'
import { LogoUpeu } from '@/components/LogoUpeu'
import { Navegacion } from '@/components/Navegacion'
import { PaletaComandos } from '@/components/PaletaComandos'
import { RefrescoEnVivo } from '@/components/RefrescoEnVivo'
import { SelectorTema } from '@/components/SelectorTema'
import { etiquetaRol, obtenerSesion } from '@/lib/sesion'
import { contarPendientes } from '@/lib/pendientes'
import { crearClienteServidor } from '@/lib/supabase/server'
import { COOKIE_TEMA, TEMA_POR_DEFECTO, type Tema } from '@/lib/tema'
import { cerrarSesion } from '../login/acciones'
import { FormularioClave } from './cuenta/FormularioClave'

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  const { perfil, permisos, superadmin, debeCambiarClave } = sesion
  const supabase = await crearClienteServidor()
  const [{ count: sinResponder }, pendientes, { data: revision }] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('sin_responder', true),
    contarPendientes(supabase),
    // Respuestas del bot sin revisar (solo para quien administra la base de conocimiento)
    sesion.puede('conocimiento') ? supabase.rpc('preguntas_sin_respuesta', { p_dias: 30 }) : Promise.resolve({ data: [] }),
  ])
  const revisionBot = (revision ?? []).filter((p: { revisada: boolean }) => !p.revisada).length
  const temaGuardado = ((await cookies()).get(COOKIE_TEMA)?.value ?? TEMA_POR_DEFECTO) as Tema
  const iniciales = perfil.nombre.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()

  return (
    <ProveedorConfirmacion>
    <div className="min-h-screen md:flex">
      {!debeCambiarClave && <RefrescoEnVivo />}
      {!debeCambiarClave && <PaletaComandos permisos={permisos} superadmin={superadmin} />}

      {/* Menú lateral (blanco, estilo TailAdmin) */}
      <aside className="border-b border-lateral-borde bg-lateral p-4 md:fixed md:inset-y-0 md:flex md:w-[270px] md:flex-col md:overflow-y-auto md:border-r md:border-b-0 md:px-5 md:py-6">
        {/* Logo oficial UPeU */}
        <div className="mb-4 px-2 md:mb-8">
          <LogoUpeu className="h-11" />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-dorado-50 px-2.5 py-0.5 font-semibold text-dorado-700">CRM Admisión</span>
            <span className="text-lateral-suave">Juliaca · {etiquetaRol(sesion)}</span>
          </div>
        </div>
        {!debeCambiarClave && <Navegacion permisos={permisos} superadmin={superadmin} sinResponder={sinResponder ?? 0} pendientes={pendientes} revisionBot={revisionBot} />}
      </aside>

      <div className="min-w-0 flex-1 md:ml-[270px]">
        {/* Barra superior: buscador, avisos, tema y usuario */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-superficie/95 px-4 backdrop-blur md:px-8">
          <div className="min-w-0 flex-1">{!debeCambiarClave && <BotonBuscar />}</div>
          {!debeCambiarClave && <AvisosEscritorio />}
          <SelectorTema inicial={temaGuardado} />
          <div className="ml-1 flex items-center gap-3 border-l border-slate-200 pl-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-50 text-sm font-semibold text-marca-600">
              {iniciales}
            </div>
            <div className="hidden min-w-0 leading-tight lg:block">
              <p className="truncate text-sm font-medium text-slate-800">{perfil.nombre}</p>
              <p className="truncate text-xs text-slate-500">{perfil.usuario}</p>
            </div>
            <form action={cerrarSesion}>
              <button title="Cerrar sesión" aria-label="Cerrar sesión" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-rose-600">
                ⏻
              </button>
            </form>
          </div>
        </header>

        <main className="p-4 md:p-8">
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
    </div>
    </ProveedorConfirmacion>
  )
}
