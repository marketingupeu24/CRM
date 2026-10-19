'use client'

// Chats: elegir de quién son los chats (todo el equipo, los míos o un asesor) y Todos / Sin responder.
// La elección se recuerda (cookie): la misma vista sale en la lista de Chats y en la bandeja de la ficha.
// En pantallas grandes, entrar a Chats abre directo la última conversación (vista tipo bandeja).
import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { guardarPreferencia, type PreferenciaBandeja } from '@/lib/bandeja'

export function VistaChats({ preferencia, asesores, miId, veTodos, sinResponder }: {
  preferencia: PreferenciaBandeja
  asesores: { id: string; nombre: string }[]
  miId: string
  veTodos: boolean
  sinResponder: number
}) {
  const router = useRouter()
  const [cargando, iniciar] = useTransition()
  const cambiar = (p: PreferenciaBandeja) => { guardarPreferencia(p); iniciar(() => { router.replace('/chats'); router.refresh() }) }
  const boton = (activo: boolean) => `rounded-lg px-3 py-1.5 ${activo ? 'bg-marca-600 text-white' : 'border border-slate-300 bg-superficie text-slate-700 hover:bg-slate-50'}`

  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${cargando ? 'opacity-60' : ''}`}>
      {veTodos && (
        <select
          value={preferencia.de === miId ? 'mios' : preferencia.de} disabled={cargando} aria-label="Chats de"
          onChange={(e) => cambiar({ ...preferencia, de: e.target.value })} className="campo w-auto py-1.5"
        >
          <option value="todos">👥 Chats de todo el equipo</option>
          <option value="mios">🙋 Solo los míos</option>
          {asesores.filter((a) => a.id !== miId).map((a) => <option key={a.id} value={a.id}>👤 {a.nombre}</option>)}
        </select>
      )}
      <button type="button" onClick={() => cambiar({ ...preferencia, filtro: 'todos' })} className={boton(preferencia.filtro === 'todos')}>Todos</button>
      <button type="button" onClick={() => cambiar({ ...preferencia, filtro: 'sin_responder' })} className={`inline-flex items-center gap-1.5 ${boton(preferencia.filtro === 'sin_responder')}`}>
        Sin responder
        {sinResponder > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-xs text-white">{sinResponder}</span>}
      </button>
    </div>
  )
}

/** Pantallas grandes (1280 px o más): Chats abre directo la última conversación en la vista tipo bandeja. */
export function AbrirUltimoChat({ leadId }: { leadId: string | null }) {
  const router = useRouter()
  useEffect(() => {
    if (leadId && window.matchMedia('(min-width: 1280px)').matches) router.replace(`/leads/${leadId}`)
  }, [leadId, router])
  return null
}
