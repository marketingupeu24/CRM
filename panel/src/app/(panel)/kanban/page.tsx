import type { Metadata } from 'next'
import Link from 'next/link'
import { ESTADOS_LEAD, type LeadEstado } from '@crm/db'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { TableroKanban, type TarjetaLead } from './TableroKanban'

export const metadata: Metadata = { title: 'Kanban' }

// Las etapas de atención del bot solo se muestran si se piden: el tablero es para el trabajo del asesor
const ESTADOS_BOT: LeadEstado[] = ['lead_nuevo', 'lead_en_conversacion', 'lead_no_interesado']
const LIMITE = 500

export default async function PaginaKanban(props: PageProps<'/kanban'>) {
  const sp = await props.searchParams
  const verTodos = sp.todos === '1'
  const asesor = typeof sp.asesor === 'string' ? sp.asesor : ''
  const convocatoria = typeof sp.convocatoria === 'string' ? sp.convocatoria : ''

  const { esAdmin } = await obtenerSesion()
  const supabase = await crearClienteServidor()
  const estados = verTodos ? ESTADOS_LEAD : ESTADOS_LEAD.filter((e) => !ESTADOS_BOT.includes(e))

  let consulta = supabase
    .from('leads')
    .select('id, nombre, telefono, carrera_interes, modalidad, programa, estado, updated_at, asesor:asesores!leads_asesor_id_fkey(nombre)')
    .in('estado', [...estados])
  if (esAdmin && asesor) consulta = consulta.eq('asesor_id', asesor)
  if (convocatoria) consulta = consulta.eq('convocatoria', convocatoria)

  const [{ data, error }, { data: asesores }] = await Promise.all([
    consulta.order('updated_at', { ascending: false }).limit(LIMITE),
    esAdmin
      ? supabase.from('asesores').select('id, nombre').eq('rol', 'asesor').order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])

  const leads: TarjetaLead[] = (data ?? []).map(({ asesor: a, ...l }) => ({ ...l, asesor: a?.nombre ?? null }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Kanban</h1>
          <p className="text-sm text-slate-500">Arrastra las tarjetas para cambiar el estado del lead.</p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          {esAdmin && (
            <select name="asesor" defaultValue={asesor} className="campo w-auto" aria-label="Asesor">
              <option value="">Todos los asesores</option>
              {(asesores ?? []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          )}
          <input name="convocatoria" defaultValue={convocatoria} placeholder="Convocatoria" className="campo w-36" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="todos" value="1" defaultChecked={verTodos} /> Incluir etapas del bot
          </label>
          <button className="boton-secundario">Aplicar</button>
          {(asesor || convocatoria || verTodos) && <Link href="/kanban" className="text-sm text-slate-500 hover:underline">Limpiar</Link>}
        </form>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">Error cargando leads: {error.message}</p>}
      {leads.length === LIMITE && (
        <p className="text-xs text-amber-700">Se muestran los {LIMITE} leads movidos más recientemente. Usa los filtros para acotar.</p>
      )}

      <TableroKanban leads={leads} estados={estados} mostrarAsesor={esAdmin} ahora={Date.now()} />
    </div>
  )
}
