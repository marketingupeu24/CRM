import type { Metadata } from 'next'
import Link from 'next/link'
import QRCode from 'qrcode'
import { fechaHora } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { urlBase } from '@/lib/sitio'
import { crearClienteServidor } from '@/lib/supabase/server'
import { carreras } from '@crm/db'
import { RegistroPresencial } from './RegistroPresencial'
import { TarjetasQr, type TarjetaQr } from './TarjetasQr'

export const metadata: Metadata = { title: 'Mi QR (presencial)' }

const CARRERAS = [...new Set(carreras('PRES', 'JUL').map((c) => c[0]))]

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
  // Escaneados en los últimos 14 días (los propios; quien ve todo, los de todos)
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const escaneos = supabase.from('leads').select('id, nombre, telefono, dni, carrera_interes, fecha_asignado, registrado_por')
    .eq('origen_campana', 'Presencial (QR del asesor)').gte('fecha_asignado', desde).is('eliminado_at', null)
    .order('fecha_asignado', { ascending: false }).limit(30)
  const [{ data: asesores }, { data: ajuste }, { data: recientes }] = await Promise.all([
    todos ? consulta.or(`rol.eq.asesor,activo.eq.true,id.eq.${perfil.id}`) : consulta.eq('id', perfil.id),
    supabase.from('ajustes').select('valor').eq('clave', 'whatsapp_genesys').maybeSingle(),
    todos ? escaneos : escaneos.eq('registrado_por', perfil.id),
  ])
  const nombres = new Map((asesores ?? []).map((a) => [a.id, a.nombre]))
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
          Para la atención en persona. <b>Lo mejor:</b> escribe sus datos en <b>Registrar a quien atiendo ahora</b> y muéstrale su QR:
          al enviar el mensaje queda registrada con esos datos y su celular real, como tu lead. <b>Tu QR impreso</b> (abajo) también
          sirve: quien lo escanea queda como tu lead y luego completas sus datos en <b>Escaneados recientemente</b>.
        </p>
      </div>
      {!ajuste?.valor && (
        <p className="no-imprimir rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Falta el número de WhatsApp de Genesys (lo configura el super admin en <b>Actividades y QR</b>). Sin él, el QR no puede abrir el chat.
        </p>
      )}
      <RegistroPresencial carreras={CARRERAS} />
      <section className="no-imprimir tarjeta p-5">
        <h2 className="font-semibold">Escaneados recientemente</h2>
        <p className="mb-3 text-xs text-slate-500">Últimos 14 días. Se actualiza solo al llegar un escaneo nuevo.</p>
        {recientes?.length ? (
          <ul className="divide-y divide-slate-100">
            {recientes.map((l) => {
              const faltan = !l.nombre || !l.carrera_interes
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{l.nombre ?? <span className="text-amber-700">Sin nombre</span>}</p>
                    <p className="text-xs text-slate-500">
                      {l.telefono} · {fechaHora(l.fecha_asignado)}
                      {l.carrera_interes ? ` · ${l.carrera_interes}` : ''}
                      {todos && l.registrado_por && nombres.get(l.registrado_por) ? ` · ${nombres.get(l.registrado_por)}` : ''}
                    </p>
                  </div>
                  <Link href={`/leads/${l.id}#editar`} className={faltan ? 'boton' : 'text-sm font-medium text-marca-700 hover:underline'}>
                    {faltan ? '✏️ Completar datos' : 'Ver ficha'}
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : <p className="text-sm text-slate-500">Aún nadie escaneó tu QR.</p>}
      </section>
      <TarjetasQr tarjetas={tarjetas} variosAsesores={todos} />
    </div>
  )
}
