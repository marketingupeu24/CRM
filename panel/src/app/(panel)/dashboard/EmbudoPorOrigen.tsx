// Embudo por origen: escribieron → registrados → contactados → inscritos → matriculados,
// con el % que pasa de una etapa a la siguiente (lo que se pierde en cada paso).
import { num, pct } from '@/lib/formato'

export interface FilaEmbudo {
  grupo: string
  escribieron: number
  registrados: number
  contactados: number
  inscritos: number
  matriculados: number
}

const ETAPAS = [
  ['escribieron', 'Escribieron'],
  ['registrados', 'Registrados'],
  ['contactados', 'Contactados'],
  ['inscritos', 'Inscritos'],
  ['matriculados', 'Matriculados'],
] as const

export function EmbudoPorOrigen({ filas }: { filas: FilaEmbudo[] }) {
  if (!filas.length) return <p className="text-sm text-slate-500">Sin leads en este periodo.</p>
  const total = ETAPAS.reduce((acc, [clave]) => ({ ...acc, [clave]: filas.reduce((s, f) => s + f[clave], 0) }), {} as Record<(typeof ETAPAS)[number][0], number>)
  const todas = [...filas, { grupo: 'Total', ...total }]
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="py-2 pr-4">Origen</th>
            {ETAPAS.map(([clave, etiqueta]) => <th key={clave} className="px-3 py-2 text-right">{etiqueta}</th>)}
            <th className="px-3 py-2 text-right" title="Matriculados sobre los que escribieron">Conversión</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {todas.map((f) => (
            <tr key={f.grupo} className={f.grupo === 'Total' ? 'font-semibold' : ''}>
              <td className="py-2 pr-4">{f.grupo}</td>
              {ETAPAS.map(([clave], i) => {
                const anterior = i > 0 ? f[ETAPAS[i - 1]![0]] : null
                return (
                  <td key={clave} className="px-3 py-2 text-right whitespace-nowrap">
                    {num(f[clave])}
                    {anterior !== null && anterior > 0 && (
                      <span className={`ml-1 text-xs ${f[clave] / anterior < 0.5 ? 'text-rose-600' : 'text-slate-400'}`} title={`Pasan ${pct(f[clave], anterior)} de la etapa anterior`}>
                        {pct(f[clave], anterior)}
                      </span>
                    )}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-right">{pct(f.matriculados, f.escribieron)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">El % pequeño es cuántos pasan de la etapa anterior; en rojo, cuando se pierde más de la mitad.</p>
    </div>
  )
}
