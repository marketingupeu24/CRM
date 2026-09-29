// Cliente de Supabase para componentes del navegador ('use client').
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@crm/db'

export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
