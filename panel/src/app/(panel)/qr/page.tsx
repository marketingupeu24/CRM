import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { exigirPermiso } from '@/lib/sesion'
import { urlBase } from '@/lib/sitio'
import { crearClienteServidor } from '@/lib/supabase/server'
import { TarjetasQr, type TarjetaQr } from './TarjetasQr'

export const metadata: Metadata = { title: 'Mi QR (presencial)' }

/**
 * QR personal de cada asesor para la atención presencial: el interesado lo escanea, escribe
 * por WhatsApp (mensaje listo) y queda como lead de ese asesor. Quien ve los leads de todo el
 * equipo también ve e imprime los QR de los demás.
 */
export default async function PaginaQrAsesor() {
  const { perfil, puede } = await exigirPermiso('qr_asesor')
  const supabase = await crearClienteServidor()
  const todos = puede('ver_todos')

  const consulta = supabase.from('asesores').select('id, nombre, codigo_qr, rol, activo').is('eliminado_at', null).order('nombre')
  const [{ data: asesores }, { data: ajuste }] = await Promise.all([
    todos ? consulta.or(`rol.eq.asesor,activo.eq.true,id.eq.${perfil.id}`) : consulta.eq('id', perfil.id),
    supabase.from('ajustes').select('valor').eq('clave', 'whatsapp_genesys').maybeSingle(),
  ])
  const base = await urlBase()
  const tarjetas: TarjetaQr[] = await Promise.all((asesores ?? []).map(async (a) => {
    const url = `${base}/w/${a.codigo_qr}`
    return {
      id: a.id,
      nombre: a.nombre,
      url,
      svg: await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#003865', light: '#ffffff' } }),
    }
  }))
  // La tarjeta propia primero
  tarjetas.sort((x, y) => (x.id === perfil.id ? -1 : y.id === perfil.id ? 1 : 0))

  return (
    <div className="space-y-5">
      <div className="no-imprimir">
        <h1 className="text-2xl font-semibold">{todos ? 'QR de los asesores' : 'Mi QR'} (atención presencial)</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Muéstralo o entrégalo impreso a quien atiendes en persona. Al escanearlo se abre WhatsApp con un mensaje listo:
          la persona lo envía (escribe primero, sin llenar formularios), queda <b>asignada a ti como tu lead</b>, te llega el aviso
          y Genesys le confirma que le escribirás. Después respóndele desde el chat del CRM.
        </p>
      </div>
      {!ajuste?.valor && (
        <p className="no-imprimir rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Falta el número de WhatsApp de Genesys (lo configura el super admin en <b>Actividades y QR</b>). Sin él, el QR no puede abrir el chat.
        </p>
      )}
      <TarjetasQr tarjetas={tarjetas} variosAsesores={todos} />
    </div>
  )
}
