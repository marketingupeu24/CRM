// Puntaje de interés del lead (0 a 100): se calcula en la base cada 10 minutos (actualizar_puntajes).
export function PuntajeInteres({ puntaje, motivos, detalle = false }: { puntaje: number; motivos: string[]; detalle?: boolean }) {
  const estilo = puntaje >= 70 ? 'bg-rose-100 text-rose-700' : puntaje >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
  const icono = puntaje >= 70 ? '🔥' : puntaje >= 40 ? '⭐' : '·'
  const titulo = `Interés ${puntaje}/100${motivos.length ? ': ' + motivos.join(', ') : ''}`
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span title={titulo} className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${estilo}`}>{icono} {puntaje}</span>
      {detalle && motivos.length > 0 && <span className="text-xs text-slate-500">{motivos.join(' · ')}</span>}
    </span>
  )
}
