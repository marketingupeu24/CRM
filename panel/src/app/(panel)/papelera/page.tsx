import type { Metadata } from 'next'
import { ETIQUETAS_ESTADO, type LeadEstado } from '@crm/db'
import { fechaHora, haceCuanto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { AccionesLeads, AccionesUsuario } from './Controles'

export const metadata: Metadata = { title: 'Papelera' }

interface LeadPapelera {
  id: string
  nombre: string | null
  telefono: string
  dni: string | null
  estado: LeadEstado
  carrera: string | null
  asesor: string | null
  eliminado_at: string
  eliminado_por: string | null
  ultimo_contacto: string
  escribio_despues: boolean
}

interface UsuarioPapelera {
  id: string
  nombre: string
  telefono: string | null
  usuario: string | null
  rol: string
  eliminado_at: string
  leads: number
}

export default async function PaginaPapelera() {
  const { puede } = await exigirPermiso('papelera')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('papelera')
  const { leads = [], asesores = [] } = (data ?? {}) as unknown as { leads?: LeadPapelera[]; asesores?: UsuarioPapelera[] }
  const ahora = Date.now()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Papelera</h1>
        <p className="text-sm text-slate-500">
          Leads y usuarios eliminados. No aparecen en el panel, en el dashboard ni en el Excel, y no generan avisos.
          Puedes restaurarlos o borrarlos para siempre.
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <section className="tarjeta overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Leads <span className="text-sm font-normal text-slate-500">({leads.length})</span></h2>
          {leads.length > 1 && <AccionesLeads ids={leads.map((l) => l.id)} texto={`los ${leads.length} leads`} />}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Estado / asesor</th>
                <th className="px-4 py-3">Eliminado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {leads.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.nombre ?? 'Sin nombre'}</p>
                    <p className="text-xs text-slate-500">{l.telefono}{l.dni ? ` · DNI ${l.dni}` : ''}{l.carrera ? ` · ${l.carrera}` : ''}</p>
                    {l.escribio_despues && (
                      <p className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        ✉ Volvió a escribir {haceCuanto(l.ultimo_contacto, ahora)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {ETIQUETAS_ESTADO[l.estado]}<br /><span className="text-slate-500">{l.asesor ?? 'Sin asesor'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {fechaHora(l.eliminado_at)}<br /><span className="text-slate-500">{l.eliminado_por ? `por ${l.eliminado_por}` : ''}</span>
                  </td>
                  <td className="px-4 py-3"><AccionesLeads ids={[l.id]} texto="este lead" compacto /></td>
                </tr>
              ))}
              {!leads.length && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No hay leads en la papelera.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {puede('usuarios') && <section className="tarjeta overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Usuarios <span className="text-sm font-normal text-slate-500">({asesores.length})</span></h2>
          <p className="text-xs text-slate-500">
            Un usuario en la papelera no puede entrar al panel ni recibe leads. Para borrarlo para siempre no debe tener leads a su nombre.
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {asesores.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">
                  {a.nombre}
                  {a.rol === 'admin' && <span className="ml-2 rounded bg-marca-100 px-1.5 py-0.5 text-xs text-marca-700">Admin</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {a.usuario ?? 'Sin usuario'} · {a.telefono ?? 'Sin celular'} · {a.leads} {a.leads === 1 ? 'lead' : 'leads'} a su nombre · eliminado {fechaHora(a.eliminado_at)}
                </p>
              </div>
              <AccionesUsuario id={a.id} nombre={a.nombre} />
            </li>
          ))}
          {!asesores.length && <li className="px-5 py-10 text-center text-sm text-slate-500">No hay usuarios en la papelera.</li>}
        </ul>
      </section>}
    </div>
  )
}
