'use client'

import { abrirBuscador } from './PaletaComandos'

/** Botón del menú que abre el buscador rápido (mismo efecto que Ctrl + K). */
export function BotonBuscar() {
  return (
    <button
      onClick={abrirBuscador}
      className="mb-4 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-lateral-texto transition hover:border-white/20 hover:text-white md:mb-6"
    >
      <span aria-hidden>⌕</span>
      <span className="flex-1">Buscar…</span>
      <kbd className="rounded border border-white/15 px-1.5 font-mono text-[10px]">Ctrl K</kbd>
    </button>
  )
}
