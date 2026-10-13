// Puntaje de interés del lead (0 a 100): se calcula en la base cada 10 minutos (actualizar_puntajes).
// Se muestra como temperatura: frío → tibio → caliente → muy caliente.

export const NIVELES_INTERES = [
  { desde: 70, icono: '🔥', nombre: 'Muy caliente', estilo: 'bg-rose-100 text-rose-700' },
  { desde: 50, icono: '☀️', nombre: 'Caliente', estilo: 'bg-orange-100 text-orange-700' },
  { desde: 25, icono: '🌤️', nombre: 'Tibio', estilo: 'bg-amber-50 text-amber-700' },
  { desde: 0, icono: '🧊', nombre: 'Frío', estilo: 'bg-sky-100 text-sky-700' },
] as const

export function nivelInteres(puntaje: number) {
  return NIVELES_INTERES.find((n) => puntaje >= n.desde) ?? NIVELES_INTERES[NIVELES_INTERES.length - 1]!
}

export function PuntajeInteres({ puntaje, motivos, detalle = false }: { puntaje: number; motivos: string[]; detalle?: boolean }) {
  const nivel = nivelInteres(puntaje)
  const titulo = `${nivel.nombre} (${puntaje}/100)${motivos.length ? ': ' + motivos.join(', ') : ''}`
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span title={titulo} className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${nivel.estilo}`}>
        {nivel.icono} {puntaje}{detalle ? ` · ${nivel.nombre}` : ''}
      </span>
      {detalle && motivos.length > 0 && <span className="text-xs text-slate-500">{motivos.join(' · ')}</span>}
      {detalle && <a href="/puntaje" className="text-xs text-marca-700 hover:underline">¿Cómo se calcula?</a>}
    </span>
  )
}
