'use client'

// Avisos cuando un lead escribe: sonido + notificación del navegador (aunque estés en otra pestaña).
// Recibe los eventos de RefrescoEnVivo ("crm:interaccion"); el RLS ya limita a los leads del usuario.
import { useEffect, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/client'

const CLAVE = 'crm-avisos'
const EVENTO = 'crm:avisos-cambiados'

/** ¿Avisos activados en este navegador? (guardado en localStorage) */
function leerActivos(): boolean {
  try { return localStorage.getItem(CLAVE) === 'si' } catch { return false }
}
function suscribir(alCambiar: () => void) {
  window.addEventListener('storage', alCambiar)
  window.addEventListener(EVENTO, alCambiar)
  return () => { window.removeEventListener('storage', alCambiar); window.removeEventListener(EVENTO, alCambiar) }
}

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
  // Se lee del navegador (en el servidor: desactivados) y se actualiza solo si cambia en otra pestaña
  const activos = useSyncExternalStore(suscribir, leerActivos, () => false)

  useEffect(() => {
    const alLlegar = async (e: Event) => {
      const m = (e as CustomEvent<{ tipo?: string; lead_id?: string; contenido?: string | null }>).detail
      if (!leerActivos() || m?.tipo !== 'mensaje_lead' || !m.lead_id) return
      sonar()
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      if (document.visibilityState === 'visible' && document.hasFocus()) return // ya lo está viendo
      const supabase = crearClienteNavegador()
      const { data: lead } = await supabase.from('leads').select('nombre, telefono').eq('id', m.lead_id).maybeSingle()
      const aviso = new Notification(`💬 ${lead?.nombre ?? lead?.telefono ?? 'Nuevo mensaje'}`, {
        body: (m.contenido ?? '').slice(0, 140), tag: m.lead_id,
      })
      aviso.onclick = () => { window.focus(); router.push(`/chats/${m.lead_id}` as never); aviso.close() }
    }
    window.addEventListener('crm:interaccion', alLlegar)
    return () => window.removeEventListener('crm:interaccion', alLlegar)
  }, [router])

  async function alternar() {
    const nuevo = !activos
    if (nuevo && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    try { localStorage.setItem(CLAVE, nuevo ? 'si' : 'no') } catch { /* sin almacenamiento */ }
    window.dispatchEvent(new Event(EVENTO))
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
