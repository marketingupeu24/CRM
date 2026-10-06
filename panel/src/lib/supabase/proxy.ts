// Refresca la sesión de Supabase en cada petición y protege las rutas del panel.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@crm/db'

// /r/<codigo>: formulario del QR de ferias y colegios (lo llenan los alumnos, sin sesión)
const RUTAS_PUBLICAS = ['/login', '/r/', '/w/']

export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          respuesta = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options))
        },
      },
    },
  )

  // No poner código entre createServerClient y getClaims: evita cierres de sesión aleatorios.
  const { data } = await supabase.auth.getClaims()
  const autenticado = Boolean(data?.claims)
  const ruta = request.nextUrl.pathname
  const esPublica = RUTAS_PUBLICAS.some((r) => ruta.startsWith(r))

  if (!autenticado && !esPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  if (autenticado && ruta === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return respuesta
}
