'use client'

// Buscador rápido (Ctrl + K o "/"): busca leads por nombre, celular o DNI y salta a cualquier página.
// La búsqueda usa la sesión del usuario: el RLS limita los resultados (el asesor solo ve sus leads).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ETIQUETAS_ESTADO, type LeadEstado, type Modulo } from '@crm/db'
import { crearClienteNavegador } from '@/lib/supabase/client'

interface Item {
  id: string
  titulo: string
  detalle?: string
  icono: string
  ir: string
  grupo: 'Leads' | 'Ir a'
  modulo?: Modulo
  soloSuperadmin?: boolean
}

const PAGINAS: Omit<Item, 'id' | 'grupo'>[] = [
  { titulo: 'Pendientes', icono: '☑', ir: '/pendientes', modulo: 'pendientes', detalle: 'Tareas y alertas de seguimiento' },
  { titulo: 'Chats', icono: '✉', ir: '/chats', modulo: 'chats', detalle: 'Conversaciones de WhatsApp' },
  { titulo: 'Leads', icono: '☰', ir: '/leads', modulo: 'leads', detalle: 'Lista con filtros' },
  { titulo: 'Kanban', icono: '▦', ir: '/kanban', modulo: 'kanban', detalle: 'Tablero por estado' },
  { titulo: 'Registrar lead', icono: '+', ir: '/leads/nuevo', modulo: 'registrar', detalle: 'Nuevo lead manual' },
  { titulo: 'Dashboard', icono: '◔', ir: '/dashboard', modulo: 'dashboard', detalle: 'Indicadores y gráficos' },
  { titulo: 'Campañas', icono: '📣', ir: '/campanas', modulo: 'campanas', detalle: 'Resultados y Excel por campaña' },
  { titulo: 'Leads sin responder', icono: '●', ir: '/chats?filtro=sin_responder', modulo: 'chats', detalle: 'Escribieron y esperan respuesta' },
  { titulo: 'Base de conocimiento', icono: '📚', ir: '/conocimiento', detalle: 'Lo que sabe Genesys: carreras, costos, fechas' },
  { titulo: 'Revisión del bot', icono: '🤖', ir: '/revision-bot', detalle: 'Preguntas que Genesys no supo responder', modulo: 'conocimiento' },
  { titulo: 'Mi cuenta', icono: '⚙', ir: '/cuenta', detalle: 'Contraseña' },
]
const PAGINAS_ADMIN: Omit<Item, 'id' | 'grupo'>[] = [
  { titulo: 'Asesores y usuarios', icono: '◉', ir: '/usuarios', modulo: 'usuarios' },
  { titulo: 'Módulos y permisos', icono: '🔐', ir: '/permisos', detalle: 'Qué puede ver cada usuario', soloSuperadmin: true },
  { titulo: 'Respuestas rápidas', icono: '⚡', ir: '/respuestas', modulo: 'respuestas' },
  { titulo: 'Papelera', icono: '🗑', ir: '/papelera', detalle: 'Leads y usuarios eliminados', modulo: 'papelera' },
]

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Abre el buscador desde cualquier botón: window.dispatchEvent(new Event('abrir-buscador')) */
export function abrirBuscador() {
  window.dispatchEvent(new Event('abrir-buscador'))
}

export function PaletaComandos({ permisos, superadmin = false }: { permisos: Modulo[]; superadmin?: boolean }) {
  const router = useRouter()
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState('')
  const [leads, setLeads] = useState<Item[]>([])
  const [seleccion, setSeleccion] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  // Atajos: Ctrl/Cmd + K en cualquier lugar; "/" si no se está escribiendo en un campo
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAbierta((a) => !a) }
      else if (e.key === '/' && !escribiendo) { e.preventDefault(); setAbierta(true) }
    }
    const alPedir = () => setAbierta(true)
    window.addEventListener('keydown', alTeclear)
    window.addEventListener('abrir-buscador', alPedir)
    return () => { window.removeEventListener('keydown', alTeclear); window.removeEventListener('abrir-buscador', alPedir) }
  }, [])

  useEffect(() => {
    if (abierta) { setTexto(''); setLeads([]); setSeleccion(0); setTimeout(() => entrada.current?.focus(), 10) }
  }, [abierta])

  // Búsqueda de leads (con espera breve para no consultar en cada tecla)
  useEffect(() => {
    const q = texto.replace(/[,()*%\\]/g, ' ').trim()
    // Buscar leads requiere el módulo Leads
    if (!abierta || q.length < 2 || !permisos.includes('leads')) { setLeads([]); return }
    setBuscando(true)
    const t = setTimeout(async () => {
      const supabase = crearClienteNavegador()
      const { data } = await supabase.from('leads')
        .select('id, nombre, telefono, dni, estado, carrera_interes')
        .or(`nombre.ilike.*${q}*,telefono.ilike.*${q}*,dni.ilike.*${q}*`)
        .order('ultimo_contacto', { ascending: false }).limit(7)
      setLeads((data ?? []).map((l) => ({
        id: `lead-${l.id}`, grupo: 'Leads', icono: '👤', ir: `/leads/${l.id}`,
        titulo: l.nombre ?? l.telefono,
        detalle: [l.telefono, l.dni ? `DNI ${l.dni}` : null, ETIQUETAS_ESTADO[l.estado as LeadEstado], l.carrera_interes].filter(Boolean).join(' · '),
      })))
      setBuscando(false)
      setSeleccion(0)
    }, 200)
    return () => clearTimeout(t)
  }, [texto, abierta, permisos])

  const items = useMemo(() => {
    const q = normalizar(texto.trim())
    const paginas = [...PAGINAS, ...PAGINAS_ADMIN]
      .filter((p) => (p.soloSuperadmin ? superadmin : !p.modulo || permisos.includes(p.modulo)))
      .filter((p) => !q || normalizar(`${p.titulo} ${p.detalle ?? ''}`).includes(q))
      .map((p, i) => ({ ...p, id: `pag-${i}`, grupo: 'Ir a' as const }))
    return [...leads, ...paginas]
  }, [texto, leads, permisos, superadmin])

  const ir = useCallback((item?: Item) => {
    if (!item) return
    setAbierta(false)
    router.push(item.ir as never)
  }, [router])

  if (!abierta) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setAbierta(false)}>
      <div role="dialog" aria-label="Buscador" className="tarjeta w-full max-w-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <span aria-hidden className="text-slate-400">⌕</span>
          <input
            ref={entrada} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar lead por nombre, celular o DNI… o ir a una página"
            className="h-12 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="Buscar"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSeleccion((s) => Math.min(s + 1, items.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSeleccion((s) => Math.max(s - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); ir(items[seleccion]) }
              else if (e.key === 'Escape') setAbierta(false)
            }}
          />
          {buscando && <span className="text-xs text-slate-400">Buscando…</span>}
          <kbd className="tecla">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {items.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === seleccion}>
              {(i === 0 || items[i - 1]!.grupo !== item.grupo) && (
                <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{item.grupo}</p>
              )}
              <button
                onMouseEnter={() => setSeleccion(i)} onClick={() => ir(item)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === seleccion ? 'bg-marca-50 text-marca-700' : 'text-slate-700'}`}
              >
                <span aria-hidden className="w-5 text-center">{item.icono}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.titulo}</span>
                  {item.detalle && <span className="block truncate text-xs text-slate-500">{item.detalle}</span>}
                </span>
                {i === seleccion && <kbd className="tecla">Enter</kbd>}
              </button>
            </li>
          ))}
          {!items.length && (
            <li className="px-3 py-8 text-center text-sm text-slate-500">
              {texto.trim().length < 2 ? 'Escribe al menos 2 letras' : 'Sin resultados'}
            </li>
          )}
        </ul>
        <div className="flex gap-4 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">
          <span><kbd className="tecla">↑</kbd> <kbd className="tecla">↓</kbd> moverse</span>
          <span><kbd className="tecla">Enter</kbd> abrir</span>
          <span><kbd className="tecla">Ctrl</kbd> + <kbd className="tecla">K</kbd> o <kbd className="tecla">/</kbd> buscar</span>
        </div>
      </div>
    </div>
  )
}
