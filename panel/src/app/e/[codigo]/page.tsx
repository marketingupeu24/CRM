import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Admisión · Universidad Peruana Unión', robots: { index: false } }

/**
 * Enlace o QR por medio (TikTok, Facebook, flyer…): cuenta la visita y abre WhatsApp con el
 * mensaje listo; el código "(Cód. O-XXXX)" del mensaje marca el origen del lead.
 */
export default async function EnlaceOrigen(props: PageProps<'/e/[codigo]'>) {
  const { codigo } = await props.params
  const supabase = await crearClienteServidor()
  const { data } = /^[A-Za-z0-9]{3,10}$/.test(codigo)
    ? await supabase.rpc('visitar_enlace', { p_codigo: codigo })
    : { data: null }
  const r = data as { mensaje: string; whatsapp: string | null } | null
  const numero = (r?.whatsapp ?? '').replace(/\D/g, '')
  if (r && numero) redirect(`https://wa.me/${numero}?text=${encodeURIComponent(r.mensaje)}`)

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-semibold text-slate-800">Enlace no disponible</h1>
        <p className="text-sm text-slate-600">Este enlace ya no está activo. Escríbenos por WhatsApp o visita Admisión de la Universidad Peruana Unión – campus Juliaca.</p>
      </div>
    </main>
  )
}
