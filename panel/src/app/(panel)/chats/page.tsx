import type { Metadata } from 'next'
import Link from 'next/link'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { fechaHora, haceCuanto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { asesorDeLaVista, COOKIE_BANDEJA, leerPreferencia } from '@/lib/bandeja'
import { VistaChats } from './VistaChats'
import { VentanaWhatsApp } from '@/components/VentanaWhatsApp'
import { ahoraMs } from '@/lib/texto'

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

  // En computadora, Chats abre directo la conversación más reciente de la vista elegida (vista tipo bandeja).
  // Se decide en el servidor, antes de mostrar nada, para que no aparezca primero la lista y luego salte.
  // En el celular (o con ?lista) se queda en la lista.
  const esCelular = /Mobi|Android|iPhone|iPad|iPod/i.test((await headers()).get('user-agent') ?? '')
  if (!esCelular && !('lista' in sp)) {
    let masReciente = supabase.from('leads').select('id').not('ultimo_mensaje_at', 'is', null)
    if (soloSinResponder) masReciente = masReciente.eq('sin_responder', true)
    if (asesorFiltro) masReciente = masReciente.eq('asesor_id', asesorFiltro)
    const { data: ultimo } = await masReciente.order('ultimo_mensaje_at', { ascending: false }).limit(1).maybeSingle()
    if (ultimo) redirect(`/chats/${ultimo.id}`)
  }

  let consulta = supabase
    .from('leads')
    .select('id, nombre, telefono, estado, ultimo_mensaje_texto, ultimo_mensaje_at, ultimo_mensaje_lead_at, ultima_respuesta_at, sin_responder, asesor:asesores!leads_asesor_id_fkey(nombre)')
    .not('ultimo_mensaje_at', 'is', null)
  if (soloSinResponder) consulta = consulta.eq('sin_responder', true)
  if (asesorFiltro) consulta = consulta.eq('asesor_id', asesorFiltro)
  let conteo = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('sin_responder', true)
  if (asesorFiltro) conteo = conteo.eq('asesor_id', asesorFiltro)

  // Asignados o reasignados en la última semana a los que nadie escribió desde entonces: salen arriba, para encontrarlos
  let sinChat = supabase.from('leads').select('id, nombre, telefono, estado, fecha_asignado, ultimo_mensaje_at, reasignaciones, asesor:asesores!leads_asesor_id_fkey(nombre)')
    .not('asesor_id', 'is', null).gte('fecha_asignado', new Date(ahoraMs() - 7 * 86_400_000).toISOString())
  if (asesorFiltro) sinChat = sinChat.eq('asesor_id', asesorFiltro)

  const [{ data: chats, error }, { count: totalSinResponder }, { data: asesores }, { data: nuevos }, { data: deApoyo }] = await Promise.all([
    consulta.order('sin_responder', { ascending: false }).order('ultimo_mensaje_at', { ascending: false }).limit(LIMITE),
    conteo,
    esAdmin ? supabase.rpc('posibles_reemplazos') : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    soloSinResponder ? Promise.resolve({ data: [] }) : sinChat.order('fecha_asignado', { ascending: false }).limit(60),
    // Leads de otros asesores que atendí como apoyo o que cubro: salen con etiqueta (solo en mi vista)
    !asesorFiltro || soloMios ? supabase.rpc('mis_leads_apoyo') : Promise.resolve({ data: [] }),
  ])
  const asignados = (nuevos ?? []).filter((n) => n.fecha_asignado! > (n.ultimo_mensaje_at ?? '')).slice(0, 30)
  const etiquetaApoyo = new Map((deApoyo ?? []).map((a) => [a.id, a.cubriendo ? `🧳 Cubres a ${a.asesor ?? 'otro asesor'}` : '🤝 Apoyo']))
  const vistos = new Set((chats ?? []).map((c) => c.id))
  const lista = [
    ...(chats ?? []),
    ...(deApoyo ?? []).filter((a) => a.ultimo_mensaje_at && !vistos.has(a.id) && (!soloSinResponder || a.sin_responder))
      .map((a) => ({ ...a, estado: null, ultima_respuesta_at: null, asesor: { nombre: a.asesor ?? '' } })),
  ].sort((a, b) => Number(!!b.sin_responder) - Number(!!a.sin_responder) || (b.ultimo_mensaje_at ?? '').localeCompare(a.ultimo_mensaje_at ?? ''))
  const nombreAsesor = asesorFiltro && !soloMios ? ((asesores ?? []) as { id: string; nombre: string }[]).find((a) => a.id === asesorFiltro)?.nombre : null

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Chats</h1>
        <p className="text-sm text-slate-500">
          Conversaciones de WhatsApp {nombreAsesor ? `de los leads de ${nombreAsesor}` : esAdmin && !soloMios ? 'de todos los leads' : 'de tus leads'}. Se actualiza en vivo.
        </p>
      </div>

      <VistaChats
        preferencia={preferencia} asesores={(asesores ?? []) as { id: string; nombre: string }[]} miId={perfil.id}
        veTodos={esAdmin} sinResponder={totalSinResponder ?? 0}
      />

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      {!!asignados.length && (
        <section className="tarjeta">
          <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">📌 Asignados a {asesorFiltro && !soloMios ? (nombreAsesor ?? 'este asesor') : esAdmin && !soloMios ? 'asesores' : 'ti'} · nadie les escribió aún</h2>
          <ul className="divide-y divide-slate-100">
            {asignados.map((n) => (
              <li key={n.id}>
                <Link href={`/chats/${n.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700">{(n.nombre ?? '?').slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{n.nombre ?? n.telefono}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <InsigniaEstado estado={n.estado} />
                      {!!n.reasignaciones && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">🔁 Reasignado</span>}
                      {esAdmin && !asesorFiltro && <span>{n.asesor?.nombre}</span>}
                      <span title={fechaHora(n.fecha_asignado)}>asignado {haceCuanto(n.fecha_asignado)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="tarjeta divide-y divide-slate-100">
        {lista.map((c) => {
          const ultimoEsDelLead = c.ultimo_mensaje_lead_at === c.ultimo_mensaje_at
          return (
            <li key={c.id}>
              <Link href={`/chats/${c.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
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
                    {c.estado && <InsigniaEstado estado={c.estado} />}
                    {etiquetaApoyo.has(c.id) && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">{etiquetaApoyo.get(c.id)} · de {c.asesor?.nombre || 'otro asesor'}</span>}
                    {esAdmin && !asesorFiltro && !etiquetaApoyo.has(c.id) && <span>{c.asesor?.nombre ?? 'Sin asesor (lo atiende Genesys)'}</span>}
                    {c.sin_responder && <span className="font-medium text-rose-600">● Sin responder</span>}
                    <VentanaWhatsApp ultimoMensajeAlumno={c.ultimo_mensaje_lead_at} variante="mini" />
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
        {!lista.length && (
          <li className="px-4 py-12 text-center text-sm text-slate-500">
            {soloSinResponder ? 'No hay mensajes sin responder. 🎉' : 'Todavía no hay conversaciones.'}
          </li>
        )}
      </ul>
    </div>
  )
}
