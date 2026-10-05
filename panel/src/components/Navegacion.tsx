'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import type { Modulo } from '@crm/db'

interface Enlace {
  href: Route
  texto: string
  icono: string
  /** Módulo que habilita el enlace; sin módulo = siempre visible. */
  modulo?: Modulo
  soloSuperadmin?: boolean
  contador?: { valor: number; estilo: string }
}

interface Grupo {
  titulo: string
  enlaces: Enlace[]
}

export function Navegacion(
  { permisos, superadmin = false, sinResponder = 0, pendientes = 0, revisionBot = 0 }:
  { permisos: Modulo[]; superadmin?: boolean; sinResponder?: number; pendientes?: number; revisionBot?: number },
) {
  const ruta = usePathname()
  const todos: Grupo[] = [
    {
      titulo: 'Trabajo diario',
      enlaces: [
        { href: '/pendientes', texto: 'Pendientes', icono: '☑', modulo: 'pendientes', contador: { valor: pendientes, estilo: 'bg-amber-500 text-white' } },
        { href: '/chats', texto: 'Chats', icono: '✉', modulo: 'chats', contador: { valor: sinResponder, estilo: 'bg-rose-500 text-white' } },
        { href: '/leads', texto: 'Leads', icono: '☰', modulo: 'leads' },
        { href: '/kanban', texto: 'Kanban', icono: '▦', modulo: 'kanban' },
        { href: '/leads/nuevo', texto: 'Registrar lead', icono: '+', modulo: 'registrar' },
        { href: '/costos' as Route, texto: 'Proformas', icono: '💰', modulo: 'costos' },
        { href: '/actividades' as Route, texto: 'Actividades y QR', icono: '🎪', modulo: 'actividades' },
      ],
    },
    {
      titulo: 'Análisis',
      enlaces: [
        { href: '/dashboard', texto: 'Dashboard', icono: '◔', modulo: 'dashboard' },
        { href: '/campanas', texto: 'Campañas', icono: '📣', modulo: 'campanas' },
      ],
    },
    {
      titulo: 'Genesys (bot)',
      enlaces: [
        { href: '/conocimiento' as Route, texto: 'Base de conocimiento', icono: '📚' },
        { href: '/revision-bot' as Route, texto: 'Revisión del bot', icono: '🤖', modulo: 'conocimiento', contador: { valor: revisionBot, estilo: 'bg-violet-500 text-white' } },
      ],
    },
    {
      titulo: 'Administración',
      enlaces: [
        { href: '/usuarios', texto: 'Asesores y usuarios', icono: '◉', modulo: 'usuarios' },
        { href: '/permisos' as Route, texto: 'Módulos y permisos', icono: '🔐', soloSuperadmin: true },
        { href: '/respuestas', texto: 'Respuestas rápidas', icono: '⚡', modulo: 'respuestas' },
        { href: '/papelera', texto: 'Papelera', icono: '🗑', modulo: 'papelera' },
      ],
    },
    { titulo: 'Cuenta', enlaces: [{ href: '/cuenta', texto: 'Mi cuenta', icono: '⚙' }] },
  ]
  const grupos = todos
    .map((g) => ({
      ...g,
      enlaces: g.enlaces.filter((e) => (e.soloSuperadmin ? superadmin : !e.modulo || permisos.includes(e.modulo))),
    }))
    .filter((g) => g.enlaces.length)

  // El enlace activo es el de ruta más larga que coincide (/leads/nuevo gana a /leads)
  const activo = grupos.flatMap((g) => g.enlaces)
    .filter((e) => ruta === e.href || ruta.startsWith(e.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-5" aria-label="Menú principal">
      {grupos.map((g) => (
        <div key={g.titulo} className="flex gap-1 md:flex-col md:gap-0.5">
          <p className="hidden px-3 pb-1 text-xs font-medium tracking-wide text-lateral-suave uppercase md:block">{g.titulo}</p>
          {g.enlaces.map((e) => {
            const esActivo = activo === e.href
            return (
              <Link
                key={e.href}
                href={e.href}
                aria-current={esActivo ? 'page' : undefined}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                  esActivo ? 'bg-lateral-activo text-lateral-activo-texto' : 'text-lateral-texto hover:bg-lateral-hover'
                }`}
              >
                <span aria-hidden className={`w-5 text-center text-base ${esActivo ? '' : 'text-lateral-suave'}`}>{e.icono}</span>
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
