import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { carreras } from '@crm/db'
import { LogoUpeu } from '@/components/LogoUpeu'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FormularioRegistro } from '@/app/r/[codigo]/Formulario'
import { registrarseConAsesor } from './acciones'

export const metadata: Metadata = { title: 'Déjanos tus datos · Admisión UPeU', robots: { index: false } }

/**
 * Enlace corto de los QR de atención presencial (sin iniciar sesión):
 * - 6 caracteres: QR del asesor → formulario; queda como lead de ese asesor y luego escribe por WhatsApp.
 * - 8 caracteres: QR por persona (el asesor ya escribió sus datos) → abre WhatsApp con el mensaje listo.
 */
export default async function PaginaQrAsesor(props: PageProps<'/w/[codigo]'>) {
  const { codigo } = await props.params
  const supabase = await crearClienteServidor()
  let asesor: string | null = null
  let aviso = 'Este QR no existe. Pide a tu asesor(a) que te muestre su QR de nuevo.'

  if (/^[0-9a-f]{8}$/i.test(codigo)) {
    const { data } = await supabase.rpc('prerregistro_publico', { p_codigo: codigo })
    const p = data as { codigo: string; persona: string; asesor: string; whatsapp: string | null } | null
    const numero = (p?.whatsapp ?? '').replace(/\D/g, '')
    if (p && numero) {
      const texto = `Hola 👋 Soy ${p.persona}, me atendió ${p.asesor} en Admisión UPeU. (Cód. P-${p.codigo})`
      redirect(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`)
    }
    aviso = p ? 'El WhatsApp de Admisión aún no está configurado. Avísale a tu asesor(a).' : 'Este QR ya venció. Pide a tu asesor(a) que genere uno nuevo.'
  } else if (/^[0-9a-f]{6}$/i.test(codigo)) {
    const { data } = await supabase.rpc('qr_asesor_publico', { p_codigo: codigo })
    asesor = (data as { nombre: string } | null)?.nombre ?? null
  }
  const listaCarreras = [...new Set(carreras('PRES', 'JUL').map((c) => c[0]))]

  return (
    <main className="min-h-screen bg-slate-100" data-theme="light" style={{ colorScheme: 'light' }}>
      <div className="px-5 pt-8 pb-16 text-center" style={{ background: '#003865', borderBottom: '6px solid #f7a800' }}>
        <div className="flex justify-center"><LogoUpeu variante="blanco" className="h-12" /></div>
        <p className="mt-4 text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: '#f7a800' }}>Admisión 2027 · Campus Juliaca</p>
        {asesor && <h1 className="mt-2 text-xl font-semibold text-white">Te atiende {asesor}</h1>}
      </div>
      <div className="mx-auto -mt-10 max-w-md px-4">
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          {!asesor ? (
            <p className="py-6 text-center text-slate-600">{aviso}</p>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Déjanos tus datos</h2>
              <p className="mt-1 mb-5 text-sm text-slate-500">Así quedas registrado(a) en Admisión y te enviamos por WhatsApp la información de carreras, costos y fechas.</p>
              <FormularioRegistro codigo={codigo} carreras={listaCarreras} colegio={null} asesor={asesor} enviar={registrarseConAsesor.bind(null, codigo)} />
            </>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Universidad Peruana Unión · Oficina de Admisión</p>
      </div>
    </main>
  )
}
