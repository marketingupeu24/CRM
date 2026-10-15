'use client'

// Menú del celular: botón ☰ en la barra superior que abre el menú completo desde la izquierda.
// También se abre desde la barra inferior (botón "Menú"): window.dispatchEvent(new Event('abrir-menu')).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export const abrirMenuMovil = () => window.dispatchEvent(new Event('abrir-menu'))

export function MenuMovil({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const abrir = () => setAbierto(true)
    window.addEventListener('abrir-menu', abrir)
    return () => window.removeEventListener('abrir-menu', abrir)
  }, [])

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('keydown', cerrar)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', cerrar); document.body.style.overflow = '' }
  }, [abierto])

  return (
    <>
      <button
        type="button" onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl text-slate-600 hover:bg-slate-100 md:hidden"
      >
        ☰
      </button>
      {/* En el body: la barra superior tiene desenfoque y encerraría al menú */}
      {abierto && createPortal(
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setAbierto(false)} />
          <div
            className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col overflow-y-auto bg-lateral px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-xl"
            // Tocar un enlace del menú lo cierra
            onClick={(e) => { if ((e.target as Element).closest('a')) setAbierto(false) }}
          >
            <button
              type="button" onClick={() => setAbierto(false)} aria-label="Cerrar menú"
              className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-lg text-slate-500 hover:bg-slate-100"
            >
              ✕
            </button>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
