import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { exigirPermiso } from '@/lib/sesion'
import { urlBase } from '@/lib/sitio'
import { crearClienteServidor } from '@/lib/supabase/server'
import { BotonImprimir } from './BotonImprimir'

export const metadata: Metadata = { title: 'Cartel QR' }

/** Cartel A4 con el QR de la actividad, para imprimir y pegar en el stand. */
export default async function CartelActividad(props: PageProps<'/actividades/[id]/cartel'>) {
  const { id } = await props.params
  await exigirPermiso('actividades')
  const supabase = await crearClienteServidor()
  const { data: a } = await supabase.from('actividades').select('codigo, nombre, lugar').eq('id', Number(id)).maybeSingle()
  if (!a) notFound()
  const url = `${await urlBase()}/r/${a.codigo}`
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#003865', light: '#ffffff' } })

  return (
    <div className="mx-auto max-w-[210mm] space-y-4">
      <style>{`@media print { aside, header, .no-imprimir { display: none !important } main { padding: 0 !important } .md\\:ml-\\[270px\\] { margin: 0 !important } @page { size: A4; margin: 0 } }`}</style>
      <div className="no-imprimir flex items-center justify-between">
        <p className="text-sm text-slate-500">Vista del cartel (A4). Al imprimir solo sale el cartel.</p>
        <BotonImprimir />
      </div>
      <div className="flex min-h-[297mm] flex-col items-center overflow-hidden rounded-2xl bg-white text-center shadow-theme-md print:rounded-none print:shadow-none" style={{ color: '#003865' }}>
        <div className="w-full px-10 py-10" style={{ background: '#003865', borderBottom: '10px solid #f7a800' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- logo en SVG para impresión nítida */}
          <img src="/marca/logo-upeu-blanco.svg" alt="Universidad Peruana Unión" className="mx-auto h-20" />
          <p className="mt-5 text-3xl font-bold text-white">¡Regístrate y recibe información de Admisión 2027!</p>
        </div>
        <p className="mt-10 text-xl font-medium text-slate-600">Escanea con la cámara de tu celular</p>
        <div className="mt-4 w-[120mm]" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-8 px-10 font-serif text-4xl font-bold">{a.nombre}</p>
        {a.lugar && <p className="mt-2 text-xl text-slate-600">{a.lugar}</p>}
        <p className="mt-auto mb-10 text-lg text-slate-500">o entra a <b className="text-slate-700">{url.replace(/^https?:\/\//, '')}</b></p>
      </div>
    </div>
  )
}
