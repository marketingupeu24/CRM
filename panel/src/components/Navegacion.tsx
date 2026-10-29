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
  { permisos, superadmin = false, sinResponder = 0, pendientes = 0, revisionBot = 0, promptVencido = 0, compacto = false }:
  { permisos: Modulo[]; superadmin?: boolean; sinResponder?: number; pendientes?: number; revisionBot?: number; promptVencido?: number
    /** Solo íconos (menú plegado): el nombre aparece al pasar el mouse */
    compacto?: boolean },
) {
  const ruta = usePathname()
  const todos: Grupo[] = [
    {
      titulo: 'Trabajo diario',
      enlaces: [
        { href: '/pendientes', texto: 'Pendientes', icono: '☑', modulo: 'pendientes', contador: { valor: pendientes, estilo: 'bg-amber-500 text-white' } },
        { href: '/chats', texto: 'Chats', icono: '✉', modulo: 'chats', contador: { valor: sinResponder, estilo: 'bg-rose-500 text-white' } },
        { href: '/respuestas', texto: 'Respuestas rápidas', icono: '⚡', modulo: 'chats' },
        { href: '/leads', texto: 'Leads', icono: '☰', modulo: 'leads' },
        { href: '/kanban', texto: 'Kanban', icono: '▦', modulo: 'kanban' },
        { href: '/leads/nuevo', texto: 'Registrar lead', icono: '+', modulo: 'registrar' },
        { href: '/costos' as Route, texto: 'Proformas', icono: '💰', modulo: 'costos' },
        { href: '/actividades' as Route, texto: 'Actividades y QR', icono: '🎪', modulo: 'actividades' },
        { href: '/qr' as Route, texto: 'Mi QR (presencial)', icono: '🔳', modulo: 'qr_asesor' },
      ],
    },
    {
      titulo: 'Análisis',
      enlaces: [
        { href: '/dashboard', texto: 'Dashboard', icono: '◔', modulo: 'dashboard' },
        { href: '/procedencia' as Route, texto: 'Procedencia', icono: '📍', modulo: 'dashboard' },
        { href: '/reasignaciones' as Route, texto: 'Reasignaciones', icono: '🔁', modulo: 'dashboard' },
        { href: '/campanas', texto: 'Campañas', icono: '📣', modulo: 'campanas' },
        { href: '/enlaces' as Route, texto: 'Enlaces y QR por medio', icono: '🔗', modulo: 'campanas' },
        { href: '/puntaje' as Route, texto: 'Puntaje de interés', icono: '🔥', modulo: 'leads' },
        { href: '/conversaciones-iniciadas' as Route, texto: 'Conversaciones iniciadas', icono: '💬', soloSuperadmin: true },
      ],
    },
    {
      titulo: 'Genesys (bot)',
      enlaces: [
        { href: '/genesys' as Route, texto: 'Prompt de Genesys', icono: '📚', contador: { valor: promptVencido, estilo: 'bg-rose-500 text-white' } },
        { href: '/revision-bot' as Route, texto: 'Revisión del bot', icono: '🤖', modulo: 'conocimiento', contador: { valor: revisionBot, estilo: 'bg-violet-500 text-white' } },
        { href: '/flujos-bot' as Route, texto: 'Flujos de BuilderBot', icono: '🧩', modulo: 'conocimiento' },
        { href: '/recordatorios' as Route, texto: 'Recordatorios a alumnos', icono: '⏰', modulo: 'conocimiento' },
      ],
    },
    {
      titulo: 'Administración',
      enlaces: [
        { href: '/usuarios', texto: 'Asesores y usuarios', icono: '◉', modulo: 'usuarios' },
        { href: '/permisos' as Route, texto: 'Módulos y permisos', icono: '🔐', soloSuperadmin: true },
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
    <nav className={`flex flex-col ${compacto ? 'gap-3' : 'gap-5'}`} aria-label="Menú principal">
      {grupos.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-0.5">
          {compacto
            ? <hr className="mx-2 mb-1 border-lateral-borde first:hidden" />
            : <p className="px-3 pb-1 text-xs font-medium tracking-wide text-lateral-suave uppercase">{g.titulo}</p>}
          {g.enlaces.map((e) => {
            const esActivo = activo === e.href
            return (
              <Link
                key={e.href}
                href={e.href}
                aria-current={esActivo ? 'page' : undefined}
                title={compacto ? e.texto : undefined}
                className={`relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium whitespace-nowrap transition ${compacto ? 'justify-center px-0' : 'px-3'} ${
                  esActivo ? 'bg-lateral-activo text-lateral-activo-texto' : 'text-lateral-texto hover:bg-lateral-hover'
                }`}
              >
                <span aria-hidden className={`w-5 text-center text-base ${esActivo ? '' : 'text-lateral-suave'}`}>{e.icono}</span>
                <span className={compacto ? 'sr-only' : ''}>{e.texto}</span>
                {!!e.contador?.valor && (
                  <span className={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold ${compacto ? 'absolute -top-0.5 right-0 text-[10px] leading-4' : 'ml-auto'} ${e.contador.estilo}`}>
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
