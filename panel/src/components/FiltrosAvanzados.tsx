'use client'

// Barra de filtros compacta: lo de uso diario a la vista (buscador, estado) y el resto detrás de "Filtros".
// El panel se oculta con CSS (no se desmonta) para que sus valores se sigan enviando con el formulario.
import { useState } from 'react'

export function FiltrosAvanzados({ barra, acciones, activos, children }: {
  /** Campos siempre visibles (buscador, estado) */
  barra: React.ReactNode
  /** Botones al final de la barra (Buscar) */
  acciones: React.ReactNode
  /** Cuántos filtros del panel están aplicados */
  activos: number
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {barra}
        <button
          type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}
          className={`boton-secundario ${abierto || activos ? 'border-marca-600 text-marca-700' : ''}`}
        >
          <span aria-hidden>⚙</span> Filtros
          {activos > 0 && <span className="rounded-full bg-marca-600 px-1.5 text-xs font-semibold text-white">{activos}</span>}
          <span aria-hidden className="text-xs">{abierto ? '▴' : '▾'}</span>
        </button>
        {acciones}
      </div>
      <div className={`${abierto ? 'grid' : 'hidden'} mt-3 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4`}>
        {children}
      </div>
    </>
  )
}
