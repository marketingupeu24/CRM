// Puntaje de interés del lead (0 a 100): se calcula en la base cada 10 minutos (actualizar_puntajes).
// Se muestra como temperatura con íconos de línea fina (no emojis): frío → tibio → caliente → muy caliente.
// Trazos tomados de Lucide (licencia ISC).

type Forma = 'copo' | 'termometro' | 'sol' | 'llama'

const TRAZOS: Record<Forma, React.ReactNode> = {
  copo: (
    <>
      <line x1="2" x2="22" y1="12" y2="12" /><line x1="12" x2="12" y1="2" y2="22" />
      <path d="m20 16-4-4 4-4" /><path d="m4 8 4 4-4 4" /><path d="m16 4-4 4-4-4" /><path d="m8 20 4-4 4 4" />
    </>
  ),
  termometro: <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />,
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </>
  ),
  llama: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
}

export const NIVELES_INTERES = [
  { desde: 70, forma: 'llama', nombre: 'Muy caliente', estilo: 'bg-rose-50 text-rose-700 ring-rose-200' },
  { desde: 50, forma: 'sol', nombre: 'Caliente', estilo: 'bg-orange-50 text-orange-700 ring-orange-200' },
  { desde: 25, forma: 'termometro', nombre: 'Tibio', estilo: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { desde: 0, forma: 'copo', nombre: 'Frío', estilo: 'bg-sky-50 text-sky-700 ring-sky-200' },
] as const satisfies readonly { desde: number; forma: Forma; nombre: string; estilo: string }[]

export function nivelInteres(puntaje: number) {
  return NIVELES_INTERES.find((n) => puntaje >= n.desde) ?? NIVELES_INTERES[NIVELES_INTERES.length - 1]!
}

/** Ícono de línea del nivel (hereda el color del texto). */
export function IconoNivel({ forma, className = 'h-3.5 w-3.5' }: { forma: Forma; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {TRAZOS[forma]}
    </svg>
  )
}

export function PuntajeInteres({ puntaje, motivos, detalle = false, enlace = true }: {
  puntaje: number; motivos: string[]; detalle?: boolean
  /** Enlace "¿Cómo se calcula?" (no hace falta en la propia página del puntaje) */
  enlace?: boolean
}) {
  const nivel = nivelInteres(puntaje)
  const titulo = `${nivel.nombre} (${puntaje}/100)${motivos.length ? ': ' + motivos.join(', ') : ''}`
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span title={titulo} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${nivel.estilo}`}>
        <IconoNivel forma={nivel.forma} />
        {puntaje}{detalle ? ` · ${nivel.nombre}` : ''}
      </span>
      {detalle && motivos.length > 0 && <span className="text-xs text-slate-500">{motivos.join(' · ')}</span>}
      {detalle && enlace && <a href="/puntaje" className="text-xs text-marca-700 hover:underline">¿Cómo se calcula?</a>}
    </span>
  )
}
