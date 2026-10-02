import type { Metadata } from 'next'
import { MODULOS } from '@crm/db'
import { exigirSuperadmin } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { EditorPermisos, type UsuarioPermisos } from './EditorPermisos'

export const metadata: Metadata = { title: 'Módulos y permisos' }

export default async function PaginaPermisos() {
  const { perfil } = await exigirSuperadmin()
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('asesores')
    .select('id, nombre, usuario, rol, activo, superadmin, permisos')
    .is('eliminado_at', null)
    .order('superadmin', { ascending: false }).order('activo', { ascending: false }).order('nombre')
  const usuarios = (data ?? []) as UsuarioPermisos[]
  const grupos = [...new Set(MODULOS.map((m) => m.grupo))]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Módulos y permisos</h1>
        <p className="text-sm text-slate-500">
          Elige qué puede ver y hacer cada usuario. El menú, las páginas y la base de datos respetan estos permisos.
          Solo el super admin entra aquí.
        </p>
      </div>

      <section className="tarjeta grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {grupos.map((g) => (
          <div key={g}>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{g}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {MODULOS.filter((m) => m.grupo === g).map((m) => <li key={m.clave}>{m.titulo}</li>)}
            </ul>
          </div>
        ))}
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <ul className="space-y-4">
        {usuarios.map((u) => <EditorPermisos key={u.id} usuario={u} esYo={u.id === perfil.id} />)}
      </ul>
    </div>
  )
}
