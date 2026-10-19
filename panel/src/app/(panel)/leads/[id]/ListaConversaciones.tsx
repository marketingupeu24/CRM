'use client'

// Bandeja a la izquierda del chat (pantallas grandes, como WhatsApp Web): pasar de una conversación a otra
// sin salir de la ficha y ver de un vistazo quién escribió y espera respuesta. Se actualiza en vivo
// (RefrescoEnVivo vuelve a pedir la página cuando llega un mensaje).
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export interface Conversacion {
  id: string
  nombre: string
  ultimo: string | null
  /** El último mensaje es del asesor (se muestra "Tú: …") */
  deMi: boolean
  hace: string
  sinResponder: boolean
  mio: boolean
}

type Filtro = 'todos' | 'sin_responder' | 'mios'

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function ListaConversaciones({ conversaciones, actualId, verMios }: {
  conversaciones: Conversacion[]
  actualId: string
  /** Quien ve los chats de todo el equipo puede quedarse con los suyos */
  verMios: boolean
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [buscar, setBuscar] = useState('')
  const actual = useRef<HTMLAnchorElement>(null)
  // Al abrir, la conversación actual queda a la vista en la lista
  useEffect(() => { actual.current?.scrollIntoView({ block: 'nearest' }) }, [actualId])

  const pendientes = conversaciones.filter((c) => c.sinResponder).length
  const q = normalizar(buscar.trim())
  const lista = conversaciones.filter((c) =>
    (filtro === 'todos' || (filtro === 'sin_responder' ? c.sinResponder : c.mio)) && (!q || normalizar(c.nombre).includes(q)))

  const pestana = (valor: Filtro, texto: React.ReactNode) => (
    <button
      type="button" onClick={() => setFiltro(valor)} aria-pressed={filtro === valor}
      className={`flex-1 rounded-md px-1.5 py-1 whitespace-nowrap ${filtro === valor ? 'bg-superficie text-marca-700 shadow-theme-xs' : 'text-slate-600 hover:text-slate-900'}`}
    >
      {texto}
    </button>
  )

  return (
    <section className="tarjeta flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Conversaciones">
      <div className="space-y-2 border-b border-slate-200 p-2">
        <input
          value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="⌕ Buscar conversación"
          className="campo py-1.5 text-sm" aria-label="Buscar conversación"
        />
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          {pestana('todos', 'Todos')}
          {pestana('sin_responder', <>Sin responder{pendientes > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{pendientes}</span>}</>)}
          {verMios && pestana('mios', 'Míos')}
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
        {lista.map((c) => {
          const esActual = c.id === actualId
          return (
            <li key={c.id}>
              <Link
                ref={esActual ? actual : undefined} href={`/leads/${c.id}`} aria-current={esActual ? 'page' : undefined}
                className={`flex items-start gap-2.5 px-3 py-2.5 ${esActual ? 'bg-marca-50' : 'hover:bg-slate-50'}`}
              >
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${c.sinResponder ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                  {c.nombre.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${c.sinResponder ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>{c.nombre}</span>
                    <span className={`shrink-0 text-[11px] ${c.sinResponder ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{c.hace}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`min-w-0 flex-1 truncate text-xs ${c.sinResponder ? 'text-slate-700' : 'text-slate-500'}`}>
                      {c.deMi ? 'Tú: ' : ''}{c.ultimo ?? ''}
                    </span>
                    {c.sinResponder && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" title="Escribió y espera respuesta" />}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
        {!lista.length && (
          <li className="px-3 py-8 text-center text-xs text-slate-500">
            {filtro === 'sin_responder' && !q ? 'No hay mensajes sin responder 🎉' : 'Sin conversaciones.'}
          </li>
        )}
      </ul>
    </section>
  )
}
