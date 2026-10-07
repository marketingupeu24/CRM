import type { Metadata } from 'next'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { fechaHora } from '@/lib/formato'
import { Ausencia } from '@/components/Ausencia'
import { AccionesAsesor, FormularioNuevoAsesor, InterruptorRecibe } from './Formularios'

export const metadata: Metadata = { title: 'Asesores y usuarios' }

export default async function PaginaUsuarios() {
  const { perfil, superadmin } = await exigirPermiso('usuarios')
  const supabase = await crearClienteServidor()
  const [{ data: asesores, error }, { data: reemplazos }] = await Promise.all([
    supabase.from('asesores').select('*').is('eliminado_at', null).order('rol').order('nombre'),
    supabase.rpc('posibles_reemplazos'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Asesores y usuarios</h1>
        <p className="text-sm text-slate-500">
          Con <b>Recibe leads</b> activado (asesor, administrador o super admin) entra al reparto por turnos, puede ser responsable de una actividad y le llegan los avisos por WhatsApp.
          Sin carreras exclusivas entra en la rotación general; con <b>CEPRE</b> recibe los leads de CePre.
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
              <th className="px-4 py-3">Recibe leads</th>
              <th className="px-4 py-3">Último lead</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {(asesores ?? []).map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {a.nombre}
                    {a.superadmin
                      ? <span className="ml-2 rounded-full bg-dorado-50 px-2 py-0.5 text-xs font-semibold text-dorado-700">Super admin</span>
                      : a.rol === 'admin' && <span className="ml-2 rounded bg-marca-100 px-1.5 py-0.5 text-xs text-marca-700">Admin</span>}
                  </p>
                  <p className="text-xs text-slate-500">{a.telefono ?? 'Sin celular'}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {a.usuario ?? <span className="font-sans text-amber-700">Sin usuario</span>}
                </td>
                <td className="px-4 py-3 text-xs">
                  <InterruptorRecibe asesor={a} editable={!a.superadmin || superadmin} />
                  {a.activo && <p className="mt-1 text-slate-500">{a.carreras.length ? a.carreras.join(', ') : 'Rotación general'}</p>}
                  {a.user_id && (!a.superadmin || superadmin) && (
                    <div className="mt-2 w-64"><Ausencia asesor={a} reemplazos={reemplazos ?? []} compacto /></div>
                  )}
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
