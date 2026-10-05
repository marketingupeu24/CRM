import type { Metadata } from 'next'
import Link from 'next/link'
import { haceCuanto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { BotonRevisada } from './Controles'

export const metadata: Metadata = { title: 'Revisión del bot' }

function parametro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? ''
}

export default async function PaginaRevisionBot(props: PageProps<'/revision-bot'>) {
  const sp = await props.searchParams
  await exigirPermiso('conocimiento')
  const verTodas = parametro(sp.ver) === 'todas'
  const dias = [7, 30, 90].includes(Number(parametro(sp.dias))) ? Number(parametro(sp.dias)) : 30
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('preguntas_sin_respuesta', { p_dias: dias })
  const todas = data ?? []
  const pendientes = todas.filter((p) => !p.revisada)
  const lista = verTodas ? todas : pendientes
  const ahora = Date.now()
  const enlace = (cambios: Record<string, string>) => {
    const p = new URLSearchParams({ ...(verTodas ? { ver: 'todas' } : {}), ...(dias !== 30 ? { dias: String(dias) } : {}), ...cambios })
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k)
    return `/revision-bot?${p.toString()}` as `/revision-bot?${string}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Revisión del bot</h1>
          <p className="text-sm text-slate-500">
            Respuestas en las que Genesys no supo contestar ("no tengo información", "malentendido"…) con la pregunta del lead.
            Agrega el dato a la <Link href="/conocimiento" className="font-medium text-marca-700 hover:underline">base de conocimiento</Link> y márcala como revisada.
          </p>
        </div>
        {pendientes.length > 1 && !verTodas && (
          <BotonRevisada ids={pendientes.map((p) => p.interaccion_id)} revisada={false} texto={`✓ Marcar las ${pendientes.length} como revisadas`} />
        )}
      </div>

      <div className="tarjeta flex flex-wrap items-center gap-3 p-3 text-sm">
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          <Link href={enlace({ ver: '' })} className={`px-3 py-1.5 ${!verTodas ? 'bg-marca-600 text-white' : 'bg-superficie hover:bg-slate-50'}`}>
            Pendientes ({pendientes.length})
          </Link>
          <Link href={enlace({ ver: 'todas' })} className={`border-l border-slate-300 px-3 py-1.5 ${verTodas ? 'bg-marca-600 text-white' : 'bg-superficie hover:bg-slate-50'}`}>
            Todas ({todas.length})
          </Link>
        </div>
        <span className="text-slate-500">Últimos</span>
        {[7, 30, 90].map((d) => (
          <Link key={d} href={enlace({ dias: d === 30 ? '' : String(d) })} className={`rounded-full px-3 py-1 ${d === dias ? 'bg-marca-50 font-semibold text-marca-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            {d} días
          </Link>
        ))}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <ul className="space-y-3">
        {lista.map((p) => (
          <li key={p.interaccion_id} className={`tarjeta p-4 ${p.revisada ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                <Link href={`/leads/${p.lead_id}#chat`} className="font-medium text-marca-700 hover:underline">{p.lead_nombre ?? p.lead_telefono}</Link>
                {' · '}{haceCuanto(p.respondida_at, ahora)}
              </span>
              <span className="flex items-center gap-3">
                <Link
                  href={`/conocimiento?nuevo=${encodeURIComponent(p.pregunta ?? '')}` as `/conocimiento?${string}`}
                  className="text-xs font-medium text-marca-700 hover:underline"
                >
                  + Agregar a la base
                </Link>
                <BotonRevisada ids={[p.interaccion_id]} revisada={p.revisada} />
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="block text-xs font-semibold text-slate-500">Preguntó</span>{p.pregunta ?? '—'}</p>
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900"><span className="block text-xs font-semibold text-rose-700">Genesys respondió</span>{p.respuesta}</p>
            </div>
          </li>
        ))}
        {!lista.length && (
          <li className="tarjeta px-5 py-10 text-center text-sm text-slate-500">
            {verTodas ? 'No hay respuestas fallidas en este periodo.' : '¡Todo revisado! No hay preguntas pendientes en este periodo.'}
          </li>
        )}
      </ul>
    </div>
  )
}
