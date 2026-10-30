'use client'

// Actualiza la página actual (listas, contadores del menú) cuando llega un mensaje o un lead nuevo.
// Realtime solo envía los eventos de leads que el usuario puede ver (RLS).
// Cada actualización vuelve a armar la página en el servidor (procesador de Vercel: el plan gratis se pausó
// el 30/10 por esto), así que se cuida cuándo:
//   - con la pestaña oculta no se actualiza: queda pendiente y se hace al volver a ella;
//   - en las listas que se atienden en vivo (leads, chats, pendientes, kanban) a lo más cada 10 s;
//     en las demás páginas (dashboard, reportes…) a lo más cada 2 min;
//   - si la conexión se corta se reconecta sola y al reconectarse actualiza una vez (por si algo se perdió);
//     al volver a la pestaña tras más de 5 min también.
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { crearClienteNavegador, prepararTiempoReal } from '@/lib/supabase/client'

const TIPOS_QUE_ACTUALIZAN = new Set(['mensaje_lead', 'mensaje_asesor', 'sistema', 'cambio_estado'])
const RUTAS_EN_VIVO = ['/leads', '/chats', '/pendientes', '/kanban']
const ESPERA_EN_VIVO = 10_000
const ESPERA_OTRAS = 120_000
const VOLVER_TRAS = 5 * 60_000

export function RefrescoEnVivo() {
  const router = useRouter()
  const ruta = usePathname()
  // En una ref: cambiar de página no reconecta el tiempo real
  const rutaActual = useRef(ruta)
  useEffect(() => { rutaActual.current = ruta }, [ruta])

  useEffect(() => {
    const supabase = crearClienteNavegador()
    let canal: ReturnType<typeof supabase.channel> | null = null
    let refresco: ReturnType<typeof setTimeout> | undefined
    let reintento: ReturnType<typeof setTimeout> | undefined
    let espera = 2_000
    let activo = true
    let conectadoAntes = false
    let pendiente = false
    let ultimo = Date.now()

    const visible = () => document.visibilityState === 'visible'
    const actualizar = () => {
      clearTimeout(refresco)
      refresco = undefined
      if (!activo) return
      if (!visible()) { pendiente = true; return }
      pendiente = false
      ultimo = Date.now()
      router.refresh()
    }
    const refrescar = () => {
      if (!visible()) { pendiente = true; return }
      if (refresco) return // ya hay una actualización en camino: junta los eventos
      const enVivo = RUTAS_EN_VIVO.some((r) => rutaActual.current === r || rutaActual.current.startsWith(r + '/'))
      const minimo = enVivo ? ESPERA_EN_VIVO : ESPERA_OTRAS
      refresco = setTimeout(actualizar, Math.max(800, ultimo + minimo - Date.now()))
    }

    async function conectar() {
      if (!activo) return
      await prepararTiempoReal(supabase)
      if (!activo) return
      canal = supabase
        .channel(`panel-en-vivo-${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_interacciones' }, (payload) => {
          const nuevo = payload.new as { tipo?: string }
          if (TIPOS_QUE_ACTUALIZAN.has(nuevo.tipo ?? '')) refrescar()
          // Para los avisos de escritorio y sonido (componente AvisosEscritorio)
          window.dispatchEvent(new CustomEvent('crm:interaccion', { detail: nuevo }))
        })
        .subscribe((estado) => {
          if (!activo) return
          if (estado === 'SUBSCRIBED') {
            espera = 2_000
            if (conectadoAntes) refrescar() // lo que llegó mientras estuvo desconectado
            conectadoAntes = true
          } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
            clearTimeout(reintento)
            reintento = setTimeout(() => {
              if (canal) void supabase.removeChannel(canal)
              void conectar()
            }, espera)
            espera = Math.min(espera * 2, 30_000)
          }
        })
    }

    void conectar()
    const alVolver = () => {
      if (visible() && (pendiente || Date.now() - ultimo > VOLVER_TRAS)) actualizar()
    }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      activo = false
      clearTimeout(refresco)
      clearTimeout(reintento)
      document.removeEventListener('visibilitychange', alVolver)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [router])

  return null
}
