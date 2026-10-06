'use client'

// Modal propio del sistema para confirmar acciones (eliminar, papelera…) y mostrar avisos.
// Reemplaza a confirm() y alert() del navegador, que rompen el diseño del panel.
//   const confirmar = useConfirmar()
//   if (await confirmar({ titulo: '¿Eliminar la nota?', peligro: true })) { … }
//   const avisar = useAviso();  avisar('No se pudo guardar.')
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface OpcionesConfirmacion {
  titulo: string
  mensaje?: React.ReactNode
  /** Texto del botón principal (por defecto "Confirmar") */
  confirmar?: string
  /** Texto del botón para cerrar (por defecto "Cancelar") */
  cancelar?: string
  /** Acción destructiva: botón rojo */
  peligro?: boolean
}

interface Pedido extends OpcionesConfirmacion {
  soloAviso?: boolean
  resolver: (ok: boolean) => void
}

const Contexto = createContext<((o: OpcionesConfirmacion & { soloAviso?: boolean }) => Promise<boolean>) | null>(null)

export function ProveedorConfirmacion({ children }: { children: React.ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const dialogo = useRef<HTMLDialogElement>(null)
  const principal = useRef<HTMLButtonElement>(null)

  const pedir = useCallback((o: OpcionesConfirmacion & { soloAviso?: boolean }) =>
    new Promise<boolean>((resolver) => setPedido({ ...o, resolver })), [])

  useEffect(() => {
    const d = dialogo.current
    if (!d) return
    if (pedido && !d.open) {
      d.showModal()
      // En acciones peligrosas el foco va a "Cancelar": Enter no borra por accidente
      setTimeout(() => (pedido.peligro ? d.querySelector<HTMLButtonElement>('[data-cancelar]') : principal.current)?.focus(), 0)
    } else if (!pedido && d.open) {
      d.close()
    }
  }, [pedido])

  function cerrar(ok: boolean) {
    pedido?.resolver(ok)
    setPedido(null)
  }

  return (
    <Contexto.Provider value={pedir}>
      {children}
      <dialog
        ref={dialogo}
        onCancel={(e) => { e.preventDefault(); cerrar(false) }}
        onClick={(e) => { if (e.target === e.currentTarget) cerrar(false) }}
        aria-labelledby="confirmacion-titulo"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-superficie p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-[2px]"
      >
        {pedido && (
          <div className="p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
                  pedido.peligro ? 'bg-rose-50 text-rose-600' : pedido.soloAviso ? 'bg-amber-50 text-amber-600' : 'bg-marca-50 text-marca-600'
                }`}
              >
                {pedido.peligro ? '🗑' : pedido.soloAviso ? '!' : '?'}
              </span>
              <div className="min-w-0">
                <h2 id="confirmacion-titulo" className="text-base font-semibold text-slate-900">{pedido.titulo}</h2>
                {pedido.mensaje && <div className="mt-1.5 text-sm text-slate-600">{pedido.mensaje}</div>}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {!pedido.soloAviso && (
                <button type="button" data-cancelar onClick={() => cerrar(false)} className="boton-secundario">
                  {pedido.cancelar ?? 'Cancelar'}
                </button>
              )}
              <button
                ref={principal}
                type="button"
                onClick={() => cerrar(true)}
                className={pedido.peligro ? 'boton bg-rose-600 hover:bg-rose-700' : 'boton'}
              >
                {pedido.confirmar ?? (pedido.soloAviso ? 'Entendido' : 'Confirmar')}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </Contexto.Provider>
  )
}

/** Pide confirmación con el modal del sistema. Resuelve true si la persona acepta. */
export function useConfirmar() {
  const pedir = useContext(Contexto)
  if (!pedir) throw new Error('useConfirmar requiere <ProveedorConfirmacion>')
  return useCallback((o: OpcionesConfirmacion) => pedir(o), [pedir])
}

/** Muestra un aviso (error o información) con el modal del sistema. */
export function useAviso() {
  const pedir = useContext(Contexto)
  if (!pedir) throw new Error('useAviso requiere <ProveedorConfirmacion>')
  return useCallback((mensaje: string, titulo = 'No se pudo completar') => pedir({ titulo, mensaje, soloAviso: true }).then(() => undefined), [pedir])
}
