'use server'

// Suscripciones a notificaciones push de este usuario (una por dispositivo).
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface SuscripcionNavegador {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** registrar_push: si el navegador estaba suscrito con otro usuario, pasa a este. */
export async function guardarSuscripcion(s: SuscripcionNavegador, dispositivo: string): Promise<{ error?: string }> {
  await obtenerSesion()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('registrar_push', {
    p_endpoint: s.endpoint, p_p256dh: s.keys?.p256dh, p_auth: s.keys?.auth, p_dispositivo: dispositivo,
  })
  return error ? { error: 'No se pudo guardar la suscripción.' } : {}
}

export async function quitarSuscripcion(endpoint: string): Promise<void> {
  await obtenerSesion()
  const supabase = await crearClienteServidor()
  await supabase.from('push_suscripciones').delete().eq('endpoint', endpoint)
}
