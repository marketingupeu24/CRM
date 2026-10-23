'use client'

// Celular y tablet: botón que abre desde abajo la bandeja de conversaciones (la misma de pantallas grandes),
// para pasar de un cliente a otro sin volver a Chats.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ListaConversaciones, type Conversacion, type PropsBandeja } from './ListaConversaciones'

export function BandejaMovil(props: PropsBandeja & { conversaciones: Conversacion[] }) {
  const { conversaciones, actualId } = props
  const [abierta, setAbierta] = useState(false)
  const pendientes = conversaciones.filter((c) => c.sinResponder && c.id !== actualId).length

  useEffect(() => {
    if (!abierta) return
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false) }
    document.addEventListener('keydown', cerrar)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', cerrar); document.body.style.overflow = '' }
  }, [abierta])

  return (
    <>
      <button
        type="button" onClick={() => setAbierta(true)} aria-label="Conversaciones" title="Conversaciones"
        className="relative ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-superficie px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 xl:hidden"
      >
        💬<span className="max-sm:hidden">Conversaciones</span>
        {pendientes > 0 && (
          <span className="rounded-full bg-rose-500 px-1.5 text-[11px] leading-4 font-semibold text-white" title="Escribieron y esperan respuesta">{pendientes}</span>
        )}
      </button>
      {abierta && createPortal(
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Conversaciones">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setAbierta(false)} />
          <div
            className="absolute inset-x-0 bottom-0 flex h-[85dvh] flex-col rounded-t-2xl bg-slate-50 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-xl"
            // Elegir una conversación cierra la bandeja
            onClick={(e) => { if ((e.target as Element).closest('a')) setAbierta(false) }}
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="mx-auto h-1.5 w-10 rounded-full bg-slate-300" aria-hidden />
            </div>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="font-semibold">💬 Conversaciones</h2>
              <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200">✕</button>
            </div>
            <ListaConversaciones {...props} />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
