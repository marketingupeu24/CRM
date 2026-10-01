'use client'

// Avisos cuando un lead escribe: sonido + notificación del navegador (aunque estés en otra pestaña).
// Recibe los eventos de RefrescoEnVivo ("crm:interaccion"); el RLS ya limita a los leads del usuario.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/client'

const CLAVE = 'crm-avisos'

/** "Ding" corto con Web Audio (sin archivos de sonido). */
function sonar() {
  try {
    const ctx = new AudioContext()
    ;[[880, 0], [1320, 0.12]].forEach(([frecuencia, inicio]) => {
      const osc = ctx.createOscillator(); const vol = ctx.createGain()
      osc.type = 'sine'; osc.frequency.value = frecuencia
      vol.gain.setValueAtTime(0.0001, ctx.currentTime + inicio)
      vol.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + inicio + 0.02)
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + 0.35)
      osc.connect(vol).connect(ctx.destination)
      osc.start(ctx.currentTime + inicio); osc.stop(ctx.currentTime + inicio + 0.4)
    })
    setTimeout(() => void ctx.close(), 1000)
  } catch { /* sin audio */ }
}

export function AvisosEscritorio() {
  const router = useRouter()
  const [activos, setActivos] = useState(false)
  const activosRef = useRef(false)

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE) === 'si'
      setActivos(guardado); activosRef.current = guardado
    } catch { /* sin almacenamiento */ }
  }, [])

  useEffect(() => {
    const alLlegar = async (e: Event) => {
      const m = (e as CustomEvent<{ tipo?: string; lead_id?: string; contenido?: string | null }>).detail
      if (!activosRef.current || m?.tipo !== 'mensaje_lead' || !m.lead_id) return
      sonar()
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      if (document.visibilityState === 'visible' && document.hasFocus()) return // ya lo está viendo
      const supabase = crearClienteNavegador()
      const { data: lead } = await supabase.from('leads').select('nombre, telefono').eq('id', m.lead_id).maybeSingle()
      const aviso = new Notification(`💬 ${lead?.nombre ?? lead?.telefono ?? 'Nuevo mensaje'}`, {
        body: (m.contenido ?? '').slice(0, 140), tag: m.lead_id,
      })
      aviso.onclick = () => { window.focus(); router.push(`/leads/${m.lead_id}#chat` as never); aviso.close() }
    }
    window.addEventListener('crm:interaccion', alLlegar)
    return () => window.removeEventListener('crm:interaccion', alLlegar)
  }, [router])

  async function alternar() {
    const nuevo = !activos
    if (nuevo && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    setActivos(nuevo); activosRef.current = nuevo
    try { localStorage.setItem(CLAVE, nuevo ? 'si' : 'no') } catch { /* sin almacenamiento */ }
    if (nuevo) sonar() // prueba del sonido (y habilita el audio en el navegador)
  }

  return (
    <button
      onClick={alternar}
      title={activos ? 'Avisos activados: sonido y notificación cuando un lead escribe' : 'Activar avisos de mensajes nuevos'}
      aria-pressed={activos}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full border transition ${
        activos ? 'border-marca-100 bg-marca-50 text-marca-600' : 'border-slate-200 bg-superficie text-slate-500 hover:bg-slate-100'
      }`}
    >
      <span aria-hidden>{activos ? '🔔' : '🔕'}</span>
      <span className="sr-only">{activos ? 'Desactivar avisos' : 'Activar avisos'}</span>
    </button>
  )
}
