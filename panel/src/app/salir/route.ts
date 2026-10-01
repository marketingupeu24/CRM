// Cierra la sesión y vuelve al login con el motivo (usuario sin perfil o en la papelera).
// Es una ruta (no una página) porque solo aquí se pueden borrar las cookies de sesión.
import { NextResponse } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/server'

const MOTIVOS = ['sin_perfil', 'eliminado']

export async function GET(request: Request) {
  const url = new URL(request.url)
  const motivo = url.searchParams.get('motivo') ?? ''
  const supabase = await crearClienteServidor()
  await supabase.auth.signOut()
  const destino = new URL('/login', url.origin)
  if (MOTIVOS.includes(motivo)) destino.searchParams.set('error', motivo)
  return NextResponse.redirect(destino)
}
