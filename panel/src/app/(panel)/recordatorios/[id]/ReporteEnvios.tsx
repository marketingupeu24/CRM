'use client'

// Reporte de envíos (como los de campañas de WhatsApp): totales arriba y la lista de destinatarios
// filtrable por estado, con buscador y descarga en CSV.
import Link from '@/components/Enlace'
import { useMemo, useState } from 'react'
import { paraBuscar } from '@/lib/texto'

export interface FilaReporte {
  lead_id: string
  nombre: string | null
  telefono: string
  carrera: string | null
  asesor: string | null
  estado: 'enviado' | 'error' | 'enviando' | 'pendiente'
  enviado_at: string | null
  error: string | null
  respondio_at: string | null
  respuesta: string | null
  baja: boolean
}

type Filtro = 'todos' | 'enviado' | 'respondio' | 'sin_respuesta' | 'baja' | 'error' | 'pendiente'

const hora = (iso: string | null) => (iso
  ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  : '')
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : '—')

const CUMPLE: Record<Filtro, (f: FilaReporte) => boolean> = {
  todos: () => true,
  enviado: (f) => f.estado === 'enviado',
  respondio: (f) => !!f.respondio_at,
  sin_respuesta: (f) => f.estado === 'enviado' && !f.respondio_at,
  baja: (f) => f.baja,
  error: (f) => f.estado === 'error',
  pendiente: (f) => f.estado === 'pendiente' || f.estado === 'enviando',
}

export function ReporteEnvios({ filas, titulo }: { filas: FilaReporte[]; titulo: string }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [buscar, setBuscar] = useState('')
  const n = (f: Filtro) => filas.filter(CUMPLE[f]).length
  const enviados = n('enviado')
  const q = paraBuscar(buscar.trim())
  const lista = useMemo(() => filas
    .filter(CUMPLE[filtro])
    .filter((f) => !q || paraBuscar(`${f.nombre ?? ''} ${f.telefono} ${f.carrera ?? ''} ${f.asesor ?? ''}`).includes(q))
    .sort((a, b) => (b.enviado_at ?? '').localeCompare(a.enviado_at ?? '')), [filas, filtro, q])

  const tarjetas: { f: Filtro; t: string; v: number; d: string; estilo?: string }[] = [
    { f: 'todos', t: 'Destinatarios', v: filas.length, d: 'en total' },
    { f: 'enviado', t: 'Enviados', v: enviados, d: pct(enviados, filas.length) },
    { f: 'respondio', t: 'Respondieron', v: n('respondio'), d: `${pct(n('respondio'), enviados)} de los enviados`, estilo: 'text-emerald-700' },
    { f: 'baja', t: 'Pidieron no recibir', v: n('baja'), d: 'respondieron NO', estilo: n('baja') ? 'text-amber-700' : '' },
    { f: 'error', t: 'Con error', v: n('error'), d: 'no se pudo enviar', estilo: n('error') ? 'text-rose-600' : '' },
    { f: 'pendiente', t: 'Por enviar', v: n('pendiente'), d: 'en cola' },
  ]
  const pestanas: [Filtro, string][] = [
    ['todos', 'Todos'], ['enviado', 'Enviados'], ['respondio', 'Respondieron'], ['sin_respuesta', 'Sin respuesta'],
    ['baja', 'Pidieron NO'], ['error', 'Con error'], ['pendiente', 'Por enviar'],
  ]

  function descargarCsv() {
    const celda = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`
    const filasCsv = [
      ['Nombre', 'Celular', 'Carrera', 'Asesor', 'Estado', 'Enviado', 'Respondió', 'Respuesta', 'Pidió NO', 'Error'],
      ...lista.map((f) => [f.nombre, f.telefono, f.carrera, f.asesor, f.estado, hora(f.enviado_at), hora(f.respondio_at), f.respuesta, f.baja ? 'sí' : '', f.error]),
    ].map((r) => r.map(celda).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + filasCsv], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `envios-${titulo.slice(0, 40)}.csv` })
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tarjetas.map((k) => (
          <button key={k.t} type="button" onClick={() => setFiltro(k.f)}
            className={`tarjeta p-3 text-left transition hover:ring-2 hover:ring-marca-200 ${filtro === k.f ? 'ring-2 ring-marca-500' : ''}`}>
            <p className="text-xs font-medium text-slate-500">{k.t}</p>
            <p className={`mt-0.5 text-2xl font-semibold ${k.estilo ?? ''}`}>{k.v}</p>
            <p className="text-xs text-slate-500">{k.d}</p>
          </button>
        ))}
      </section>

      <section className="tarjeta overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
            {pestanas.map(([f, t]) => (
              <button key={f} type="button" onClick={() => setFiltro(f)} aria-pressed={filtro === f}
                className={`rounded-md px-2.5 py-1 ${filtro === f ? 'bg-superficie text-marca-700 shadow-theme-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                {t} <span className="text-slate-400">{n(f)}</span>
              </button>
            ))}
          </div>
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="⌕ Buscar nombre, celular, carrera o asesor"
            className="campo min-w-0 flex-1 basis-56 py-1.5 text-sm" aria-label="Buscar" />
          <button type="button" onClick={descargarCsv} className="boton-secundario py-1.5 text-sm" disabled={!lista.length}>⬇ CSV</button>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {lista.map((f) => (
            <li key={f.lead_id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/chats/${f.lead_id}`} className="font-medium text-marca-700 hover:underline">{f.nombre ?? f.telefono}</Link>
                  <Estado f={f} />
                  {f.baja && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Pidió NO</span>}
                </div>
                <p className="text-xs text-slate-500">{f.carrera ?? 'sin carrera'}{f.asesor ? ` · ${f.asesor}` : ''} · {f.telefono}</p>
                {f.respuesta && <p className="mt-0.5 truncate text-xs text-slate-700">💬 “{f.respuesta}”</p>}
                {f.error && <p className="mt-0.5 text-xs text-rose-600">⚠️ {f.error}</p>}
              </div>
              <div className="shrink-0 text-right text-xs text-slate-500">
                {f.enviado_at && <p>Enviado {hora(f.enviado_at)}</p>}
                {f.respondio_at && <p className="text-emerald-700">Respondió {hora(f.respondio_at)}</p>}
              </div>
            </li>
          ))}
          {!lista.length && <li className="px-4 py-10 text-center text-slate-500">Nadie en este filtro.</li>}
        </ul>
      </section>
    </>
  )
}

function Estado({ f }: { f: FilaReporte }) {
  const e = f.respondio_at
    ? ['✓ Respondió', 'bg-emerald-100 text-emerald-700']
    : f.estado === 'enviado' ? ['Enviado', 'bg-sky-100 text-sky-700']
    : f.estado === 'error' ? ['Error', 'bg-rose-100 text-rose-700']
    : f.estado === 'enviando' ? ['Enviando…', 'bg-slate-100 text-slate-600']
    : ['Por enviar', 'bg-slate-100 text-slate-600']
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e[1]}`}>{e[0]}</span>
}
