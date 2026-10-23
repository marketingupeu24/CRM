import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { num, pct } from '@/lib/formato'
import { hoyLima, parametro } from '@/lib/texto'
import { departamentoDe, nombrePais, provinciaDe } from '@/lib/ubigeos'
import { UBIGEOS } from '@/lib/ubigeos-servidor'

export const metadata: Metadata = { title: 'Procedencia de los leads' }

interface FilaRpc { pais: string | null; ubigeo: string | null; total: number; atendidos: number; inscritos: number }
interface Fila { clave: string; etiqueta: string; total: number; atendidos: number; inscritos: number; enlace?: string; leads?: string }

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Suma las filas del reporte agrupándolas por la clave que devuelve `grupo` (null = "Sin dato"). */
function agrupar(filas: FilaRpc[], grupo: (f: FilaRpc) => string | null): Map<string | null, Omit<Fila, 'clave' | 'etiqueta'>> {
  const m = new Map<string | null, Omit<Fila, 'clave' | 'etiqueta'>>()
  for (const f of filas) {
    const k = grupo(f)
    const a = m.get(k) ?? { total: 0, atendidos: 0, inscritos: 0 }
    m.set(k, { total: a.total + Number(f.total), atendidos: a.atendidos + Number(f.atendidos), inscritos: a.inscritos + Number(f.inscritos) })
  }
  return m
}

function Tabla({ titulo, descripcion, filas, total }: { titulo: string; descripcion?: string; filas: Fila[]; total: number }) {
  const max = Math.max(...filas.map((f) => f.total), 1)
  return (
    <section className="tarjeta p-5">
      <h2 className="font-semibold">{titulo}</h2>
      {descripcion && <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>}
      {!filas.length ? (
        <p className="py-8 text-center text-sm text-slate-400">Sin datos para estos filtros.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-3">Lugar</th>
                <th className="py-2 pr-3">Leads</th>
                <th className="px-2 py-2 text-right" title="Contactados, atendidos, inscritos o matriculados">Atendidos</th>
                <th className="px-2 py-2 text-right" title="Inscritos o matriculados">Inscritos</th>
                <th className="py-2 pl-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f) => (
                <tr key={f.clave} className="hover:bg-slate-50">
                  <td className="max-w-[14rem] truncate py-2 pr-3" title={f.etiqueta}>
                    {f.enlace
                      ? <Link href={f.enlace as Route} className="font-medium text-marca-700 hover:underline">{f.etiqueta} ›</Link>
                      : <span className={f.clave === 'sin-dato' ? 'text-slate-500 italic' : ''}>{f.etiqueta}</span>}
                  </td>
                  <td className="w-1/2 py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 rounded-r-[4px]"
                        style={{ width: `${(f.total / max) * 100}%`, minWidth: f.total ? 3 : 0, background: f.clave === 'sin-dato' ? 'var(--color-slate-300)' : 'var(--serie-1)' }}
                      />
                      <span className="text-xs font-medium whitespace-nowrap text-slate-700 tabular-nums">{num(f.total)} <span className="font-normal text-slate-400">· {pct(f.total, total)}</span></span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{num(f.atendidos)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{num(f.inscritos)}</td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap">
                    {f.leads && <Link href={f.leads as Route} className="text-xs text-slate-500 hover:text-marca-700 hover:underline">Ver leads</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default async function PaginaProcedencia(props: PageProps<'/procedencia'>) {
  const sp = await props.searchParams
  const desde = FECHA.test(parametro(sp.desde)) ? parametro(sp.desde) : ''
  const hasta = FECHA.test(parametro(sp.hasta)) ? parametro(sp.hasta) : ''
  const asesor = parametro(sp.asesor)
  const dep = /^\d{2}$/.test(parametro(sp.dep)) ? parametro(sp.dep) : ''
  const prov = /^\d{4}$/.test(parametro(sp.prov)) ? parametro(sp.prov) : ''
  const depActual = prov ? prov.slice(0, 2) : dep

  const { puede } = await exigirPermiso('dashboard')
  const esAdmin = puede('dashboard_todos')
  const supabase = await crearClienteServidor()
  const [{ data, error }, { data: asesores }] = await Promise.all([
    supabase.rpc('procedencia_leads', {
      p_desde: desde ? `${desde}T00:00:00-05:00` : undefined,
      // "hasta" incluye todo ese día
      p_hasta: hasta ? new Date(Date.parse(`${hasta}T00:00:00-05:00`) + 86_400_000).toISOString() : undefined,
      p_asesor: esAdmin && /^[0-9a-f-]{36}$/i.test(asesor) ? asesor : undefined,
    }),
    esAdmin ? supabase.rpc('posibles_reemplazos') : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])
  if (error) return <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">No se pudo cargar la procedencia: {error.message}</p>
  const filas = (data ?? []) as FilaRpc[]

  const filtros = new URLSearchParams(Object.entries({ desde, hasta, asesor }).filter(([, v]) => v))
  const url = (extra: Record<string, string>) => {
    const p = new URLSearchParams(filtros)
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v); else p.delete(k)
    const q = p.toString()
    return `/procedencia${q ? `?${q}` : ''}`
  }
  const rango = (d: string, h: string) => url({ desde: d, hasta: h, dep, prov })
  const rangosRapidos = [
    { texto: '7 días', desde: hoyLima(-6), hasta: hoyLima() },
    { texto: '30 días', desde: hoyLima(-29), hasta: hoyLima() },
    { texto: 'Este año', desde: `${hoyLima().slice(0, 4)}-01-01`, hasta: hoyLima() },
    { texto: 'Todo', desde: '', hasta: '' },
  ]

  const total = filas.reduce((s, f) => s + Number(f.total), 0)
  const peru = filas.filter((f) => f.pais === 'PE')
  const totalPeru = peru.reduce((s, f) => s + Number(f.total), 0)
  const conLugar = peru.filter((f) => f.ubigeo).reduce((s, f) => s + Number(f.total), 0)
  const ordenar = (a: Fila, b: Fila) => (a.clave === 'sin-dato' ? 1 : b.clave === 'sin-dato' ? -1 : b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, 'es'))

  // Países
  const porPais = [...agrupar(filas, (f) => f.pais)].map(([k, v]): Fila => ({
    clave: k ?? 'sin-dato', etiqueta: k ? nombrePais(k) : 'Sin dato (número oculto por WhatsApp)', ...v,
  })).sort(ordenar)

  // Perú: departamentos → provincias → distritos (según lo que se eligió)
  let nivel: { titulo: string; filas: Fila[]; total: number }
  if (prov) {
    const deLaProv = peru.filter((f) => f.ubigeo?.startsWith(prov))
    const filasProv = [...agrupar(deLaProv, (f) => (f.ubigeo!.endsWith('00') ? null : f.ubigeo))].map(([k, v]): Fila => ({
      clave: k ?? 'sin-dato', etiqueta: k ? (UBIGEOS.get(k) ?? k) : 'Solo la provincia (sin distrito)', ...v,
      leads: k ? `/leads?ubigeo=${k}` : undefined,
    })).sort(ordenar)
    nivel = { titulo: `Distritos de ${UBIGEOS.get(`${prov}00`) ?? prov}`, filas: filasProv, total: deLaProv.reduce((s, f) => s + Number(f.total), 0) }
  } else if (dep) {
    const delDep = peru.filter((f) => f.ubigeo?.startsWith(dep))
    const filasDep = [...agrupar(delDep, (f) => (f.ubigeo!.endsWith('0000') ? null : provinciaDe(f.ubigeo!)))].map(([k, v]): Fila => ({
      clave: k ?? 'sin-dato', etiqueta: k ? (UBIGEOS.get(k) ?? k) : 'Solo el departamento (sin provincia)', ...v,
      enlace: k ? url({ dep: '', prov: k.slice(0, 4) }) : undefined, leads: k ? `/leads?ubigeo=${k.slice(0, 4)}` : undefined,
    })).sort(ordenar)
    nivel = { titulo: `Provincias de ${UBIGEOS.get(`${dep}0000`) ?? dep}`, filas: filasDep, total: delDep.reduce((s, f) => s + Number(f.total), 0) }
  } else {
    const filasPeru = [...agrupar(peru, (f) => (f.ubigeo ? departamentoDe(f.ubigeo) : null))].map(([k, v]): Fila => ({
      clave: k ?? 'sin-dato', etiqueta: k ? (UBIGEOS.get(k) ?? k) : 'Sin dato todavía', ...v,
      enlace: k ? url({ dep: k.slice(0, 2), prov: '' }) : undefined, leads: k ? `/leads?ubigeo=${k.slice(0, 2)}` : undefined,
    })).sort(ordenar)
    nivel = { titulo: 'Perú por departamento', filas: filasPeru, total: totalPeru }
  }

  const principal = nivel.filas.find((f) => f.clave !== 'sin-dato')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Procedencia de los leads</h1>
        <p className="text-sm text-slate-500">
          {esAdmin ? 'Todos los leads' : 'Tus leads'} · {desde || hasta ? `del ${desde || 'inicio'} al ${hasta || 'hoy'}` : 'todo el periodo'} · según la fecha en que llegó el lead
        </p>
      </div>

      {/* Filtros en una sola fila */}
      <div className="tarjeta flex flex-wrap items-center gap-3 p-3">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          {rangosRapidos.map((q) => (
            <Link
              key={q.texto} href={rango(q.desde, q.hasta) as Route}
              className={`border-r border-slate-300 px-3 py-1.5 last:border-r-0 ${q.desde === desde && q.hasta === hasta ? 'bg-marca-600 text-white' : 'bg-superficie text-slate-700 hover:bg-slate-50'}`}
            >
              {q.texto}
            </Link>
          ))}
        </div>
        <form className="flex flex-1 flex-wrap items-center gap-2">
          {dep && <input type="hidden" name="dep" value={dep} />}
          {prov && <input type="hidden" name="prov" value={prov} />}
          <input type="date" name="desde" defaultValue={desde} aria-label="Desde" className="campo w-auto" />
          <span className="text-sm text-slate-400">a</span>
          <input type="date" name="hasta" defaultValue={hasta} aria-label="Hasta" className="campo w-auto" />
          {esAdmin && (
            <select name="asesor" defaultValue={asesor} aria-label="Asesor" className="campo w-auto">
              <option value="">Todos los asesores</option>
              {(asesores ?? []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          )}
          <button className="boton-secundario">Aplicar</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="tarjeta p-4 sm:p-5">
          <p className="text-xs text-slate-500 sm:text-sm">Leads</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{num(total)}</p>
          <p className="mt-1 text-xs text-slate-500">{pct(totalPeru, total)} del Perú</p>
        </div>
        <div className="tarjeta p-4 sm:p-5">
          <p className="text-xs text-slate-500 sm:text-sm">Del extranjero</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{num(filas.filter((f) => f.pais && f.pais !== 'PE').reduce((s, f) => s + Number(f.total), 0))}</p>
          <p className="mt-1 text-xs text-slate-500">Según el celular o lo indicado</p>
        </div>
        <div className="tarjeta p-4 sm:p-5">
          <p className="text-xs text-slate-500 sm:text-sm">Del Perú con lugar</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{pct(conLugar, totalPeru)}</p>
          <p className="mt-1 text-xs text-slate-500">{num(conLugar)} de {num(totalPeru)} tienen departamento, provincia o distrito</p>
        </div>
        <div className="tarjeta p-4 sm:p-5">
          <p className="text-xs text-slate-500 sm:text-sm">{prov ? 'Distrito principal' : dep ? 'Provincia principal' : 'Departamento principal'}</p>
          <p className="mt-1 truncate text-2xl font-semibold sm:text-3xl" title={principal?.etiqueta}>{principal?.etiqueta ?? '—'}</p>
          <p className="mt-1 text-xs text-slate-500">{principal ? `${num(principal.total)} leads · ${pct(principal.total, nivel.total)}` : 'Aún sin datos'}</p>
        </div>
      </div>

      {(dep || prov) && (
        <nav aria-label="Ubicación" className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link href={url({ dep: '', prov: '' }) as Route} className="text-marca-700 hover:underline">Perú</Link>
          <span className="text-slate-400">›</span>
          {prov ? (
            <>
              <Link href={url({ dep: depActual, prov: '' }) as Route} className="text-marca-700 hover:underline">{UBIGEOS.get(`${depActual}0000`)}</Link>
              <span className="text-slate-400">›</span>
              <span className="font-medium">{UBIGEOS.get(`${prov}00`)}</span>
            </>
          ) : <span className="font-medium">{UBIGEOS.get(`${dep}0000`)}</span>}
        </nav>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Tabla
          titulo={nivel.titulo}
          descripcion={prov || dep ? 'Toca un lugar para ver el detalle.' : 'Toca un departamento para ver sus provincias y distritos.'}
          filas={nivel.filas} total={nivel.total}
        />
        <Tabla titulo="Por país" descripcion="Del celular (+51, +591…) salvo que se haya corregido en la ficha." filas={porPais} total={total} />
      </div>

      <p className="text-xs text-slate-500">
        La procedencia la indica el alumno en los formularios del QR, Genesys cuando el alumno dice de dónde es, o el asesor en la ficha (✏️ Editar datos → Procedencia).
      </p>
    </div>
  )
}
