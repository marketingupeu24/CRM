'use client'

import { abrirBuscador } from './PaletaComandos'

/** Campo de búsqueda de la barra superior (abre el buscador rápido). */
export function BotonBuscar() {
  return (
    <button
      onClick={abrirBuscador}
      className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-left text-sm text-slate-400 shadow-theme-xs transition hover:border-slate-300"
    >
      <span aria-hidden className="text-base">⌕</span>
      <span className="flex-1 truncate">Buscar lead por nombre, celular o DNI…</span>
      <kbd className="tecla hidden sm:inline">Ctrl K</kbd>
    </button>
  )
}
