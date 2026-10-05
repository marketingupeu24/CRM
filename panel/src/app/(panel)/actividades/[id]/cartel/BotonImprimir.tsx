'use client'

export function BotonImprimir() {
  return <button onClick={() => window.print()} className="boton">🖨 Imprimir</button>
}
