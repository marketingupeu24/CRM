'use client'

// Barra inferior del celular: lo del trabajo diario a un toque. "Menú" abre el menú completo.
import Link from '@/components/Enlace'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import type { Modulo } from '@crm/db'
import { abrirMenuMovil } from './MenuMovil'

export function BarraInferior({ permisos, sinResponder = 0, pendientes = 0 }: { permisos: Modulo[]; sinResponder?: number; pendientes?: number }) {
  const ruta = usePathname()
  const items: { href: Route; texto: string; icono: string; modulo: Modulo; contador?: number; estilo?: string }[] = [
    { href: '/pendientes', texto: 'Pendientes', icono: '☑', modulo: 'pendientes', contador: pendientes, estilo: 'bg-amber-500' },
    { href: '/chats', texto: 'Chats', icono: '✉', modulo: 'chats', contador: sinResponder, estilo: 'bg-rose-500' },
    { href: '/leads', texto: 'Leads', icono: '☰', modulo: 'leads' },
    { href: '/leads/nuevo', texto: 'Registrar', icono: '＋', modulo: 'registrar' },
  ]
  const visibles = items.filter((i) => permisos.includes(i.modulo))
  // El activo es el de ruta más larga que coincide (/leads/nuevo gana a /leads)
  const activo = visibles.filter((i) => ruta === i.href || ruta.startsWith(i.href + '/')).sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav
      aria-label="Accesos rápidos"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {visibles.map((i) => (
        <Link
          key={i.href} href={i.href} aria-current={activo === i.href ? 'page' : undefined}
          className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${activo === i.href ? 'text-marca-700' : 'text-slate-500'}`}
        >
          <span aria-hidden className="text-lg leading-6">{i.icono}</span>
          {i.texto}
          {!!i.contador && (
            <span className={`absolute top-1 left-1/2 ml-2 min-w-5 rounded-full px-1 text-center text-[10px] leading-4 font-semibold text-white ${i.estilo}`}>
              {i.contador > 99 ? '99+' : i.contador}
            </span>
          )}
        </Link>
      ))}
      <button type="button" onClick={abrirMenuMovil} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500">
        <span aria-hidden className="text-lg leading-6">⋯</span>
        Menú
      </button>
    </nav>
  )
}
