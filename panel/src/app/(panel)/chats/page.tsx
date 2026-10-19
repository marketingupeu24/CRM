import type { Metadata } from 'next'
import Link from 'next/link'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { fechaHora, haceCuanto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { asesorDeLaVista, COOKIE_BANDEJA, leerPreferencia } from '@/lib/bandeja'
import { AbrirUltimoChat, VistaChats } from './VistaChats'

export const metadata: Metadata = { title: 'Chats' }

const LIMITE = 100

export default async function PaginaChats(props: PageProps<'/chats'>) {
  const sp = await props.searchParams
  const { esAdmin, perfil } = await exigirPermiso('chats')
  // La última vista elegida (todo el equipo, los míos o un asesor; todos o sin responder) se recuerda.
  // Los enlaces viejos (?filtro=sin_responder, ?de=mios) siguen funcionando.
  const guardada = leerPreferencia((await cookies()).get(COOKIE_BANDEJA)?.value)
  const preferencia = {
    de: sp.de === 'mios' ? 'mios' : guardada.de,
    filtro: sp.filtro === 'sin_responder' ? 'sin_responder' as const : guardada.filtro,
  }
  const soloSinResponder = preferencia.filtro === 'sin_responder'
  const asesorFiltro = asesorDeLaVista(preferencia, perfil.id, esAdmin)
  const soloMios = asesorFiltro === perfil.id
  const supabase = await crearClienteServidor()

  let consulta = supabase
    .from('leads')
    .select('id, nombre, telefono, estado, ultimo_mensaje_texto, ultimo_mensaje_at, ultimo_mensaje_lead_at, ultima_respuesta_at, sin_responder, asesor:asesores!leads_asesor_id_fkey(nombre)')
    .not('ultimo_mensaje_at', 'is', null)
  if (soloSinResponder) consulta = consulta.eq('sin_responder', true)
  if (asesorFiltro) consulta = consulta.eq('asesor_id', asesorFiltro)
  let conteo = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('sin_responder', true)
  if (asesorFiltro) conteo = conteo.eq('asesor_id', asesorFiltro)

  const [{ data: chats, error }, { count: totalSinResponder }, { data: asesores }] = await Promise.all([
    consulta.order('sin_responder', { ascending: false }).order('ultimo_mensaje_at', { ascending: false }).limit(LIMITE),
    conteo,
    esAdmin ? supabase.rpc('posibles_reemplazos') : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])
  // La conversación más reciente (mensaje que llegó o que se envió): se abre directo en pantallas grandes
  const ultimo = [...(chats ?? [])].sort((a, b) => (b.ultimo_mensaje_at ?? '').localeCompare(a.ultimo_mensaje_at ?? ''))[0]?.id ?? null
  const nombreAsesor = asesorFiltro && !soloMios ? ((asesores ?? []) as { id: string; nombre: string }[]).find((a) => a.id === asesorFiltro)?.nombre : null

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Chats</h1>
        <p className="text-sm text-slate-500">
          Conversaciones de WhatsApp {nombreAsesor ? `de los leads de ${nombreAsesor}` : esAdmin && !soloMios ? 'de todos los leads' : 'de tus leads'}. Se actualiza en vivo.
        </p>
      </div>

      <AbrirUltimoChat leadId={ultimo} />
      <VistaChats
        preferencia={preferencia} asesores={(asesores ?? []) as { id: string; nombre: string }[]} miId={perfil.id}
        veTodos={esAdmin} sinResponder={totalSinResponder ?? 0}
      />

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
                    {esAdmin && !asesorFiltro && <span>{c.asesor?.nombre ?? 'Sin asesor (lo atiende Genesys)'}</span>}
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
