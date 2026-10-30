import type { Metadata } from 'next'
import Link from '@/components/Enlace'
import type { Route } from 'next'
import { PARTES_GENESYS, type FichaGenesys } from '@crm/db'
import { fechaHora } from '@/lib/formato'
import { promptGenesys, revisarPrompt } from '@/lib/genesys'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { Feriados, FormularioFicha, PanelPrompt, TarjetaFicha } from './Fichas'
import { hoyLima } from '@/lib/texto'

export const metadata: Metadata = { title: 'Prompt de Genesys' }

/**
 * Lo que sabe Genesys, dividido en partes y fichas pequeñas (una carrera, un programa CEPRE…).
 * El CRM arma el prompt del asistente INFORMACIÓN de BuilderBot y lo revisa antes de copiarlo.
 */
export default async function PaginaGenesys(props: PageProps<'/genesys'>) {
  const sp = await props.searchParams
  const { puede } = await obtenerSesion()
  const editable = puede('conocimiento')
  const supabase = await crearClienteServidor()
  const hoy = hoyLima()
  const [{ data: filas, error }, { data: version }, { data: feriados }, { data: estadoR }] = await Promise.all([
    supabase.from('genesys_fichas').select('id, parte, titulo, campos, activo, orden, vence_el, vencida_at').order('orden').order('titulo'),
    supabase.from('genesys_versiones').select('texto, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('feriados').select('fecha, nombre').gte('fecha', hoy).order('fecha').limit(30),
    supabase.rpc('estado_prompt_genesys'),
  ])
  type FichaEstado = { id: number; titulo: string; parte: string; vence_el: string; dias?: number }
  const estado = (estadoR ?? { vencidas: [], por_vencer: [] }) as { vencidas: FichaEstado[]; por_vencer: FichaEstado[] }
  const diaMes = (f: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }).format(new Date(`${f}T00:00:00Z`))
  const fichas = (filas ?? []) as FichaGenesys[]
  const pedida = typeof sp.parte === 'string' ? sp.parte : ''
  const parte = PARTES_GENESYS.find((p) => p.clave === pedida) ?? PARTES_GENESYS[0]!
  const nuevo = typeof sp.nuevo === 'string' ? sp.nuevo.slice(0, 160) : ''
  const deLaParte = fichas.filter((f) => f.parte === parte.clave)

  const prompt = promptGenesys(fichas, new Date(), feriados ?? [])
  // La fecha cambia cada día: se compara sin la línea "(Actualizado el …)"
  const sinFecha = (t: string) => t.replace(/^\(Actualizado el [^)]*\)$/m, '')
  const cambios = !version || sinFecha(version.texto) !== sinFecha(prompt)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Prompt de Genesys</h1>
          <div className="flex flex-wrap gap-2">
            <Link href={'/genesys/vencimientos' as Route} className="boton-secundario">
              ⏰ Vencimientos
              {estado.vencidas.length + estado.por_vencer.length > 0 && (
                <span className={`rounded-full px-1.5 text-xs font-semibold text-white ${estado.vencidas.length ? 'bg-rose-500' : 'bg-amber-500'}`}>{estado.vencidas.length + estado.por_vencer.length}</span>
              )}
            </Link>
            <Link href="/genesys/pruebas" className="boton-secundario">🧪 Pruebas del prompt</Link>
          </div>
        </div>
        <p className="max-w-3xl text-sm text-slate-500">
          Lo que sabe el bot, dividido en partes y fichas pequeñas: actualiza solo el dato que cambió (una carrera, un horario del CEPRE…).
          El CRM arma el prompt completo, con los costos del tarifario de proformas, y lo revisa antes de que lo pegues en BuilderBot.
        </p>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}
      {estado.vencidas.length > 0 && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-semibold">⏰ BuilderBot tiene información vencida</p>
          <p className="mt-1">
            {estado.vencidas.map((f) => `${f.titulo} (venció el ${diaMes(f.vence_el)})`).join(' · ')}. Ya salió del prompt del CRM:
            copia el prompt, pégalo en BuilderBot y marca <b>✓ Ya lo pegué</b>. Hasta entonces te llega un aviso cada día.{' '}
            <Link href={'/genesys/vencimientos' as Route} className="font-medium underline">Ver vencimientos</Link>
          </p>
        </div>
      )}
      {estado.por_vencer.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Por vencer en los próximos 7 días</p>
          <p className="mt-1">
            {estado.por_vencer.map((f, i) => (
              <span key={f.id}>{i > 0 && ' · '}<Link href={`/genesys?parte=${f.parte}`} className="underline">{f.titulo}</Link> ({f.dias === 0 ? 'vence hoy' : `vence el ${diaMes(f.vence_el)}`})</span>
            ))}. Actualiza la ficha (y su fecha) antes de que venza.{' '}
            <Link href={'/genesys/vencimientos' as Route} className="font-medium underline">Ver vencimientos</Link>
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[14rem_1fr_26rem]">
        {/* Partes y feriados */}
        <div className="space-y-4">
        <nav aria-label="Partes del prompt" className="space-y-1">
          {PARTES_GENESYS.map((p) => {
            const lista = fichas.filter((f) => f.parte === p.clave)
            const inactivas = lista.filter((f) => !f.activo).length
            const actual = p.clave === parte.clave
            return (
              <Link
                key={p.clave} href={`/genesys?parte=${p.clave}`}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${actual ? 'bg-marca-50 font-semibold text-marca-700' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                <span>{p.icono} {p.titulo}</span>
                <span className="flex items-center gap-1 text-xs">
                  {inactivas > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-amber-800" title="Desactivadas o por completar">{inactivas}</span>}
                  <span className="text-slate-400">{lista.length}</span>
                </span>
              </Link>
            )
          })}
        </nav>
        <Feriados feriados={feriados ?? []} editable={editable} />
        <details className="tarjeta p-4 text-sm">
          <summary className="cursor-pointer font-semibold">🗓️ Cierre de campaña</summary>
          <p className="mt-2 text-xs text-slate-500">Al terminar una campaña (ej. 2027-1), antes de la siguiente:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700">
            <li><Link href="/genesys?parte=examenes" className="text-marca-700 hover:underline">Exámenes y fechas</Link>: fechas de examen y de cierre de inscripciones.</li>
            <li><Link href="/genesys?parte=cepre" className="text-marca-700 hover:underline">CEPRE</Link>: programas, costos y horarios; desactiva los que terminaron.</li>
            <li><Link href="/genesys?parte=carreras" className="text-marca-700 hover:underline">Carreras</Link>: nuevas, próximamente y notas.</li>
            <li>Tarifario de <Link href="/costos" className="text-marca-700 hover:underline">proformas</Link> (los costos del prompt salen de ahí).</li>
            <li><Link href="/genesys?parte=becas" className="text-marca-700 hover:underline">Becas y promociones</Link> de la nueva campaña.</li>
            <li>Feriados del año siguiente.</li>
            <li>📋 Copiar prompt → pegar en BuilderBot → ✓ Ya lo pegué.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">El revisor del prompt avisa cuando una ficha tiene fechas que ya pasaron.</p>
        </details>
        </div>

        {/* Fichas de la parte */}
        <section className="min-w-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{parte.icono} {parte.titulo}</h2>
            <p className="text-sm text-slate-500">{parte.descripcion}</p>
          </div>
          {editable && (
            <details className="tarjeta p-4" open={!!nuevo}>
              <summary className="cursor-pointer text-sm font-semibold">+ Agregar {parte.nombreFicha.toLowerCase()}</summary>
              <div className="mt-4">
                <FormularioFicha parte={parte} ficha={nuevo ? { id: 0, parte: parte.clave, titulo: nuevo, campos: {}, activo: true, orden: 100 } as FichaGenesys : undefined} />
              </div>
            </details>
          )}
          {deLaParte.length ? (
            <ul className="space-y-2">
              {deLaParte.map((f) => <TarjetaFicha key={f.id} parte={parte} ficha={f} editable={editable} />)}
            </ul>
          ) : <p className="text-sm text-slate-500">Aún no hay fichas en esta parte.</p>}
        </section>

        {/* Prompt armado */}
        <div className="xl:sticky xl:top-20 xl:self-start">
          <PanelPrompt
            prompt={prompt} avisos={revisarPrompt(prompt, fichas)} cambios={cambios}
            ultima={version ? fechaHora(version.created_at) : null} editable={editable}
          />
        </div>
      </div>
    </div>
  )
}
