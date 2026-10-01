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
    <div className="flex rounded-full border border-slate-200 bg-slate-100 p-0.5" role="radiogroup" aria-label="Tema">
      {OPCIONES.map((o) => (
        <button
          key={o.valor} role="radio" aria-checked={tema === o.valor} title={o.texto} onClick={() => elegir(o.valor)}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${tema === o.valor ? 'bg-superficie text-marca-600 shadow-theme-xs' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <span aria-hidden>{o.icono}</span> <span className="sr-only">{o.texto}</span>
        </button>
      ))}
    </div>
  )
}
