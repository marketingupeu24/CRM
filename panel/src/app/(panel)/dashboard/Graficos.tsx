'use client'

// Gráficos del dashboard en HTML/CSS: barras finas, extremo redondeado de 4px,
// separación de 2px entre segmentos, tooltip al pasar el mouse y tabla alternativa.
import { useState, type ReactNode } from 'react'
import { duracion, num, pct } from '@/lib/formato'

// ---------------------------------------------------------------------
// Tooltip que sigue al mouse
// ---------------------------------------------------------------------
interface EstadoTooltip { x: number; y: number; contenido: ReactNode }

function useTooltip() {
  const [tip, setTip] = useState<EstadoTooltip | null>(null)
  const props = (contenido: ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, contenido }),
    onMouseLeave: () => setTip(null),
  })
  const nodo = tip && (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: tip.x + 14, top: tip.y + 14 }}
    >
      {tip.contenido}
    </div>
  )
  return { props, nodo }
}

function VerTabla({ encabezados, filas }: { encabezados: string[]; filas: (string | number)[][] }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-800">Ver tabla</summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>{encabezados.map((h, i) => <th key={h} className={`py-1 pr-4 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f, i) => (
              <tr key={i}>{f.map((c, j) => <td key={j} className={`py-1 pr-4 ${j ? 'text-right tabular-nums' : ''}`}>{typeof c === 'number' ? num(c) : c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function Tarjeta({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <section className="tarjeta p-5">
      <h2 className="font-semibold">{titulo}</h2>
      {descripcion && <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function SinDatos() {
  return <p className="py-8 text-center text-sm text-slate-400">Sin datos para estos filtros.</p>
}

// ---------------------------------------------------------------------
// Barras horizontales de una sola serie (estado, carrera)
// ---------------------------------------------------------------------
export interface FilaBarra { etiqueta: string; valor: number; detalle?: ReactNode }

export function BarrasHorizontales(
  { filas, total, nombreValor = 'Leads' }: { filas: FilaBarra[]; total: number; nombreValor?: string },
) {
  const { props, nodo } = useTooltip()
  if (!filas.length) return <SinDatos />
  const max = Math.max(...filas.map((f) => f.valor), 1)

  return (
    <div>
      <ul className="space-y-2.5">
        {filas.map((f) => (
          <li key={f.etiqueta} className="grid grid-cols-[minmax(7rem,11rem)_1fr] items-center gap-3 text-sm" {...props(
            <>
              <p className="font-semibold">{f.etiqueta}</p>
              <p>{nombreValor}: {num(f.valor)} ({pct(f.valor, total)})</p>
              {f.detalle}
            </>,
          )}>
            <span className="truncate text-slate-600" title={f.etiqueta}>{f.etiqueta}</span>
            <div className="flex items-center gap-2 py-1">
              <div
                className="h-3.5 rounded-r-[4px] transition-[width]"
                style={{ width: `${(f.valor / max) * 100}%`, minWidth: f.valor ? 3 : 0, background: 'var(--serie-1)' }}
              />
              <span className="text-xs font-medium text-slate-700 tabular-nums">{num(f.valor)}</span>
            </div>
          </li>
        ))}
      </ul>
      {nodo}
      <VerTabla encabezados={['', nombreValor, '% del total']} filas={filas.map((f) => [f.etiqueta, f.valor, pct(f.valor, total)])} />
    </div>
  )
}

// ---------------------------------------------------------------------
// Embudo de conversión por etapas (rampa ordinal azul, de claro a oscuro)
// ---------------------------------------------------------------------
export function Embudo({ etapas }: { etapas: { etiqueta: string; valor: number }[] }) {
  const { props, nodo } = useTooltip()
  const colores = ['var(--secuencial-250)', 'var(--secuencial-400)', 'var(--secuencial-550)', 'var(--secuencial-700)']
  const max = Math.max(etapas[0]?.valor ?? 0, 1)
  if (!etapas[0]?.valor) return <SinDatos />

  return (
    <div>
      <ol className="space-y-3">
        {etapas.map((e, i) => {
          const anterior = etapas[i - 1]
          return (
            <li key={e.etiqueta} {...props(
              <>
                <p className="font-semibold">{e.etiqueta}</p>
                <p>{num(e.valor)} leads</p>
                {anterior && <p>{pct(e.valor, anterior.valor)} de «{anterior.etiqueta}»</p>}
                <p>{pct(e.valor, etapas[0]!.valor)} del total</p>
              </>,
            )}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-slate-600">{e.etiqueta}</span>
                <span className="font-semibold tabular-nums">
                  {num(e.valor)}
                  {anterior && <span className="ml-2 text-xs font-normal text-slate-500">{pct(e.valor, anterior.valor)} del paso anterior</span>}
                </span>
              </div>
              <div className="h-5 rounded-[4px] bg-slate-100">
                <div className="h-5 rounded-[4px]" style={{ width: `${(e.valor / max) * 100}%`, minWidth: e.valor ? 3 : 0, background: colores[i] }} />
              </div>
            </li>
          )
        })}
      </ol>
      {nodo}
      <VerTabla
        encabezados={['Etapa', 'Leads', '% del paso anterior', '% del total']}
        filas={etapas.map((e, i) => [e.etiqueta, e.valor, i ? pct(e.valor, etapas[i - 1]!.valor) : '—', pct(e.valor, etapas[0]!.valor)])}
      />
    </div>
  )
}

// ---------------------------------------------------------------------
// Barras apiladas por asesor (5 segmentos, colores categóricos en orden fijo)
// ---------------------------------------------------------------------
export interface FilaAsesor {
  asesor: string
  activo: boolean
  total: number
  sin_contactar: number
  contactados: number
  inscritos: number
  matriculados: number
  perdidos: number
  /** Mediana de minutos entre la asignación y el primer contacto */
  primera_respuesta_min?: number | null
  sin_contactar_2h?: number
}

const SEGMENTOS = [
  { clave: 'sin_contactar', etiqueta: 'Sin contactar', color: 'var(--serie-1)' },
  { clave: 'contactados', etiqueta: 'Contactados', color: 'var(--serie-2)' },
  { clave: 'inscritos', etiqueta: 'Inscritos', color: 'var(--serie-3)' },
  { clave: 'matriculados', etiqueta: 'Matriculados', color: 'var(--serie-4)' },
  { clave: 'perdidos', etiqueta: 'Perdidos / no interesados', color: 'var(--serie-5)' },
] as const

export function BarrasPorAsesor({ filas }: { filas: FilaAsesor[] }) {
  const { props, nodo } = useTooltip()
  if (!filas.some((f) => f.total)) return <SinDatos />
  const max = Math.max(...filas.map((f) => f.total), 1)

  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Leyenda">
        {SEGMENTOS.map((s) => (
          <li key={s.clave} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.etiqueta}
          </li>
        ))}
      </ul>
      <ul className="space-y-2.5">
        {filas.map((f) => (
          <li key={f.asesor} className="grid grid-cols-[minmax(7rem,11rem)_1fr] items-center gap-3 text-sm">
            <span className={`truncate ${f.activo ? 'text-slate-600' : 'text-slate-400'}`} title={f.asesor}>
              {f.asesor}{f.activo ? '' : ' (inactivo)'}
            </span>
            <div className="flex items-center gap-2 py-1">
              <div className="flex h-3.5 gap-[2px]" style={{ width: `${(f.total / max) * 100}%`, minWidth: f.total ? 3 : 0 }}>
                {SEGMENTOS.filter((s) => f[s.clave] > 0).map((s, i, visibles) => (
                  <div
                    key={s.clave}
                    className={i === visibles.length - 1 ? 'rounded-r-[4px]' : ''}
                    style={{ flexGrow: f[s.clave], flexBasis: 0, background: s.color }}
                    {...props(
                      <>
                        <p className="font-semibold">{f.asesor}</p>
                        <p>{s.etiqueta}: {num(f[s.clave])} ({pct(f[s.clave], f.total)})</p>
                        <p className="text-slate-300">Total asignados: {num(f.total)}</p>
                      </>,
                    )}
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-slate-700 tabular-nums">{num(f.total)}</span>
              {f.primera_respuesta_min != null && (
                <span className="text-xs whitespace-nowrap text-slate-500" title="Mediana del tiempo hasta el primer contacto">⏱ {duracion(f.primera_respuesta_min)}</span>
              )}
              {!!f.sin_contactar_2h && (
                <span className="text-xs font-medium whitespace-nowrap text-rose-600" title="Asignados hace más de 2 h sin contactar">{f.sin_contactar_2h} sin contactar</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {nodo}
      <VerTabla
        encabezados={['Asesor', 'Total', ...SEGMENTOS.map((s) => s.etiqueta), 'Conversión', '1.ª respuesta (mediana)', 'Sin contactar > 2 h']}
        filas={filas.map((f) => [
          f.asesor, f.total, ...SEGMENTOS.map((s) => f[s.clave]), pct(f.matriculados, f.total),
          duracion(f.primera_respuesta_min), f.sin_contactar_2h ?? 0,
        ])}
      />
    </div>
  )
}

// ---------------------------------------------------------------------
// Columnas por día / semana
// ---------------------------------------------------------------------
export function ColumnasPorPeriodo(
  { puntos, unidad }: { puntos: { periodo: string; total: number }[]; unidad: 'dia' | 'semana' },
) {
  const { props, nodo } = useTooltip()
  if (!puntos.length || !puntos.some((p) => p.total)) return <SinDatos />
  const max = Math.max(...puntos.map((p) => p.total), 1)
  const etiqueta = (iso: string) => {
    const fecha = new Date(`${iso}T12:00:00`)
    const texto = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' }).format(fecha)
    return unidad === 'semana' ? `Semana del ${texto}` : texto
  }
  // Etiquetas del eje: primera, del medio y última
  const marcas = new Set([0, Math.floor((puntos.length - 1) / 2), puntos.length - 1])

  return (
    <div>
      <div className="relative">
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-[var(--rejilla)]" />
        <span className="absolute -top-2 right-0 bg-superficie pl-1 text-[10px] text-slate-400 tabular-nums">{num(max)}</span>
        <div className="flex h-44 items-end gap-[2px] border-b border-slate-300">
          {puntos.map((p) => (
            <div
              key={p.periodo} className="flex h-full flex-1 items-end"
              {...props(<><p className="font-semibold">{etiqueta(p.periodo)}</p><p>{num(p.total)} leads nuevos</p></>)}
            >
              <div
                className="w-full rounded-t-[4px] hover:opacity-80"
                style={{ height: `${(p.total / max) * 100}%`, minHeight: p.total ? 2 : 0, background: 'var(--serie-1)' }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex text-[10px] text-slate-500">
        {puntos.map((p, i) => (
          <span key={p.periodo} className={`flex-1 whitespace-nowrap ${i === puntos.length - 1 ? 'text-right' : i ? 'text-center' : ''}`}>
            {marcas.has(i) ? etiqueta(p.periodo).replace('Semana del ', '') : ''}
          </span>
        ))}
      </div>
      {nodo}
      <VerTabla encabezados={[unidad === 'semana' ? 'Semana' : 'Día', 'Leads nuevos']} filas={puntos.map((p) => [etiqueta(p.periodo), p.total])} />
    </div>
  )
}
