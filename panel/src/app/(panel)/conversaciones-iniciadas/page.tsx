import type { Metadata } from 'next'
import Link from 'next/link'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { fechaHora, num, pct } from '@/lib/formato'
import { exigirSuperadmin } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { hoyLima, parametro } from '@/lib/texto'

export const metadata: Metadata = { title: 'Conversaciones iniciadas' }

// Solo super admin: quién escribió primero en cada chat de WhatsApp (general y por asesor).
// Escribir primero a quien no te escribió es lo que más riesgo de bloqueo tiene en WhatsApp.

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/i

export default async function PaginaConversacionesIniciadas(props: PageProps<'/conversaciones-iniciadas'>) {
  await exigirSuperadmin()
  const sp = await props.searchParams
  const desde = FECHA.test(parametro(sp.desde)) ? parametro(sp.desde) : ''
  const hasta = FECHA.test(parametro(sp.hasta)) ? parametro(sp.hasta) : ''
  const asesor = UUID.test(parametro(sp.asesor)) ? parametro(sp.asesor) : ''
  const supabase = await crearClienteServidor()
  const fechas = { p_desde: desde || undefined, p_hasta: hasta || undefined }
  const [{ data: filas, error }, { data: detalle }] = await Promise.all([
    supabase.rpc('conversaciones_iniciadas', fechas),
    asesor ? supabase.rpc('conversaciones_iniciadas_detalle', { p_asesor: asesor, ...fechas }) : Promise.resolve({ data: null }),
  ])
  const asesores = (filas ?? []).filter((f) => f.asesor_id)
  const genesys = (filas ?? []).find((f) => !f.asesor_id)
  const suma = (k: 'mensajes_enviados' | 'conversaciones' | 'iniciadas' | 'iniciadas_respondidas' | 'iniciadas_por_alumno') =>
    (filas ?? []).reduce((s, f) => s + Number(f[k] ?? 0), 0)
  const total = {
    mensajes: suma('mensajes_enviados'), chats: suma('conversaciones'), iniciadas: suma('iniciadas'),
    respondidas: suma('iniciadas_respondidas'), alumno: suma('iniciadas_por_alumno'),
  }
  const elegido = asesores.find((f) => f.asesor_id === asesor)

  const enlace = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ desde, hasta, asesor, ...cambios }).filter(([, v]) => v))
    return `/conversaciones-iniciadas?${p.toString()}` as `/conversaciones-iniciadas?${string}`
  }
  const rangos = [
    { texto: 'Hoy', desde: hoyLima(), hasta: hoyLima() },
    { texto: '7 días', desde: hoyLima(-6), hasta: hoyLima() },
    { texto: '30 días', desde: hoyLima(-29), hasta: hoyLima() },
    { texto: 'Todo', desde: '', hasta: '' },
  ]
  const celda = 'px-4 py-2 text-right tabular-nums'

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Conversaciones iniciadas</h1>
        <p className="text-sm text-slate-500">
          Quién escribió primero en cada chat de WhatsApp del CRM. Escribirle primero a quien no te escribió es lo que más riesgo de bloqueo tiene:
          lo ideal es que el alumno inicie. Solo lo ve el super admin.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {rangos.map((r) => {
          const activo = r.desde === desde && r.hasta === hasta
          return (
            <Link key={r.texto} href={enlace({ desde: r.desde, hasta: r.hasta })}
              className={`rounded-lg px-3 py-1.5 ${activo ? 'bg-marca-600 text-white' : 'border border-slate-300 bg-superficie text-slate-700 hover:bg-slate-50'}`}>
              {r.texto}
            </Link>
          )
        })}
        <form className="flex flex-wrap items-center gap-2">
          {asesor && <input type="hidden" name="asesor" value={asesor} />}
          <input type="date" name="desde" defaultValue={desde} aria-label="Desde" className="campo w-auto py-1.5" />
          <span className="text-slate-400">a</span>
          <input type="date" name="hasta" defaultValue={hasta} aria-label="Hasta" className="campo w-auto py-1.5" />
          <button className="boton-secundario py-1.5">Ver</button>
        </form>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { t: 'Chats nuevos', v: num(total.iniciadas + total.alumno), d: 'con su primer mensaje en el periodo' },
          { t: 'Los inició el alumno', v: num(total.alumno), d: pct(total.alumno, total.iniciadas + total.alumno) },
          { t: 'Los inició un asesor', v: num(total.iniciadas), d: pct(total.iniciadas, total.iniciadas + total.alumno), alerta: true },
          { t: 'Y el alumno respondió', v: num(total.respondidas), d: `${pct(total.respondidas, total.iniciadas)} de los que inició el asesor` },
        ].map((k) => (
          <div key={k.t} className="tarjeta p-4">
            <p className="text-xs font-medium text-slate-500">{k.t}</p>
            <p className={`mt-1 text-2xl font-semibold ${k.alerta && total.iniciadas ? 'text-amber-700' : ''}`}>{k.v}</p>
            <p className="text-xs text-slate-500">{k.d}</p>
          </div>
        ))}
      </section>

      <section className="tarjeta overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Asesor</th>
              <th className="px-4 py-3 text-right">Inició él / ella</th>
              <th className="px-4 py-3 text-right">Inició el alumno</th>
              <th className="px-4 py-3 text-right">% que inició</th>
              <th className="px-4 py-3 text-right">Respondieron</th>
              <th className="px-4 py-3 text-right">Chats donde escribió</th>
              <th className="px-4 py-3 text-right">Mensajes enviados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {asesores.map((f) => {
              const nuevos = Number(f.iniciadas) + Number(f.iniciadas_por_alumno)
              return (
                <tr key={f.asesor_id} className={f.asesor_id === asesor ? 'bg-marca-50' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-2">
                    <Link href={enlace({ asesor: f.asesor_id === asesor ? '' : f.asesor_id! })} className="font-medium text-marca-700 hover:underline">{f.asesor}</Link>
                  </td>
                  <td className={`${celda} font-semibold ${Number(f.iniciadas) ? 'text-amber-700' : ''}`}>{num(f.iniciadas)}</td>
                  <td className={celda}>{num(f.iniciadas_por_alumno)}</td>
                  <td className={celda}>{pct(f.iniciadas, nuevos)}</td>
                  <td className={celda}>{num(f.iniciadas_respondidas)}</td>
                  <td className={celda}>{num(f.conversaciones)}</td>
                  <td className={celda}>{num(f.mensajes_enviados)}</td>
                </tr>
              )
            })}
            {genesys && (
              <tr className="text-slate-500">
                <td className="px-4 py-2">Sin asesor (los atiende Genesys)</td>
                <td className={celda}>—</td>
                <td className={celda}>{num(genesys.iniciadas_por_alumno)}</td>
                <td className={celda}>—</td><td className={celda}>—</td><td className={celda}>—</td><td className={celda}>—</td>
              </tr>
            )}
            {!filas?.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Sin conversaciones en este periodo.</td></tr>}
          </tbody>
          {!!filas?.length && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <td className="px-4 py-2">Total general</td>
                <td className={`${celda} text-amber-700`}>{num(total.iniciadas)}</td>
                <td className={celda}>{num(total.alumno)}</td>
                <td className={celda}>{pct(total.iniciadas, total.iniciadas + total.alumno)}</td>
                <td className={celda}>{num(total.respondidas)}</td>
                <td className={celda}>{num(total.chats)}</td>
                <td className={celda}>{num(total.mensajes)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>
      <p className="-mt-3 text-xs text-slate-500">
        Toca un asesor para ver sus chats. Cada chat cuenta en la fecha de su primer mensaje. «Inició el alumno» se cuenta por el asesor que tiene hoy el lead.
        «Respondieron»: de los chats que inició el asesor, en cuántos el alumno contestó después. No cuenta lo que se escribe desde el WhatsApp personal del asesor.
      </p>

      {elegido && (
        <section className="tarjeta p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Chats que inició {elegido.asesor} <span className="font-normal text-slate-500">· {num(detalle?.length ?? 0)}</span></h2>
            <Link href={enlace({ asesor: '' })} className="text-sm text-marca-700 hover:underline">Cerrar</Link>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {(detalle ?? []).map((d) => (
              <li key={d.lead_id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/chats/${d.lead_id}`} className="font-medium text-marca-700 hover:underline">{d.nombre ?? d.telefono}</Link>
                    <InsigniaEstado estado={d.estado as never} />
                    {d.respondio_at
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">✓ Respondió {fechaHora(d.respondio_at)}</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Sin respuesta</span>}
                  </div>
                  <p className="truncate text-xs text-slate-500">{d.primer_mensaje}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{fechaHora(d.iniciada_at)}</span>
              </li>
            ))}
            {!detalle?.length && <li className="py-6 text-center text-slate-500">No inició chats en este periodo.</li>}
          </ul>
        </section>
      )}
    </div>
  )
}
