// Respuestas rápidas del chat: el panel ⚡ (por categoría y con buscador) y las sugerencias del atajo "/".
import { agruparPorCategoria, CATEGORIAS_RESPUESTA, categoriaRespuesta } from '@crm/db'
import { buscarRespuestas, type RespuestaChat } from './utilidades'

function Opcion({ rr }: { rr: RespuestaChat }) {
  return (
    <>
      <span className="text-sm font-medium text-slate-800">{rr.titulo}{rr.personal && <span className="ml-1.5 rounded bg-violet-100 px-1 py-px text-[10px] font-medium text-violet-700">👤 personal</span>}</span>
      <span className="block truncate text-xs text-slate-500">{rr.contenido}</span>
    </>
  )
}

/** Sugerencias al escribir "/texto": ↑ ↓ para elegir, Enter o Tab para usarla, Esc para cerrar. */
export function SugerenciasAtajo({ buscado, sugeridas, indice, alUsar, alSeñalar }: {
  buscado: string
  sugeridas: RespuestaChat[]
  indice: number
  alUsar: (contenido: string) => void
  alSeñalar: (i: number) => void
}) {
  return (
    <div className="max-h-64 overflow-y-auto border-t border-slate-200 bg-slate-50 p-2" role="listbox" aria-label="Respuestas rápidas">
      <p className="px-2 pb-1 text-xs text-slate-500">
        Respuestas rápidas{buscado ? <> con «<b>{buscado}</b>»</> : ''} · ↑ ↓ para elegir, Enter o Tab para usarla, Esc para cerrar
      </p>
      {sugeridas.map((rr, i) => (
        <button
          key={rr.id} type="button" role="option" aria-selected={i === indice}
          onMouseDown={(e) => { e.preventDefault(); alUsar(rr.contenido) }}
          onMouseEnter={() => alSeñalar(i)}
          className={`block w-full rounded-lg px-3 py-2 text-left ${i === indice ? 'bg-marca-50 ring-1 ring-marca-200' : 'hover:bg-superficie'}`}
        >
          <Opcion rr={rr} />
        </button>
      ))}
      {!sugeridas.length && <p className="px-2 py-3 text-center text-xs text-slate-500">Ninguna respuesta rápida coincide con «{buscado}».</p>}
    </div>
  )
}

/** Panel ⚡: buscador, pestañas por categoría y la lista agrupada. El filtro elegido lo guarda quien lo usa. */
export function PanelRespuestas({ respuestas, categoria, buscar, alCambiarCategoria, alBuscar, alUsar }: {
  respuestas: RespuestaChat[]
  categoria: string
  buscar: string
  alCambiarCategoria: (clave: string) => void
  alBuscar: (texto: string) => void
  alUsar: (contenido: string) => void
}) {
  if (!respuestas.length) {
    return (
      <div className="border-t border-slate-200 bg-slate-50">
        <p className="px-4 py-3 text-center text-xs text-slate-500">No hay respuestas rápidas. El administrador las crea en «Respuestas rápidas».</p>
      </div>
    )
  }
  const enPanel = buscarRespuestas(respuestas, buscar).filter((r) => !categoria || categoriaRespuesta(r.categoria).clave === categoria)
  const pestanas = [{ clave: '', nombre: 'Todas', icono: '' }, ...CATEGORIAS_RESPUESTA.filter((c) => respuestas.some((r) => categoriaRespuesta(r.categoria).clave === c.clave))]
  return (
    <div className="border-t border-slate-200 bg-slate-50">
      <div className="space-y-1.5 border-b border-slate-200 p-2">
        <input
          value={buscar} onChange={(e) => alBuscar(e.target.value)} placeholder="⌕ Buscar respuesta" aria-label="Buscar respuesta rápida"
          className="campo py-1 text-sm"
        />
        <div className="flex gap-1 overflow-x-auto pb-0.5 text-xs" role="tablist" aria-label="Categorías">
          {pestanas.map((c) => (
            <button
              key={c.clave || 'todas'} type="button" role="tab" aria-selected={categoria === c.clave} onClick={() => alCambiarCategoria(c.clave)}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 whitespace-nowrap ${categoria === c.clave ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 bg-superficie text-slate-700 hover:bg-slate-100'}`}
            >
              {c.icono} {c.nombre}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {agruparPorCategoria(enPanel).map((g) => (
          <div key={g.categoria.clave}>
            {!categoria && (
              <p className="sticky top-0 z-10 bg-slate-50 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{g.categoria.icono} {g.categoria.nombre}</p>
            )}
            {g.items.map((rr) => (
              <button
                key={rr.id} type="button" onClick={() => alUsar(rr.contenido)}
                className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-superficie"
              >
                <Opcion rr={rr} />
              </button>
            ))}
          </div>
        ))}
        {!enPanel.length && <p className="px-2 py-3 text-center text-xs text-slate-500">Ninguna respuesta en este filtro.</p>}
      </div>
    </div>
  )
}
