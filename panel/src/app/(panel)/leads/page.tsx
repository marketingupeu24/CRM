import type { Metadata } from 'next'
import Link from 'next/link'
import { ESTADOS_LEAD, ETIQUETAS_ESTADO, ETIQUETAS_FUENTE, type Fuente, type LeadEstado } from '@crm/db'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { fechaHora, haceCuanto } from '@/lib/formato'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Leads' }

const POR_PAGINA = 50

function parametro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? ''
}

export default async function PaginaLeads(props: PageProps<'/leads'>) {
  const sp = await props.searchParams
  const filtros = {
    q: parametro(sp.q),
    estado: parametro(sp.estado),
    carrera: parametro(sp.carrera),
    convocatoria: parametro(sp.convocatoria),
    asesor: parametro(sp.asesor),
    desde: parametro(sp.desde),
    hasta: parametro(sp.hasta),
  }
  const pagina = Math.max(1, Number.parseInt(parametro(sp.pagina) || '1', 10) || 1)

  const { esAdmin } = await obtenerSesion()
  const supabase = await crearClienteServidor()

  let consulta = supabase
    .from('leads')
    .select('id, nombre, telefono, dni, carrera_interes, modalidad, programa, convocatoria, estado, origen, created_at, ultimo_contacto, sin_responder, asesor:asesores!leads_asesor_id_fkey(nombre)', { count: 'exact' })

  if (filtros.q) {
    // Quita caracteres que alteran la sintaxis del filtro de PostgREST
    const q = filtros.q.replace(/[,()*%\\]/g, ' ').trim()
    if (q) consulta = consulta.or(`nombre.ilike.*${q}*,telefono.ilike.*${q}*,dni.ilike.*${q}*`)
  }
  if (ESTADOS_LEAD.includes(filtros.estado as LeadEstado)) consulta = consulta.eq('estado', filtros.estado as LeadEstado)
  if (filtros.carrera === 'Sin carrera') consulta = consulta.is('carrera_interes', null)
  else if (filtros.carrera) consulta = consulta.eq('carrera_interes', filtros.carrera)
  if (filtros.convocatoria) consulta = consulta.eq('convocatoria', filtros.convocatoria)
  if (esAdmin && filtros.asesor === 'sin_asesor') consulta = consulta.is('asesor_id', null)
  else if (esAdmin && filtros.asesor) consulta = consulta.eq('asesor_id', filtros.asesor)
  // Fechas en hora de Lima (UTC-5)
  if (/^\d{4}-\d{2}-\d{2}$/.test(filtros.desde)) consulta = consulta.gte('created_at', `${filtros.desde}T00:00:00-05:00`)
  if (/^\d{4}-\d{2}-\d{2}$/.test(filtros.hasta)) consulta = consulta.lte('created_at', `${filtros.hasta}T23:59:59.999-05:00`)

  const desde = (pagina - 1) * POR_PAGINA
  const [{ data: leads, count, error }, { data: carreras }, { data: convocatorias }, { data: asesores }] = await Promise.all([
    consulta.order('created_at', { ascending: false }).range(desde, desde + POR_PAGINA - 1),
    supabase.from('vista_leads_por_carrera').select('carrera'),
    supabase.from('leads').select('convocatoria').not('convocatoria', 'is', null).limit(2000),
    esAdmin
      ? supabase.from('asesores').select('id, nombre').eq('rol', 'asesor').order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])

  const listaConvocatorias = [...new Set((convocatorias ?? []).map((c) => c.convocatoria!))].sort().reverse()
  const total = count ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const hayFiltros = Object.values(filtros).some(Boolean)

  const enlacePagina = (n: number) => {
    const p = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v))
    if (n > 1) p.set('pagina', String(n))
    return `/leads?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-slate-500">
            {esAdmin ? 'Todos los leads' : 'Tus leads asignados'} · {total} {total === 1 ? 'resultado' : 'resultados'}
          </p>
        </div>
        <Link href="/leads/nuevo" className="boton">+ Registrar lead</Link>
      </div>

      <form className="tarjeta grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input name="q" defaultValue={filtros.q} placeholder="Buscar nombre, celular o DNI" className="campo sm:col-span-2" />
        <select name="estado" defaultValue={filtros.estado} className="campo" aria-label="Estado">
          <option value="">Todos los estados</option>
          {ESTADOS_LEAD.map((e) => <option key={e} value={e}>{ETIQUETAS_ESTADO[e]}</option>)}
        </select>
        <select name="carrera" defaultValue={filtros.carrera} className="campo" aria-label="Carrera">
          <option value="">Todas las carreras</option>
          {(carreras ?? []).map((c) => <option key={c.carrera} value={c.carrera!}>{c.carrera}</option>)}
        </select>
        <select name="convocatoria" defaultValue={filtros.convocatoria} className="campo" aria-label="Convocatoria">
          <option value="">Todas las convocatorias</option>
          {listaConvocatorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {esAdmin && (
          <select name="asesor" defaultValue={filtros.asesor} className="campo" aria-label="Asesor">
            <option value="">Todos los asesores</option>
            <option value="sin_asesor">Sin asesor</option>
            {(asesores ?? []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Desde <input type="date" name="desde" defaultValue={filtros.desde} className="campo" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Hasta <input type="date" name="hasta" defaultValue={filtros.hasta} className="campo" />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4 lg:justify-end">
          {hayFiltros && <Link href="/leads" className="boton-secundario">Limpiar</Link>}
          <button className="boton">Filtrar</button>
        </div>
      </form>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">Error cargando leads: {error.message}</p>}

      <div className="tarjeta overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Interés</th>
              <th className="px-4 py-3">Convocatoria</th>
              <th className="px-4 py-3">Estado</th>
              {esAdmin && <th className="px-4 py-3">Asesor</th>}
              <th className="px-4 py-3">Fuente</th>
              <th className="px-4 py-3">Registrado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(leads ?? []).map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/leads/${l.id}`} className="font-medium text-marca-700 hover:underline">
                    {l.nombre ?? 'Sin nombre'}
                  </Link>
                  {l.sin_responder && (
                    <Link href={`/leads/${l.id}#chat`} className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">✉ Sin responder</Link>
                  )}
                  <p className="text-xs text-slate-500">
                    {l.telefono}{l.dni ? ` · DNI ${l.dni}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {l.programa === 'cepre' && <span className="mr-1 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">CePre</span>}
                  {l.carrera_interes ?? l.modalidad ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3">{l.convocatoria ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-3"><InsigniaEstado estado={l.estado} /></td>
                {esAdmin && <td className="px-4 py-3">{l.asesor?.nombre ?? <span className="text-slate-400">Sin asesor</span>}</td>}
                <td className="px-4 py-3 text-slate-600">{ETIQUETAS_FUENTE[l.origen as Fuente] ?? l.origen}</td>
                <td className="px-4 py-3 whitespace-nowrap" title={fechaHora(l.created_at)}>
                  {haceCuanto(l.created_at)}
                </td>
              </tr>
            ))}
            {!leads?.length && (
              <tr>
                <td colSpan={esAdmin ? 7 : 6} className="px-4 py-12 text-center text-slate-500">
                  {hayFiltros ? 'No hay leads con estos filtros.' : 'Todavía no hay leads.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <nav className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Página {pagina} de {paginas}</span>
          <div className="flex gap-2">
            {pagina > 1 && <Link href={enlacePagina(pagina - 1) as `/leads?${string}`} className="boton-secundario">← Anterior</Link>}
            {pagina < paginas && <Link href={enlacePagina(pagina + 1) as `/leads?${string}`} className="boton-secundario">Siguiente →</Link>}
          </div>
        </nav>
      )}
    </div>
  )
}
