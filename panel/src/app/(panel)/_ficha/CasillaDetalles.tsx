'use client'

// Casilla del botón "📋 Detalles": recuerda (cookie) si el panel quedó abierto o cerrado,
// para que la siguiente conversación se abra igual.
import { COOKIE_DETALLES } from '@/lib/bandeja'

export function CasillaDetalles({ marcada }: { marcada: boolean }) {
  return (
    <input
      type="checkbox" id="alternar-detalles" className="sr-only" defaultChecked={marcada}
      onChange={(e) => { document.cookie = `${COOKIE_DETALLES}=${e.target.checked ? '1' : '0'}; path=/; max-age=31536000; samesite=lax` }}
    />
  )
}
