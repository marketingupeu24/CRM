'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'

interface Enlace {
  href: Route
  texto: string
  icono: string
}

export function Navegacion({ esAdmin }: { esAdmin: boolean }) {
  const ruta = usePathname()
  const enlaces: Enlace[] = [
    { href: '/dashboard', texto: 'Dashboard', icono: '◔' },
    { href: '/leads', texto: 'Leads', icono: '☰' },
    { href: '/kanban', texto: 'Kanban', icono: '▦' },
    { href: '/leads/nuevo', texto: 'Registrar lead', icono: '+' },
    ...(esAdmin ? [{ href: '/usuarios' as Route, texto: 'Asesores y usuarios', icono: '◉' }] : []),
    { href: '/cuenta', texto: 'Mi cuenta', icono: '⚙' },
  ]

  // El enlace activo es el de ruta más larga que coincide (/leads/nuevo gana a /leads)
  const activo = enlaces
    .filter((e) => ruta === e.href || ruta.startsWith(e.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {enlaces.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
            activo === e.href ? 'bg-white/15 text-white' : 'text-marca-100 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span aria-hidden className="w-4 text-center">{e.icono}</span>
          {e.texto}
        </Link>
      ))}
    </nav>
  )
}
