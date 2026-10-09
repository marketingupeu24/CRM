import type { NextRequest } from 'next/server'
import { actualizarSesion } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return actualizarSesion(request)
}

export const config = {
  // Todo menos archivos estáticos e imágenes
  // sw.js y manifest.webmanifest: la app instalable los pide sin pasar por el login
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
