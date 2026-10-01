import type { Metadata } from 'next'
import { FormularioLogin } from './FormularioLogin'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function PaginaLogin(props: PageProps<'/login'>) {
  const { error } = await props.searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marca-800 to-marca-600 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-superficie p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-marca-600 text-xl font-bold text-white">
            A
          </div>
          <h1 className="text-xl font-semibold">CRM de Admisión</h1>
          <p className="mt-1 text-sm text-slate-500">Ingresa con tu usuario del panel</p>
        </div>
        {error === 'sin_perfil' && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Tu usuario no está vinculado a un asesor. Contacta al administrador.
          </p>
        )}
        {error === 'eliminado' && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Tu usuario fue dado de baja. Si es un error, contacta al administrador.
          </p>
        )}
        <FormularioLogin />
      </div>
    </main>
  )
}
