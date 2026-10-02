import type { Metadata } from 'next'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { fechaHora } from '@/lib/formato'
import { AccionesAsesor, FormularioNuevoAsesor } from './Formularios'

export const metadata: Metadata = { title: 'Asesores y usuarios' }

export default async function PaginaUsuarios() {
  const { perfil, superadmin } = await exigirPermiso('usuarios')
  const supabase = await crearClienteServidor()
  const { data: asesores, error } = await supabase.from('asesores').select('*').is('eliminado_at', null).order('rol').order('nombre')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Asesores y usuarios</h1>
        <p className="text-sm text-slate-500">
          Los asesores sin carreras exclusivas entran en la rotación general de leads. Los que tienen <b>CEPRE</b> reciben los leads de CePre.
          {superadmin ? <> Lo que cada uno puede ver se define en <a href="/permisos" className="font-medium text-marca-700 hover:underline">Módulos y permisos</a>.</> : null}
        </p>
      </div>

      <section className="tarjeta p-6">
        <h2 className="mb-4 font-semibold">Agregar asesor</h2>
        <FormularioNuevoAsesor />
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <div className="tarjeta overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Asesor</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Reparto</th>
              <th className="px-4 py-3">Último lead</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {(asesores ?? []).map((a) => (
              <tr key={a.id} className={a.activo ? '' : 'bg-slate-50 text-slate-400'}>
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {a.nombre}
                    {a.superadmin
                      ? <span className="ml-2 rounded-full bg-dorado-50 px-2 py-0.5 text-xs font-semibold text-dorado-700">Super admin</span>
                      : a.rol === 'admin' && <span className="ml-2 rounded bg-marca-100 px-1.5 py-0.5 text-xs text-marca-700">Admin</span>}
                    {!a.activo && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Inactivo</span>}
                  </p>
                  <p className="text-xs text-slate-500">{a.telefono ?? 'Sin celular'}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {a.usuario ?? <span className="font-sans text-amber-700">Sin usuario</span>}
                </td>
                <td className="px-4 py-3 text-xs">
                  {a.rol === 'admin' ? '—' : a.carreras.length ? a.carreras.join(', ') : 'Rotación general'}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">{fechaHora(a.ultimo_lead_asignado)}</td>
                <td className="w-72 px-4 py-3">
                  {a.superadmin && !superadmin
                    ? <span className="text-xs text-slate-500">Solo otro super admin puede modificarlo.</span>
                    : <AccionesAsesor asesor={a} esYo={a.id === perfil.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
