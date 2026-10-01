import type { Metadata } from 'next'
import Link from 'next/link'
import { ETIQUETAS_ESTADO, type LeadEstado } from '@crm/db'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import {
  BarrasHorizontales, BarrasPorAsesor, ColumnasPorPeriodo, Embudo, Tarjeta, type FilaAsesor,
} from './Graficos'
import { num, pct } from '@/lib/formato'

export const metadata: Metadata = { title: 'Dashboard' }

interface Resumen {
  total: number
  interesados: number
  asignados: number
  contactados: number
  matriculados: number
  no_interesados: number
  perdidos: number
  por_estado: { estado: LeadEstado; total: number }[]
  por_carrera: { carrera: string; total: number; interesados: number; matriculados: number }[]
  por_asesor: (FilaAsesor & { asesor_id: string })[]
  por_periodo: { periodo: string; total: number }[]
  por_motivo: { motivo: string; total: number }[]
  unidad_periodo: 'dia' | 'semana'
  desde: string
  hasta: string
}

const MAX_CARRERAS = 10
const FECHA = /^\d{4}-\d{2}-\d{2}$/

function hoyLima(desplazarDias = 0): string {
  const d = new Date(Date.now() + desplazarDias * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d)
}

function Indicador({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="tarjeta p-5">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-slate-500">{detalle}</p>}
    </div>
  )
}

export default async function PaginaDashboard(props: PageProps<'/dashboard'>) {
  const sp = await props.searchParams
  const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v.trim() : '')
  const desde = FECHA.test(texto(sp.desde)) ? texto(sp.desde) : ''
  const hasta = FECHA.test(texto(sp.hasta)) ? texto(sp.hasta) : ''
  const convocatoria = texto(sp.convocatoria)
  const asesor = texto(sp.asesor)

  const { esAdmin } = await obtenerSesion()
  const supabase = await crearClienteServidor()

  const [{ data, error }, { data: convocatorias }, { data: asesores }] = await Promise.all([
    supabase.rpc('resumen_dashboard', {
      p_desde: desde || undefined,
      p_hasta: hasta || undefined,
      p_convocatoria: convocatoria || undefined,
      p_asesor_id: esAdmin && /^[0-9a-f-]{36}$/i.test(asesor) ? asesor : undefined,
    }),
    supabase.from('leads').select('convocatoria').not('convocatoria', 'is', null).limit(2000),
    esAdmin
      ? supabase.from('asesores').select('id, nombre').eq('rol', 'asesor').order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])

  if (error || !data) {
    return <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">No se pudo cargar el dashboard: {error?.message}</p>
  }
  const r = data as unknown as Resumen

  // Carreras: las 10 con más leads; el resto se agrupa en "Otras"
  const carreras = r.por_carrera.slice(0, MAX_CARRERAS)
  const resto = r.por_carrera.slice(MAX_CARRERAS)
  if (resto.length) {
    carreras.push({
      carrera: `Otras (${resto.length})`,
      total: resto.reduce((s, c) => s + c.total, 0),
      interesados: resto.reduce((s, c) => s + c.interesados, 0),
      matriculados: resto.reduce((s, c) => s + c.matriculados, 0),
    })
  }

  const filtrosActuales = new URLSearchParams(Object.entries({ convocatoria, asesor }).filter(([, v]) => v))
  const rango = (d: string, h: string) => {
    const p = new URLSearchParams(filtrosActuales)
    if (d) p.set('desde', d)
    if (h) p.set('hasta', h)
    return `/dashboard?${p.toString()}` as `/dashboard?${string}`
  }
  const rangosRapidos = [
    { texto: '7 días', desde: hoyLima(-6), hasta: hoyLima() },
    { texto: '30 días', desde: hoyLima(-29), hasta: hoyLima() },
    { texto: 'Este año', desde: `${hoyLima().slice(0, 4)}-01-01`, hasta: hoyLima() },
    { texto: 'Todo', desde: '', hasta: '' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {esAdmin ? 'Todos los leads' : 'Tus leads'} · {desde || hasta ? `del ${desde || r.desde} al ${hasta || r.hasta}` : 'todo el periodo'}
        </p>
      </div>

      {/* Filtros en una sola fila, encima de los gráficos */}
      <div className="tarjeta flex flex-wrap items-center gap-3 p-3">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          {rangosRapidos.map((q) => {
            const activo = q.desde === desde && q.hasta === hasta
            return (
              <Link
                key={q.texto} href={rango(q.desde, q.hasta)}
                className={`border-r border-slate-300 px-3 py-1.5 last:border-r-0 ${activo ? 'bg-marca-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {q.texto}
              </Link>
            )
          })}
        </div>
        <form className="flex flex-1 flex-wrap items-center gap-2">
          <input type="date" name="desde" defaultValue={desde} aria-label="Desde" className="campo w-auto" />
          <span className="text-sm text-slate-400">a</span>
          <input type="date" name="hasta" defaultValue={hasta} aria-label="Hasta" className="campo w-auto" />
          <select name="convocatoria" defaultValue={convocatoria} aria-label="Convocatoria" className="campo w-auto">
            <option value="">Todas las convocatorias</option>
            {[...new Set((convocatorias ?? []).map((c) => c.convocatoria!))].sort().reverse().map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {esAdmin && (
            <select name="asesor" defaultValue={asesor} aria-label="Asesor" className="campo w-auto">
              <option value="">Todos los asesores</option>
              {(asesores ?? []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          )}
          <button className="boton-secundario">Aplicar</button>
          {(desde || hasta || convocatoria || asesor) && (
            <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">Limpiar</Link>
          )}
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Total de leads" valor={num(r.total)} detalle={`${num(r.no_interesados)} no interesados`} />
        <Indicador titulo="Leads interesados" valor={num(r.interesados)} detalle={`${pct(r.interesados, r.total)} del total`} />
        <Indicador titulo="Matriculados" valor={num(r.matriculados)} detalle={`${pct(r.matriculados, r.interesados)} de los interesados`} />
        <Indicador titulo="Conversión global" valor={pct(r.matriculados, r.total)} detalle="lead → matriculado" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Tarjeta titulo="Embudo de conversión" descripcion="Lead → interesado → contactado → matriculado">
          <Embudo etapas={[
            { etiqueta: 'Leads', valor: r.total },
            { etiqueta: 'Interesados', valor: r.interesados },
            { etiqueta: 'Contactados o más', valor: r.contactados },
            { etiqueta: 'Matriculados', valor: r.matriculados },
          ]} />
        </Tarjeta>

        <Tarjeta titulo="Leads por estado" descripcion="En orden del embudo">
          <BarrasHorizontales
            total={r.total}
            filas={r.por_estado.map((e) => ({ etiqueta: ETIQUETAS_ESTADO[e.estado], valor: e.total }))}
          />
        </Tarjeta>

        <Tarjeta titulo={r.unidad_periodo === 'semana' ? 'Leads nuevos por semana' : 'Leads nuevos por día'}>
          <ColumnasPorPeriodo puntos={r.por_periodo} unidad={r.unidad_periodo} />
        </Tarjeta>

        <Tarjeta titulo="Leads por carrera" descripcion={resto.length ? `Las ${MAX_CARRERAS} con más leads` : undefined}>
          <BarrasHorizontales
            total={r.total}
            filas={carreras.map((c) => ({
              etiqueta: c.carrera,
              valor: c.total,
              detalle: <p className="text-slate-300">Interesados: {num(c.interesados)} · Matriculados: {num(c.matriculados)}</p>,
            }))}
          />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Motivos de pérdida" descripcion="Leads perdidos o no interesados, según el motivo registrado">
        <BarrasHorizontales
          total={r.por_motivo.reduce((s, m) => s + m.total, 0)}
          filas={r.por_motivo.map((m) => ({ etiqueta: m.motivo, valor: m.total }))}
        />
      </Tarjeta>

      <Tarjeta titulo="Leads por asesor" descripcion={esAdmin ? 'Estado actual de los leads asignados a cada asesor' : 'Estado actual de tus leads'}>
        <BarrasPorAsesor filas={r.por_asesor} />
      </Tarjeta>
    </div>
  )
}
