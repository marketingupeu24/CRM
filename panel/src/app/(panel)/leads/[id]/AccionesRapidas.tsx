'use client'

// Barra de acciones rápidas de la ficha: contactar al lead y saltar a cada sección sin hacer scroll.
import { useState } from 'react'

function irA(id: string, enfocar?: string) {
  const seccion = document.getElementById(id)
  seccion?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (enfocar) setTimeout(() => seccion?.querySelector<HTMLElement>(enfocar)?.focus(), 350)
}

export function AccionesRapidas({ telefono }: { telefono: string }) {
  const [copiado, setCopiado] = useState(false)
  const boton = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-superficie px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-marca-600 hover:text-marca-700'

  return (
    <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/90 px-4 py-2 backdrop-blur md:-mx-8 md:px-8">
      <a href={`https://wa.me/${telefono}`} target="_blank" rel="noreferrer" className={boton} title="Abrir en WhatsApp">
        <span aria-hidden className="text-emerald-600">●</span> WhatsApp
      </a>
      <a href={`tel:+${telefono}`} className={boton} title="Llamar">📞 Llamar</a>
      <button
        className={boton}
        onClick={async () => {
          try { await navigator.clipboard.writeText(telefono); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* sin portapapeles */ }
        }}
      >
        {copiado ? '✓ Copiado' : '⧉ Copiar celular'}
      </button>
      <span className="mx-1 hidden h-5 w-px bg-slate-300 sm:block" />
      <button className={boton} onClick={() => irA('chat', 'textarea')}>✉ Responder</button>
      <button className={boton} onClick={() => irA('proxima-accion', 'input')}>📅 Agendar</button>
      <button className={boton} onClick={() => irA('nueva-nota', 'textarea')}>📝 Nota</button>
    </div>
  )
}
