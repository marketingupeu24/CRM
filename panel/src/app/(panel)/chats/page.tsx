import type { Metadata } from 'next'
import Link from 'next/link'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { fechaHora, haceCuanto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Chats' }

const LIMITE = 100

export default async function PaginaChats(props: PageProps<'/chats'>) {
  const sp = await props.searchParams
  const soloSinResponder = sp.filtro === 'sin_responder'

  const { esAdmin, perfil } = await exigirPermiso('chats')
  // Quien ve todos los chats puede quedarse solo con los suyos (?de=mios)
  const soloMios = esAdmin && sp.de === 'mios'
  const supabase = await crearClienteServidor()
  const enlace = (cambios: { filtro?: string | null; de?: string | null }) => {
    const p = new URLSearchParams()
    const filtro = 'filtro' in cambios ? cambios.filtro : soloSinResponder ? 'sin_responder' : null
    const de = 'de' in cambios ? cambios.de : soloMios ? 'mios' : null
    if (filtro) p.set('filtro', filtro)
    if (de) p.set('de', de)
    return `/chats?${p.toString()}` as `/chats?${string}`
  }

  let consulta = supabase
    .from('leads')
    .select('id, nombre, telefono, estado, ultimo_mensaje_texto, ultimo_mensaje_at, ultimo_mensaje_lead_at, ultima_respuesta_at, sin_responder, asesor:asesores!leads_asesor_id_fkey(nombre)')
    .not('ultimo_mensaje_at', 'is', null)
  if (soloSinResponder) consulta = consulta.eq('sin_responder', true)
  if (soloMios) consulta = consulta.eq('asesor_id', perfil.id)
  let conteo = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('sin_responder', true)
  if (soloMios) conteo = conteo.eq('asesor_id', perfil.id)

  const [{ data: chats, error }, { count: totalSinResponder }] = await Promise.all([
    consulta.order('sin_responder', { ascending: false }).order('ultimo_mensaje_at', { ascending: false }).limit(LIMITE),
    conteo,
  ])

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Chats</h1>
        <p className="text-sm text-slate-500">
          Conversaciones de WhatsApp {esAdmin && !soloMios ? 'de todos los leads' : 'de tus leads'}. Se actualiza en vivo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {esAdmin && (
          <div className="mr-2 flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label="Chats de quién">
            <Link href={enlace({ de: null })} className={`px-3 py-1.5 ${soloMios ? 'bg-superficie text-slate-700 hover:bg-slate-50' : 'bg-marca-600 text-white'}`}>De todos</Link>
            <Link href={enlace({ de: 'mios' })} className={`border-l border-slate-300 px-3 py-1.5 ${soloMios ? 'bg-marca-600 text-white' : 'bg-superficie text-slate-700 hover:bg-slate-50'}`}>Solo los míos</Link>
          </div>
        )}
        <Link href={enlace({ filtro: null })} className={soloSinResponder ? 'boton-secundario' : 'boton'}>Todos</Link>
        <Link href={enlace({ filtro: 'sin_responder' })} className={soloSinResponder ? 'boton' : 'boton-secundario'}>
          Sin responder
          {!!totalSinResponder && (
            <span className="rounded-full bg-rose-500 px-1.5 text-xs text-white">{totalSinResponder}</span>
          )}
        </Link>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <ul className="tarjeta divide-y divide-slate-100">
        {(chats ?? []).map((c) => {
          const ultimoEsDelLead = c.ultimo_mensaje_lead_at === c.ultimo_mensaje_at
          return (
            <li key={c.id}>
              <Link href={`/leads/${c.id}#chat`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${c.sin_responder ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                  {(c.nombre ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`truncate ${c.sin_responder ? 'font-semibold' : 'font-medium'}`}>
                      {c.nombre ?? c.telefono}
                    </p>
                    <span className="shrink-0 text-xs text-slate-500" title={fechaHora(c.ultimo_mensaje_at)}>
                      {haceCuanto(c.ultimo_mensaje_at)}
                    </span>
                  </div>
                  <p className={`truncate text-sm ${c.sin_responder ? 'text-slate-800' : 'text-slate-500'}`}>
                    {ultimoEsDelLead ? '' : 'Tú: '}{c.ultimo_mensaje_texto}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <InsigniaEstado estado={c.estado} />
                    {esAdmin && !soloMios && <span>{c.asesor?.nombre ?? 'Sin asesor (lo atiende Genesys)'}</span>}
                    {c.sin_responder && <span className="font-medium text-rose-600">● Sin responder</span>}
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
        {!chats?.length && (
          <li className="px-4 py-12 text-center text-sm text-slate-500">
            {soloSinResponder ? 'No hay mensajes sin responder. 🎉' : 'Todavía no hay conversaciones.'}
          </li>
        )}
      </ul>
    </div>
  )
}
