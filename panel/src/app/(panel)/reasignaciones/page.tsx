import type { Metadata } from 'next'
import Link from 'next/link'
import { ETIQUETAS_ESTADO, type LeadEstado } from '@crm/db'
import { BotonCsv } from '@/components/BotonCsv'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { duracion, fechaHora, num } from '@/lib/formato'
import { parametro } from '@/lib/texto'
import { BarrasHorizontales, Tarjeta } from '../dashboard/Graficos'

export const metadata: Metadata = { title: 'Historial de reasignaciones' }

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const MAXIMO = 5000
const VISIBLES = 300

// Filtro por motivo: prefijo del texto guardado en movimientos_lead.motivo
const MOTIVOS = [
  ['no_contactado', 'No contactado a tiempo', 'No contactado%'],
  ['manual', 'Cambio manual', 'Cambio manual%'],
  ['reparto', 'Reparto parejo', 'Reparto%'],
  ['automatico', 'Automático (nueva consulta o asesor inactivo)', 'Automático%'],
  ['devuelto', 'Devuelto', 'Devuelto%'],
] as const

interface Resumen { nombre: string; salieron: number; noContacto: number; recibio: number; minutos: number[] }

const mediana = (v: number[]) => {
  if (!v.length) return null
  const o = [...v].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2
}

/** De qué asesor a cuál pasó cada lead: para ver quiénes no contactan a tiempo y adónde se van sus leads. */
export default async function Reasignaciones(props: PageProps<'/reasignaciones'>) {
  const sp = await props.searchParams
  const { puede } = await exigirPermiso('dashboard')
  const todos = puede('dashboard_todos') || puede('ver_todos')
  const desde = FECHA.test(parametro(sp.desde)) ? parametro(sp.desde) : ''
  const hasta = FECHA.test(parametro(sp.hasta)) ? parametro(sp.hasta) : ''
  const asesor = /^[0-9a-f-]{36}$/i.test(parametro(sp.asesor)) ? parametro(sp.asesor) : ''
  const motivo = MOTIVOS.find((m) => m[0] === parametro(sp.motivo))

  const supabase = await crearClienteServidor()
  let consulta = supabase.from('movimientos_lead')
    .select('id, lead_id, de_asesor_id, a_asesor_id, de_nombre, a_nombre, motivo, por_asesor_id, tuvo_desde, created_at, lead:leads(nombre, estado)')
    .order('created_at', { ascending: false }).limit(MAXIMO)
  if (desde) consulta = consulta.gte('created_at', `${desde}T00:00:00-05:00`)
  if (hasta) consulta = consulta.lte('created_at', `${hasta}T23:59:59.999-05:00`)
  if (asesor) consulta = consulta.or(`de_asesor_id.eq.${asesor},a_asesor_id.eq.${asesor}`)
  if (motivo) consulta = consulta.like('motivo', motivo[2])
  const [{ data, error }, { data: asesores }] = await Promise.all([
    consulta,
    supabase.from('asesores').select('id, nombre').order('nombre'),
  ])
  const filas = data ?? []
  const nombres = new Map((asesores ?? []).map((a) => [a.id, a.nombre]))
  const nombreDe = (id: string | null, guardado: string | null) => (id && nombres.get(id)) || guardado || '—'

  // Resumen por asesor: cuántos le salieron (y cuántos por no contactar), cuántos recibió y cuánto los tuvo
  const resumen = new Map<string, Resumen>()
  const fila = (n: string) => resumen.get(n) ?? resumen.set(n, { nombre: n, salieron: 0, noContacto: 0, recibio: 0, minutos: [] }).get(n)!
  for (const m of filas) {
    if (m.de_asesor_id || m.de_nombre) {
      const r = fila(nombreDe(m.de_asesor_id, m.de_nombre))
      r.salieron++
      if (m.motivo.startsWith('No contactado')) r.noContacto++
      if (m.tuvo_desde) r.minutos.push((Date.parse(m.created_at) - Date.parse(m.tuvo_desde)) / 60_000)
    }
    if (m.a_asesor_id || m.a_nombre) fila(nombreDe(m.a_asesor_id, m.a_nombre)).recibio++
  }
  const porAsesor = [...resumen.values()].filter((r) => r.nombre !== '—').sort((a, b) => b.noContacto - a.noContacto || b.salieron - a.salieron)
  const totalNoContacto = porAsesor.reduce((s, r) => s + r.noContacto, 0)

  const csv = [
    ['Fecha', 'Lead', 'De', 'A', 'Motivo', 'Lo tuvo', 'Cambiado por', 'Estado actual del lead'],
    ...filas.map((m) => [
      fechaHora(m.created_at), m.lead?.nombre ?? '', nombreDe(m.de_asesor_id, m.de_nombre), nombreDe(m.a_asesor_id, m.a_nombre), m.motivo,
      m.tuvo_desde ? duracion((Date.parse(m.created_at) - Date.parse(m.tuvo_desde)) / 60_000) : '',
      m.por_asesor_id ? nombreDe(m.por_asesor_id, null) : 'Sistema', m.lead ? ETIQUETAS_ESTADO[m.lead.estado as LeadEstado] ?? m.lead.estado : '',
    ]),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Historial de reasignaciones</h1>
          <p className="text-sm text-slate-500">
            De qué asesor a cuál pasó cada lead y por qué{todos ? '' : ' (solo los que te salieron o te llegaron)'} · {num(filas.length)} {filas.length === 1 ? 'movimiento' : 'movimientos'}
            {filas.length === MAXIMO ? ` (los ${num(MAXIMO)} más recientes: acota las fechas)` : ''}
          </p>
        </div>
        {filas.length > 0 && <BotonCsv filas={csv} nombreArchivo={`reasignaciones-${desde || 'inicio'}-a-${hasta || 'hoy'}`} />}
      </div>

      <form className="tarjeta flex flex-wrap items-center gap-2 p-3">
        <input type="date" name="desde" defaultValue={desde} aria-label="Desde" className="campo w-auto" />
        <span className="text-sm text-slate-400">a</span>
        <input type="date" name="hasta" defaultValue={hasta} aria-label="Hasta" className="campo w-auto" />
        {todos && (
          <select name="asesor" defaultValue={asesor} aria-label="Asesor" className="campo w-auto">
            <option value="">Todos los asesores</option>
            {(asesores ?? []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        )}
        <select name="motivo" defaultValue={motivo?.[0] ?? ''} aria-label="Motivo" className="campo w-auto">
          <option value="">Todos los motivos</option>
          {MOTIVOS.map(([clave, texto]) => <option key={clave} value={clave}>{texto}</option>)}
        </select>
        <button className="boton-secundario">Aplicar</button>
        {(desde || hasta || asesor || motivo) && <Link href="/reasignaciones" className="text-sm text-slate-500 hover:underline">Limpiar</Link>}
      </form>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Tarjeta titulo="Leads que salieron por no contactar a tiempo" descripcion="A quién se le fueron los leads porque no los contactó en el plazo (4 h hábiles)">
          <BarrasHorizontales
            total={totalNoContacto}
            filas={porAsesor.filter((r) => r.noContacto > 0).map((r) => ({ etiqueta: r.nombre, valor: r.noContacto }))}
          />
        </Tarjeta>

        <Tarjeta titulo="Resumen por asesor" descripcion="Salieron: leads que pasaron a otro asesor · Recibió: leads que le llegaron de otro · Lo tuvo: mediana del tiempo con el lead antes de que saliera">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-3">Asesor</th>
                  <th className="px-2 py-2 text-right">Salieron</th>
                  <th className="px-2 py-2 text-right" title="Por no contactar a tiempo">No contactó</th>
                  <th className="px-2 py-2 text-right">Recibió</th>
                  <th className="px-2 py-2 text-right" title="Recibió menos salieron">Balance</th>
                  <th className="px-2 py-2 text-right">Lo tuvo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {porAsesor.map((r) => (
                  <tr key={r.nombre}>
                    <td className="py-2 pr-3">{r.nombre}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(r.salieron)}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${r.noContacto ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{num(r.noContacto)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(r.recibio)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">{r.recibio - r.salieron > 0 ? '+' : ''}{num(r.recibio - r.salieron)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap text-slate-500">{duracion(mediana(r.minutos))}</td>
                  </tr>
                ))}
                {!porAsesor.length && <tr><td colSpan={6} className="py-6 text-center text-slate-400">Sin movimientos para estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Movimientos" descripcion={filas.length > VISIBLES ? `Los ${VISIBLES} más recientes; el CSV trae todos` : 'Del más reciente al más antiguo'}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-3">Fecha</th>
                <th className="px-2 py-2">Lead</th>
                <th className="px-2 py-2">De → A</th>
                <th className="px-2 py-2">Motivo</th>
                <th className="px-2 py-2 text-right">Lo tuvo</th>
                <th className="px-2 py-2">Estado actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.slice(0, VISIBLES).map((m) => (
                <tr key={m.id} className="align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{fechaHora(m.created_at)}</td>
                  <td className="px-2 py-2"><Link href={`/leads/${m.lead_id}`} className="text-marca-700 hover:underline">{m.lead?.nombre || 'Sin nombre'}</Link></td>
                  <td className="px-2 py-2">
                    <span className="text-slate-600">{nombreDe(m.de_asesor_id, m.de_nombre)}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="font-medium">{nombreDe(m.a_asesor_id, m.a_nombre)}</span>
                  </td>
                  <td className="px-2 py-2 text-slate-600">
                    {m.motivo}
                    {m.por_asesor_id && <span className="text-xs text-slate-400"> · por {nombreDe(m.por_asesor_id, null)}</span>}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-slate-500">
                    {m.tuvo_desde ? duracion((Date.parse(m.created_at) - Date.parse(m.tuvo_desde)) / 60_000) : '—'}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-slate-600">{m.lead ? ETIQUETAS_ESTADO[m.lead.estado as LeadEstado] ?? m.lead.estado : '—'}</td>
                </tr>
              ))}
              {!filas.length && <tr><td colSpan={6} className="py-6 text-center text-slate-400">Sin movimientos para estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  )
}
