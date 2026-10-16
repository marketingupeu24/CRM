'use client'

// Acciones rápidas de la ficha: contactar al lead y saltar a cada sección sin hacer scroll.
// "barra": fila arriba del chat (celular, tablet y laptop). "riel": columna de íconos a la izquierda del chat
// en pantallas grandes (como el panel de actividades de HubSpot); al pasar el mouse se despliegan los nombres.
import Link from 'next/link'
import { useState } from 'react'

function irA(id: string, enfocar?: string) {
  const pestana = document.getElementById(id === 'chat' ? 'pestana-chat' : 'pestana-detalles') as HTMLInputElement | null
  if (pestana && pestana.offsetParent !== null) pestana.checked = true
  const seccion = document.getElementById(id)
  seccion?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (enfocar) setTimeout(() => seccion?.querySelector<HTMLElement>(enfocar)?.focus(), 350)
}

interface Accion {
  icono: React.ReactNode
  texto: string
  titulo?: string
  href?: string
  externo?: boolean
  alHacer?: () => void
  /** Línea divisoria antes de esta acción */
  separar?: boolean
}

export function AccionesRapidas({ telefono, proformaHref, variante = 'barra', alFinal }: {
  telefono: string; proformaHref?: string; variante?: 'barra' | 'riel'
  /** Solo en el riel: acción al final, separada (ej. enviar a la papelera) */
  alFinal?: React.ReactNode
}) {
  const [copiado, setCopiado] = useState(false)
  const acciones: Accion[] = [
    { icono: <span className="text-emerald-600">●</span>, texto: 'WhatsApp', titulo: 'Abrir en WhatsApp', href: `https://wa.me/${telefono}`, externo: true },
    { icono: '📞', texto: 'Llamar', href: `tel:+${telefono}` },
    {
      icono: copiado ? '✓' : '⧉', texto: copiado ? 'Copiado' : 'Copiar celular',
      alHacer: async () => { try { await navigator.clipboard.writeText(telefono); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* sin portapapeles */ } },
    },
    { icono: '✉', texto: 'Responder', alHacer: () => irA('chat', 'textarea'), separar: true },
    { icono: '📅', texto: 'Agendar', alHacer: () => irA('proxima-accion', 'input') },
    { icono: '📝', texto: 'Nota', alHacer: () => irA('nueva-nota', 'textarea') },
    { icono: '✏️', texto: 'Editar datos', alHacer: () => window.dispatchEvent(new Event('crm:editar-datos')) },
    ...(proformaHref ? [{ icono: '💰', texto: 'Proforma', titulo: 'Calcular costos y enviar la proforma por el chat', href: proformaHref }] : []),
  ]

  if (variante === 'riel') {
    const item = 'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium whitespace-nowrap text-slate-700 transition hover:bg-slate-100 hover:text-marca-700'
    return (
      // El espacio del riel es fijo; al desplegarse se superpone al chat sin moverlo
      <div className="relative w-14">
        <nav
          aria-label="Acciones rápidas"
          className="absolute top-0 left-0 z-20 flex w-14 flex-col gap-0.5 overflow-hidden rounded-2xl border border-slate-200 bg-superficie p-1.5 shadow-theme-xs transition-[width,box-shadow] duration-150 hover:w-56 hover:shadow-lg focus-within:w-56 focus-within:shadow-lg"
        >
          {acciones.map((a) => {
            const contenido = <><span aria-hidden className="w-7 shrink-0 text-center text-lg leading-none">{a.icono}</span><span>{a.texto}</span></>
            return (
              <div key={a.texto} className={a.separar ? 'mt-1 border-t border-slate-100 pt-1' : ''}>
                {a.href
                  ? (a.externo
                    ? <a href={a.href} target="_blank" rel="noreferrer" title={a.titulo ?? a.texto} className={item}>{contenido}</a>
                    : a.href.startsWith('/')
                      ? <Link href={a.href as `/costos?${string}`} title={a.titulo ?? a.texto} className={item}>{contenido}</Link>
                      : <a href={a.href} title={a.titulo ?? a.texto} className={item}>{contenido}</a>)
                  : <button type="button" onClick={a.alHacer} title={a.titulo ?? a.texto} className={item}>{contenido}</button>}
              </div>
            )
          })}
          {alFinal && <div className="mt-1 border-t border-slate-100 pt-1">{alFinal}</div>}
        </nav>
      </div>
    )
  }

  const boton = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-superficie px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-marca-600 hover:text-marca-700 max-md:gap-1 max-md:px-2.5 max-md:py-1 max-md:text-xs'
  return (
    <div className="sticky top-14 z-20 -mx-4 flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50/90 px-4 py-2 backdrop-blur max-md:static max-md:gap-1.5 max-md:py-1.5 sm:flex-wrap md:top-16 md:-mx-8 md:px-8">
      {acciones.map((a) => {
        const contenido = <><span aria-hidden>{a.icono}</span> {a.texto}</>
        return (
          <span key={a.texto} className="contents">
            {a.separar && <span className="mx-1 hidden h-5 w-px bg-slate-300 sm:block" />}
            {a.href
              ? (a.externo
                ? <a href={a.href} target="_blank" rel="noreferrer" className={boton} title={a.titulo}>{contenido}</a>
                : a.href.startsWith('/')
                  ? <Link href={a.href as `/costos?${string}`} className={boton} title={a.titulo}>{contenido}</Link>
                  : <a href={a.href} className={boton} title={a.titulo}>{contenido}</a>)
              : <button type="button" className={boton} onClick={a.alHacer} title={a.titulo}>{contenido}</button>}
          </span>
        )
      })}
    </div>
  )
}
