// Cliente de Supabase para Server Components y Server Actions.
// Usa la sesión del asesor (cookies): todas las consultas pasan por el RLS.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@crm/db'

export async function crearClienteServidor() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Llamado desde un Server Component: el proxy ya refresca la sesión.
          }
        },
      },
    },
  )
}
