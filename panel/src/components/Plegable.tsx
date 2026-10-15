'use client'

// En el celular esconde un bloque (por ejemplo, los filtros) detrás de un botón; en pantallas grandes siempre se ve.
// Sus hijos participan del grid del padre (display: contents).
import { useState } from 'react'

export function Plegable({ texto, children, botonClassName = '' }: { texto: string; children: React.ReactNode; botonClassName?: string }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button
        type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}
        className={`boton-secundario md:hidden ${botonClassName}`}
      >
        {abierto ? `▴ Ocultar ${texto.toLowerCase()}` : `▾ ${texto}`}
      </button>
      <div className={`${abierto ? 'contents' : 'hidden'} md:contents`}>{children}</div>
    </>
  )
}
