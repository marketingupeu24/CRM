'use client'

import { useState, useTransition } from 'react'
import { marcarRevisada, type Resultado } from '../conocimiento/acciones'

export function BotonRevisada({ ids, revisada, texto }: { ids: number[]; revisada: boolean; texto?: string }) {
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  return (
    <span className="inline-flex items-center gap-2">
      <button
        disabled={pendiente}
        onClick={() => iniciar(async () => setR(await marcarRevisada(ids, !revisada)))}
        className={texto ? 'boton-secundario' : `text-xs font-medium hover:underline ${revisada ? 'text-slate-500' : 'text-emerald-700'}`}
      >
        {texto ?? (revisada ? '↩ Volver a pendientes' : '✓ Revisada')}
      </button>
      {r.error && <span role="alert" className="text-xs text-rose-600">{r.error}</span>}
    </span>
  )
}
