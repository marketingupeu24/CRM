import type { Metadata } from 'next'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FilaRespuesta, FormularioRespuesta, type AsesorOpcion } from './Formularios'

export const metadata: Metadata = { title: 'Respuestas rápidas' }

export default async function PaginaRespuestas() {
  // Todos los que usan el chat ven esta página; quien tiene el permiso "respuestas" administra las de todos
  const { perfil, puede } = await exigirPermiso('chats')
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
  const todas = respuestas ?? []
  const mias = todas.filter((r) => r.asesor_id === perfil.id)
  const paraTodos = todas.filter((r) => r.asesor_id === null)
  const deOtros = todas.filter((r) => r.asesor_id !== null && r.asesor_id !== perfil.id)
  const comunes = { admin, asesores, miId: perfil.id }

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

      <section className="tarjeta p-6">
        <h2 className="mb-1 font-semibold">Nueva respuesta</h2>
        <p className="mb-4 text-xs text-slate-500">
          {admin ? 'Elige si es para todos o personal de alguien.' : 'Será personal: solo la verás tú en tu chat.'}
        </p>
        <FormularioRespuesta {...comunes} />
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">👤 Mis respuestas personales <span className="text-sm font-normal text-slate-500">· {mias.length}</span></h2>
        <ul className="tarjeta divide-y divide-slate-100">
          {mias.map((r) => <FilaRespuesta key={r.id} respuesta={r} usada={!noUsa.has(r.id)} puedeEditar {...comunes} />)}
          {!mias.length && <li className="px-5 py-6 text-center text-sm text-slate-500">Aún no tienes respuestas personales. Créalas arriba (por ejemplo, con tu enlace o tu número).</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">👥 Para todos <span className="text-sm font-normal text-slate-500">· {paraTodos.length}</span></h2>
        <ul className="tarjeta divide-y divide-slate-100">
          {paraTodos.map((r) => <FilaRespuesta key={r.id} respuesta={r} usada={!noUsa.has(r.id)} puedeEditar={admin} {...comunes} />)}
          {!paraTodos.length && <li className="px-5 py-6 text-center text-sm text-slate-500">No hay respuestas para todos.</li>}
        </ul>
      </section>

      {admin && (
        <section className="space-y-2">
          <h2 className="font-semibold">Personales de otros asesores <span className="text-sm font-normal text-slate-500">· {deOtros.length}</span></h2>
          <p className="text-xs text-slate-500">Solo las ves tú como administrador. Con el selector puedes volverlas «para todos» o pasarlas a otro asesor.</p>
          <ul className="tarjeta divide-y divide-slate-100">
            {deOtros.map((r) => (
              <FilaRespuesta key={r.id} respuesta={r} usada puedeEditar duenio={nombreDe.get(r.asesor_id!) ?? 'Otro asesor'} {...comunes} />
            ))}
            {!deOtros.length && <li className="px-5 py-6 text-center text-sm text-slate-500">Ningún asesor tiene respuestas personales todavía.</li>}
          </ul>
        </section>
      )}
    </div>
  )
}
