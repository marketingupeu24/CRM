'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'

interface Enlace {
  href: Route
  texto: string
  icono: string
  contador?: { valor: number; estilo: string }
}

interface Grupo {
  titulo: string
  enlaces: Enlace[]
}

export function Navegacion(
  { esAdmin, sinResponder = 0, pendientes = 0 }: { esAdmin: boolean; sinResponder?: number; pendientes?: number },
) {
  const ruta = usePathname()
  const grupos: Grupo[] = [
    {
      titulo: 'Trabajo diario',
      enlaces: [
        { href: '/pendientes', texto: 'Pendientes', icono: '☑', contador: { valor: pendientes, estilo: 'bg-amber-500 text-white' } },
        { href: '/chats', texto: 'Chats', icono: '✉', contador: { valor: sinResponder, estilo: 'bg-rose-500 text-white' } },
        { href: '/leads', texto: 'Leads', icono: '☰' },
        { href: '/kanban', texto: 'Kanban', icono: '▦' },
        { href: '/leads/nuevo', texto: 'Registrar lead', icono: '+' },
      ],
    },
    { titulo: 'Análisis', enlaces: [{ href: '/dashboard', texto: 'Dashboard', icono: '◔' }] },
    ...(esAdmin
      ? [{
          titulo: 'Administración',
          enlaces: [
            { href: '/usuarios' as Route, texto: 'Asesores y usuarios', icono: '◉' },
            { href: '/respuestas' as Route, texto: 'Respuestas rápidas', icono: '⚡' },
          ],
        }]
      : []),
    { titulo: 'Cuenta', enlaces: [{ href: '/cuenta', texto: 'Mi cuenta', icono: '⚙' }] },
  ]

  // El enlace activo es el de ruta más larga que coincide (/leads/nuevo gana a /leads)
  const activo = grupos.flatMap((g) => g.enlaces)
    .filter((e) => ruta === e.href || ruta.startsWith(e.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-5" aria-label="Menú principal">
      {grupos.map((g) => (
        <div key={g.titulo} className="flex gap-1 md:flex-col md:gap-0.5">
          <p className="hidden px-3 pb-1 text-[11px] font-semibold tracking-wider text-lateral-texto/70 uppercase md:block">{g.titulo}</p>
          {g.enlaces.map((e) => {
            const esActivo = activo === e.href
            return (
              <Link
                key={e.href}
                href={e.href}
                aria-current={esActivo ? 'page' : undefined}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                  esActivo ? 'bg-lateral-activo text-white' : 'text-lateral-texto hover:bg-white/5 hover:text-white'
                }`}
              >
                {esActivo && <span aria-hidden className="absolute inset-y-1.5 left-0 hidden w-1 rounded-r bg-marca-600 md:block" />}
                <span aria-hidden className="w-4 text-center">{e.icono}</span>
                {e.texto}
                {!!e.contador?.valor && (
                  <span className={`ml-auto min-w-5 rounded-full px-1.5 text-center text-xs font-semibold ${e.contador.estilo}`}>
                    {e.contador.valor}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
