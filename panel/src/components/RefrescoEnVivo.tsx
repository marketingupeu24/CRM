'use client'

// Vuelve a cargar la página del servidor cuando llega un mensaje nuevo
// (Realtime solo envía los de leads que el usuario puede ver, por el RLS).
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/client'

export function RefrescoEnVivo() {
  const router = useRouter()

  useEffect(() => {
    const supabase = crearClienteNavegador()
    let espera: ReturnType<typeof setTimeout> | undefined
    const canal = supabase
      .channel('bandeja-chats')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_interacciones' }, (payload) => {
        const tipo = (payload.new as { tipo?: string }).tipo
        if (tipo !== 'mensaje_lead' && tipo !== 'mensaje_asesor') return
        clearTimeout(espera)
        espera = setTimeout(() => router.refresh(), 800)
      })
      .subscribe()
    return () => {
      clearTimeout(espera)
      supabase.removeChannel(canal)
    }
  }, [router])

  return null
}
