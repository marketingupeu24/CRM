'use client'

// Mensajes del chat en tiempo real: Supabase Realtime (respeta el RLS del usuario) con reconexión automática
// y una revisión periódica de respaldo por si el tiempo real se corta.
import { useCallback, useEffect, useRef, useState } from 'react'
import { esDelChat } from '@/lib/chat'
import { crearClienteNavegador, prepararTiempoReal } from '@/lib/supabase/client'
import type { MensajeChat } from './utilidades'

export function useMensajesEnVivo(leadId: string, inicial: MensajeChat[]) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>(inicial)
  const [enVivo, setEnVivo] = useState(false)

  /** Agrega mensajes sin repetir y mantiene el orden por fecha. */
  // Estables (solo usan setMensajes): el tiempo real no se reconecta en cada render
  const agregarVarios = useCallback((nuevos: MensajeChat[]) =>
    setMensajes((previos) => {
      const ids = new Set(previos.map((p) => p.id))
      const sumar = nuevos.filter((m) => !ids.has(m.id))
      if (!sumar.length) return previos
      return [...previos, ...sumar].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    }), [])
  const agregar = useCallback((m: MensajeChat) => agregarVarios([m]), [agregarVarios])

  // Fecha del último mensaje mostrado (para traer solo lo nuevo)
  const ultimaFecha = useRef<string | null>(inicial.at(-1)?.created_at ?? null)
  useEffect(() => {
    ultimaFecha.current = mensajes.at(-1)?.created_at ?? ultimaFecha.current
  }, [mensajes])

  useEffect(() => {
    const supabase = crearClienteNavegador()
    let canal: ReturnType<typeof supabase.channel> | null = null
    let reintento: ReturnType<typeof setTimeout> | undefined
    let espera = 2_000
    let activo = true

    /** Trae lo que llegó desde el último mensaje mostrado (por si el tiempo real se cortó). */
    async function revisar() {
      let consulta = supabase.from('lead_interacciones').select('*').eq('lead_id', leadId)
        .order('created_at', { ascending: true }).limit(100)
      if (ultimaFecha.current) consulta = consulta.gte('created_at', ultimaFecha.current)
      const { data } = await consulta
      if (activo && data?.length) agregarVarios((data as MensajeChat[]).filter(esDelChat))
    }

    async function conectar() {
      if (!activo) return
      await prepararTiempoReal(supabase)
      if (!activo) return
      canal = supabase
        .channel(`chat-${leadId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'lead_interacciones', filter: `lead_id=eq.${leadId}` },
          (payload) => {
            const m = payload.new as MensajeChat
            if (esDelChat(m)) agregar(m)
          },
        )
        // El archivo que envió el lead se une al mensaje unos segundos después (lo copia Genesys)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'lead_interacciones', filter: `lead_id=eq.${leadId}` },
          (payload) => {
            const m = payload.new as MensajeChat
            setMensajes((previos) => previos.map((p) => (p.id === m.id ? { ...p, adjunto_url: m.adjunto_url } : p)))
          },
        )
        .subscribe((estado, err) => {
          if (!activo) return
          if (estado === 'SUBSCRIBED') {
            setEnVivo(true)
            espera = 2_000
            void revisar() // lo que haya llegado mientras estaba desconectado
          } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
            setEnVivo(false)
            if (err) console.warn('[chat] tiempo real:', estado, err.message)
            // Reconexión con espera creciente (2 s, 4 s, 8 s… hasta 30 s)
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
    // Respaldo: cada 10 s con la pestaña visible, y al volver a la pestaña
    const intervalo = setInterval(() => { if (document.visibilityState === 'visible') void revisar() }, 10_000)
    const alVolver = () => { if (document.visibilityState === 'visible') void revisar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)

    return () => {
      activo = false
      clearTimeout(reintento)
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [leadId, agregar, agregarVarios])

  return { mensajes, setMensajes, enVivo, agregar }
}
