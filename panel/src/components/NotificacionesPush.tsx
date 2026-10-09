'use client'

// Activar las notificaciones del CRM en este dispositivo (celular o PC): llegan aunque el CRM esté cerrado.
// En iPhone solo funcionan con la app instalada (Safari → Compartir → Agregar a inicio, iOS 16.4+).
import { useEffect, useState } from 'react'
import { guardarSuscripcion, quitarSuscripcion } from '@/app/(panel)/cuenta/push'

/** Clave pública VAPID del CRM (la privada está solo en Supabase). */
const VAPID_PUBLICA = 'BIeNJvojbnGIXATN6A15GNFtWNBibBRzcteJkr09UQpWcBDYA1BtIAs_S7oy6qZL9LOLwww1DzO7ri0XtgVPgEA'

function claveABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const texto = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(texto, (c) => c.charCodeAt(0))
}

function nombreDispositivo(): string {
  const ua = navigator.userAgent
  const sistema = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Otro'
  const navegador = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  return `${sistema} · ${navegador}`
}

type Estado = 'cargando' | 'no_soportado' | 'iphone_sin_instalar' | 'bloqueado' | 'activo' | 'inactivo'

export function NotificacionesPush() {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent)
      const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setEstado(ios && !instalada ? 'iphone_sin_instalar' : 'no_soportado'); return
      }
      if (Notification.permission === 'denied') { setEstado('bloqueado'); return }
      const registro = await navigator.serviceWorker.register('/sw.js')
      const sub = await registro.pushManager.getSubscription()
      setEstado(sub ? 'activo' : 'inactivo')
    })().catch(() => setEstado('no_soportado'))
  }, [])

  async function activar() {
    setOcupado(true); setError(null)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo'); return }
      const registro = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(VAPID_PUBLICA) })
      const r = await guardarSuscripcion(sub.toJSON() as never, nombreDispositivo())
      if (r.error) { setError(r.error); await sub.unsubscribe(); return }
      setEstado('activo')
    } catch {
      setError('No se pudieron activar las notificaciones en este dispositivo.')
    } finally {
      setOcupado(false)
    }
  }

  async function desactivar() {
    setOcupado(true)
    try {
      const registro = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await registro?.pushManager.getSubscription()
      if (sub) { await quitarSuscripcion(sub.endpoint); await sub.unsubscribe() }
      setEstado('inactivo')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="space-y-2 text-sm">
      {estado === 'cargando' && <p className="text-slate-500">Revisando este dispositivo…</p>}
      {estado === 'no_soportado' && <p className="text-slate-600">Este navegador no admite notificaciones. Usa Chrome, Edge o Firefox (o Safari en iPhone con la app instalada).</p>}
      {estado === 'iphone_sin_instalar' && (
        <p className="text-slate-600">En iPhone primero instala la app: en Safari toca <b>Compartir</b> → <b>Agregar a inicio</b>, ábrela desde el ícono y vuelve aquí.</p>
      )}
      {estado === 'bloqueado' && <p className="text-amber-700">Las notificaciones están bloqueadas para el CRM en este navegador. Permítelas en la configuración del sitio (candado junto a la dirección) y recarga.</p>}
      {estado === 'activo' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-emerald-700">✅ Activas en este dispositivo: te llegan los mensajes nuevos, leads asignados y próximas acciones.</p>
          <button type="button" onClick={desactivar} disabled={ocupado} className="boton-secundario">Desactivar aquí</button>
        </div>
      )}
      {estado === 'inactivo' && (
        <button type="button" onClick={activar} disabled={ocupado} className="boton">{ocupado ? 'Activando…' : '🔔 Activar notificaciones en este dispositivo'}</button>
      )}
      {error && <p role="alert" className="text-rose-600">{error}</p>}
    </div>
  )
}
