import type { NextRequest } from 'next/server'
import { actualizarSesion } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return actualizarSesion(request)
}

export const config = {
  // Todo menos archivos estáticos e imágenes
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
