'use client'

// Actualiza la página actual (listas, contadores del menú) cuando llega un mensaje o un lead nuevo.
// Realtime solo envía los eventos de leads que el usuario puede ver (RLS).
// Si la conexión se corta se reconecta sola, y además se actualiza al volver a la pestaña
// y cada minuto con la pestaña visible, por si algún evento se perdió.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador, prepararTiempoReal } from '@/lib/supabase/client'

const TIPOS_QUE_ACTUALIZAN = new Set(['mensaje_lead', 'mensaje_asesor', 'sistema', 'cambio_estado'])

export function RefrescoEnVivo() {
  const router = useRouter()

  useEffect(() => {
    const supabase = crearClienteNavegador()
    let canal: ReturnType<typeof supabase.channel> | null = null
    let refresco: ReturnType<typeof setTimeout> | undefined
    let reintento: ReturnType<typeof setTimeout> | undefined
    let espera = 2_000
    let activo = true

    const refrescar = () => {
      clearTimeout(refresco)
      refresco = setTimeout(() => { if (activo) router.refresh() }, 800)
    }

    async function conectar() {
      if (!activo) return
      await prepararTiempoReal(supabase)
      if (!activo) return
      canal = supabase
        .channel(`panel-en-vivo-${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_interacciones' }, (payload) => {
          if (TIPOS_QUE_ACTUALIZAN.has((payload.new as { tipo?: string }).tipo ?? '')) refrescar()
        })
        .subscribe((estado) => {
          if (!activo) return
          if (estado === 'SUBSCRIBED') {
            espera = 2_000
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
    const alVolver = () => { if (document.visibilityState === 'visible') refrescar() }
    const intervalo = setInterval(alVolver, 60_000)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)

    return () => {
      activo = false
      clearTimeout(refresco)
      clearTimeout(reintento)
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [router])

  return null
}
