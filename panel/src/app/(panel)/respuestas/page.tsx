import type { Metadata } from 'next'
import Link from '@/components/Enlace'
import { agruparPorCategoria, CATEGORIAS_RESPUESTA, type RespuestaRapida } from '@crm/db'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FilaRespuesta, FormularioRespuesta, type AsesorOpcion } from './Formularios'
import { paraBuscar, parametro } from '@/lib/texto'

export const metadata: Metadata = { title: 'Respuestas rápidas' }

export default async function PaginaRespuestas(props: PageProps<'/respuestas'>) {
  // Todos los que usan el chat ven esta página; quien tiene el permiso "respuestas" administra las de todos
  const { perfil, puede } = await exigirPermiso('chats')
  const sp = await props.searchParams
  const cat = CATEGORIAS_RESPUESTA.some((c) => c.clave === parametro(sp.cat)) ? parametro(sp.cat) : ''
  const q = parametro(sp.q).slice(0, 60)
  const admin = puede('respuestas')
  const supabase = await crearClienteServidor()
  const [{ data: respuestas, error }, { data: ocultas }, { data: asesoresR }] = await Promise.all([
    supabase.from('respuestas_rapidas').select('*').order('orden').order('titulo'),
    supabase.from('respuestas_ocultas').select('respuesta_id').eq('asesor_id', perfil.id),
    admin
      ? supabase.from('asesores').select('id, nombre').is('eliminado_at', null).eq('activo', true).order('nombre')
      : Promise.resolve({ data: [] as AsesorOpcion[] }),
  ])
  const asesores: AsesorOpcion[] = asesoresR ?? []
  const nombreDe = new Map(asesores.map((a) => [a.id, a.nombre]))
  const noUsa = new Set((ocultas ?? []).map((o) => o.respuesta_id))
  const visibles = (respuestas ?? []).filter((r) => admin || r.asesor_id === null || r.asesor_id === perfil.id)
  const palabras = paraBuscar(q).split(/\s+/).filter(Boolean)
  const todas = visibles
    .filter((r) => !cat || r.categoria === cat)
    .filter((r) => palabras.every((p) => paraBuscar(`${r.titulo} ${r.contenido}`).includes(p)))
  const mias = todas.filter((r) => r.asesor_id === perfil.id)
  const paraTodos = todas.filter((r) => r.asesor_id === null)
  const deOtros = todas.filter((r) => r.asesor_id !== null && r.asesor_id !== perfil.id)
  const comunes = { admin, asesores, miId: perfil.id }
  const cuenta = (clave: string) => visibles.filter((r) => r.categoria === clave).length
  const enlace = (cambios: { cat?: string; q?: string }) => {
    const p = new URLSearchParams(Object.entries({ cat, q, ...cambios }).filter(([, v]) => v))
    return `/respuestas${p.size ? `?${p}` : ''}` as `/respuestas?${string}`
  }
  const chip = (activo: boolean) => `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${activo ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 bg-superficie text-slate-700 hover:bg-slate-50'}`

  // Lista agrupada por categoría (con subtítulos), salvo cuando ya se filtró una
  const lista = (items: RespuestaRapida[], fila: (r: RespuestaRapida) => React.ReactNode, vacio: string) => (
    <ul className="tarjeta divide-y divide-slate-100 overflow-hidden">
      {cat
        ? items.map(fila)
        : agruparPorCategoria(items).map((g) => [
          <li key={`cat-${g.categoria.clave}`} className="bg-slate-50 px-5 py-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {g.categoria.icono} {g.categoria.nombre} <span className="font-normal">· {g.items.length}</span>
          </li>,
          ...g.items.map(fila),
        ])}
      {!items.length && <li className="px-5 py-6 text-center text-sm text-slate-500">{vacio}</li>}
    </ul>
  )

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Respuestas rápidas</h1>
        <p className="text-sm text-slate-500">
          Plantillas para el chat: se insertan con el botón ⚡ o escribiendo <code>/</code> en el mensaje. Puedes usar <code>{'{nombre}'}</code>,{' '}
          <code>{'{carrera}'}</code> y <code>{'{asesor}'}</code>: se reemplazan con los datos del lead y del asesor.
          Hay respuestas <b>para todos</b> y <b>personales</b> (con tus propios enlaces o datos, solo las ves tú). Marca «La uso» en las que quieres que salgan en tu chat.
        </p>
      </div>

      <details className="tarjeta p-6">
        <summary className="cursor-pointer font-semibold">+ Nueva respuesta</summary>
        <p className="mt-1 mb-4 text-xs text-slate-500">
          {admin ? 'Elige su categoría y si es para todos o personal de alguien.' : 'Elige su categoría. Será personal: solo la verás tú en tu chat.'}
        </p>
        <FormularioRespuesta {...comunes} />
      </details>

      <div className="space-y-3">
        <form className="flex gap-2">
          {cat && <input type="hidden" name="cat" value={cat} />}
          <input name="q" defaultValue={q} placeholder="⌕ Buscar en títulos y mensajes" className="campo min-w-0 flex-1" aria-label="Buscar respuesta" />
          <button className="boton-secundario">Buscar</button>
          {q && <Link href={enlace({ q: '' })} className="boton-secundario">✕</Link>}
        </form>
        <nav className="flex flex-wrap gap-2" aria-label="Categorías">
          <Link href={enlace({ cat: '' })} className={chip(!cat)}>Todas <span className="opacity-70">{visibles.length}</span></Link>
          {CATEGORIAS_RESPUESTA.filter((c) => cuenta(c.clave)).map((c) => (
            <Link key={c.clave} href={enlace({ cat: c.clave })} className={chip(cat === c.clave)}>
              {c.icono} {c.nombre} <span className="opacity-70">{cuenta(c.clave)}</span>
            </Link>
          ))}
        </nav>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">👤 Mis respuestas personales <span className="text-sm font-normal text-slate-500">· {mias.length}</span></h2>
        {lista(mias, (r) => <FilaRespuesta key={r.id} respuesta={r} usada={!noUsa.has(r.id)} puedeEditar {...comunes} />,
          q || cat ? 'Ninguna personal en este filtro.' : 'Aún no tienes respuestas personales. Créalas arriba (por ejemplo, con tu enlace o tu número).')}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">👥 Para todos <span className="text-sm font-normal text-slate-500">· {paraTodos.length}</span></h2>
        {lista(paraTodos, (r) => <FilaRespuesta key={r.id} respuesta={r} usada={!noUsa.has(r.id)} puedeEditar={admin} {...comunes} />,
          q || cat ? 'Ninguna en este filtro.' : 'No hay respuestas para todos.')}
      </section>

      {admin && (
        <section className="space-y-2">
          <h2 className="font-semibold">Personales de otros asesores <span className="text-sm font-normal text-slate-500">· {deOtros.length}</span></h2>
          <p className="text-xs text-slate-500">Solo las ves tú como administrador. Con el selector puedes volverlas «para todos» o pasarlas a otro asesor.</p>
          {lista(deOtros, (r) => <FilaRespuesta key={r.id} respuesta={r} usada puedeEditar duenio={nombreDe.get(r.asesor_id!) ?? 'Otro asesor'} {...comunes} />,
            q || cat ? 'Ninguna en este filtro.' : 'Ningún asesor tiene respuestas personales todavía.')}
        </section>
      )}
    </div>
  )
}
