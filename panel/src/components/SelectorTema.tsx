'use client'

// Tema del panel: Claro / Oscuro / Automático (sigue al sistema). Se recuerda en este navegador (cookie).
import { useState } from 'react'
import { atributoTema, COOKIE_TEMA, type Tema } from '@/lib/tema'

const OPCIONES: { valor: Tema; icono: string; texto: string }[] = [
  { valor: 'claro', icono: '☀', texto: 'Claro' },
  { valor: 'oscuro', icono: '☾', texto: 'Oscuro' },
  { valor: 'auto', icono: '◐', texto: 'Auto' },
]

export function SelectorTema({ inicial }: { inicial: Tema }) {
  const [tema, setTema] = useState<Tema>(inicial)

  const elegir = (valor: Tema) => {
    setTema(valor)
    document.cookie = `${COOKIE_TEMA}=${valor}; path=/; max-age=31536000; samesite=lax`
    const atributo = atributoTema(valor)
    if (atributo) document.documentElement.dataset.theme = atributo
    else delete document.documentElement.dataset.theme
  }

  return (
    <div className="flex rounded-lg bg-white/5 p-0.5" role="radiogroup" aria-label="Tema">
      {OPCIONES.map((o) => (
        <button
          key={o.valor} role="radio" aria-checked={tema === o.valor} title={o.texto} onClick={() => elegir(o.valor)}
          className={`flex-1 rounded-md px-2 py-1 text-xs transition ${tema === o.valor ? 'bg-lateral-activo text-white shadow' : 'text-lateral-texto hover:text-white'}`}
        >
          <span aria-hidden>{o.icono}</span> <span className="sr-only md:not-sr-only">{o.texto}</span>
        </button>
      ))}
    </div>
  )
}
