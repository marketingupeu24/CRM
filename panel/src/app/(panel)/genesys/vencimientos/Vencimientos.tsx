'use client'

import Link from '@/components/Enlace'
import { useState, useTransition } from 'react'
import { programarVencimientos, type Resultado } from '../acciones'

export interface FichaVencimiento {
  id: number
  titulo: string
  parte: string
  parteTitulo: string
  icono: string
  venceEl: string | null
  /** Última fecha futura escrita en el texto de la ficha (ej. el día del examen) */
  sugerida: string | null
  pendientePegar: boolean
}

/** Partes que suelen cambiar cada campaña: se muestran abiertas. */
const PARTES_DE_CAMPANA = ['examenes', 'cepre', 'becas', 'plantillas']

const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`))
const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`))
const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)

/** Atajos de fecha para programar varias a la vez. */
function atajos(hoy: string): { texto: string; fecha: string }[] {
  const [a, m] = hoy.split('-').map(Number) as [number, number]
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const finDeMes = iso(new Date(Date.UTC(a, m, 0)))
  const finMesSiguiente = iso(new Date(Date.UTC(a, m + 1, 0)))
  return [
    { texto: 'Fin de este mes', fecha: finDeMes },
    { texto: 'Fin del próximo mes', fecha: finMesSiguiente },
    { texto: `31 de diciembre`, fecha: `${a}-12-31` },
  ].filter((x) => x.fecha >= hoy)
}

function Resumen({ n, texto, estilo }: { n: number; texto: string; estilo: string }) {
  return <div className={`rounded-xl border px-4 py-3 ${estilo}`}><p className="text-2xl font-semibold tabular-nums">{n}</p><p className="text-xs">{texto}</p></div>
}

export function Vencimientos({ fichas, hoy, editable }: { fichas: FichaVencimiento[]; hoy: string; editable: boolean }) {
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const [elegidas, setElegidas] = useState<Set<number>>(new Set())
  const [fechaVarias, setFechaVarias] = useState('')
  const ejecutar = (cambios: { id: number; fecha: string | null }[], limpiar = false) =>
    iniciar(async () => {
      const res = await programarVencimientos(cambios)
      setR(res)
      if (res.ok && limpiar) { setElegidas(new Set()); setFechaVarias('') }
    })

  const programadas = fichas.filter((f) => f.venceEl).sort((a, b) => a.venceEl!.localeCompare(b.venceEl!))
  const sinFecha = fichas.filter((f) => !f.venceEl)
  const vencidas = programadas.filter((f) => f.venceEl! < hoy)
  const semana = programadas.filter((f) => f.venceEl! >= hoy && dias(hoy, f.venceEl!) <= 7)
  const conSugerencia = sinFecha.filter((f) => f.sugerida)
  const porParte = [...new Set(sinFecha.map((f) => f.parte))]
    .sort((a, b) => Number(PARTES_DE_CAMPANA.includes(b)) - Number(PARTES_DE_CAMPANA.includes(a)))
  const elegidasLista = sinFecha.filter((f) => elegidas.has(f.id))
  const alternar = (id: number) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumen n={vencidas.length} texto="Vencidas" estilo={vencidas.length ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-superficie text-slate-600'} />
        <Resumen n={semana.length} texto="Vencen esta semana" estilo={semana.length ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-superficie text-slate-600'} />
        <Resumen n={programadas.length - vencidas.length - semana.length} texto="Programadas más adelante" estilo="border-slate-200 bg-superficie text-slate-700" />
        <Resumen n={sinFecha.length} texto="Sin fecha" estilo="border-slate-200 bg-superficie text-slate-500" />
      </div>

      {r.error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{r.error}</p>}
      {r.ok && <p role="status" className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{r.ok}</p>}

      {/* Línea de tiempo: lo programado, de lo más cercano a lo más lejano */}
      <section className="tarjeta">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">📅 Programadas</h2>
          <p className="text-xs text-slate-500">Ordenadas por fecha. Cambia la fecha ahí mismo o quítala.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {programadas.map((f) => {
            const d = dias(hoy, f.venceEl!)
            const vencida = d < 0
            const color = vencida ? 'bg-rose-500' : d <= 7 ? 'bg-amber-500' : 'bg-emerald-500'
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} aria-hidden />
                <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-2rem)]">
                  <Link href={`/genesys?parte=${f.parte}`} className="font-medium text-slate-900 hover:text-marca-700">{f.titulo}</Link>
                  <p className="text-xs text-slate-500">{f.icono} {f.parteTitulo}</p>
                </div>
                <div className="text-right max-sm:text-left">
                  <p className={`font-medium ${vencida ? 'text-rose-700' : d <= 7 ? 'text-amber-700' : 'text-slate-800'}`}>{fechaLarga(f.venceEl!)}</p>
                  <p className="text-xs text-slate-500">
                    {vencida ? (f.pendientePegar ? 'Venció · falta pegar el prompt en BuilderBot' : 'Venció · ya salió del prompt') : d === 0 ? 'Vence hoy (sale mañana)' : d === 1 ? 'Vence mañana' : `Faltan ${d} días`}
                  </p>
                </div>
                {editable && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date" min={hoy} defaultValue={f.venceEl!} disabled={pendiente} aria-label={`Nueva fecha para ${f.titulo}`}
                      onChange={(e) => { if (e.target.value) ejecutar([{ id: f.id, fecha: e.target.value }]) }}
                      className="campo w-auto py-1.5"
                    />
                    <button type="button" disabled={pendiente} onClick={() => ejecutar([{ id: f.id, fecha: null }])} className="text-xs font-medium text-slate-500 hover:text-rose-600">
                      Quitar
                    </button>
                  </div>
                )}
              </li>
            )
          })}
          {!programadas.length && <li className="px-5 py-6 text-center text-sm text-slate-500">Todavía no hay fichas con fecha. Prográmalas abajo 👇</li>}
        </ul>
      </section>

      {/* Programar: sugeridas con un clic y varias a la vez */}
      {editable && sinFecha.length > 0 && (
        <section className="tarjeta">
          <div className="space-y-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold">➕ Programar fechas</h2>
              <p className="text-xs text-slate-500">
                Marca las fichas y elige una fecha, o usa la <b>fecha sugerida</b> (la última fecha que aparece en el texto de la ficha, como el día del examen).
              </p>
            </div>
            {conSugerencia.length > 0 && (
              <button
                type="button" disabled={pendiente} className="boton"
                onClick={() => ejecutar(conSugerencia.map((f) => ({ id: f.id, fecha: f.sugerida })), true)}
              >
                ✨ Usar la fecha sugerida en las {conSugerencia.length} que tienen una
              </button>
            )}
          </div>

          {/* Barra para las marcadas */}
          {elegidasLista.length > 0 && (
            <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-marca-200 bg-marca-50 px-5 py-3 text-sm md:top-16">
              <span className="font-medium text-marca-800">{elegidasLista.length} marcada{elegidasLista.length > 1 ? 's' : ''}:</span>
              {atajos(hoy).map((a) => (
                <button key={a.texto} type="button" onClick={() => setFechaVarias(a.fecha)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${fechaVarias === a.fecha ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 bg-superficie text-slate-700 hover:bg-slate-50'}`}>
                  {a.texto}
                </button>
              ))}
              <input type="date" min={hoy} value={fechaVarias} onChange={(e) => setFechaVarias(e.target.value)} className="campo w-auto py-1.5" aria-label="Fecha para las marcadas" />
              <button
                type="button" className="boton" disabled={pendiente || !fechaVarias}
                onClick={() => ejecutar(elegidasLista.map((f) => ({ id: f.id, fecha: fechaVarias })), true)}
              >
                Programar {fechaVarias ? `al ${fechaCorta(fechaVarias)}` : ''}
              </button>
              {elegidasLista.some((f) => f.sugerida) && (
                <button
                  type="button" className="boton-secundario" disabled={pendiente}
                  onClick={() => ejecutar(elegidasLista.filter((f) => f.sugerida).map((f) => ({ id: f.id, fecha: f.sugerida })), true)}
                >
                  ✨ Cada una con su sugerida
                </button>
              )}
              <button type="button" onClick={() => setElegidas(new Set())} className="ml-auto text-xs text-slate-500 hover:underline">Desmarcar</button>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {porParte.map((clave) => {
              const lista = sinFecha.filter((f) => f.parte === clave)
              const todas = lista.every((f) => elegidas.has(f.id))
              return (
                <details key={clave} open={PARTES_DE_CAMPANA.includes(clave)} className="group">
                  <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-sm font-semibold">
                    <span className="text-slate-400 transition group-open:rotate-90">▸</span>
                    {lista[0]!.icono} {lista[0]!.parteTitulo}
                    <span className="font-normal text-slate-400">· {lista.length}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setElegidas((s) => { const n = new Set(s); lista.forEach((f) => (todas ? n.delete(f.id) : n.add(f.id))); return n }) }}
                      className="ml-auto text-xs font-medium text-marca-700 hover:underline"
                    >
                      {todas ? 'Desmarcar todas' : 'Marcar todas'}
                    </button>
                  </summary>
                  <ul className="pb-2">
                    {lista.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 text-sm hover:bg-slate-50">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <input type="checkbox" checked={elegidas.has(f.id)} onChange={() => alternar(f.id)} className="h-4 w-4 shrink-0 accent-marca-600" />
                          <span className="truncate">{f.titulo}</span>
                        </label>
                        {f.sugerida && (
                          <button
                            type="button" disabled={pendiente} onClick={() => ejecutar([{ id: f.id, fecha: f.sugerida }])}
                            title="Es la última fecha que aparece en el texto de la ficha"
                            className="rounded-full border border-dorado-400 bg-dorado-50 px-2.5 py-0.5 text-xs font-medium text-dorado-700 hover:brightness-95"
                          >
                            ✨ Vence el {fechaCorta(f.sugerida)}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
