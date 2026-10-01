// Cliente de Supabase para componentes del navegador ('use client').
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@crm/db'

export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}

/**
 * Entrega la sesión del usuario a la conexión en tiempo real antes de suscribirse.
 * Si el canal se abre antes de cargar la sesión, Supabase lo trata como anónimo y el RLS
 * no le entrega los cambios (llegan vacíos con "401 Unauthorized").
 */
export async function prepararTiempoReal(supabase: ReturnType<typeof crearClienteNavegador>) {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token)
}
