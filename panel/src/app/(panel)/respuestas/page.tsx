import type { Metadata } from 'next'
import { exigirAdmin } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FilaRespuesta, FormularioRespuesta } from './Formularios'

export const metadata: Metadata = { title: 'Respuestas rápidas' }

export default async function PaginaRespuestas() {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const { data: respuestas, error } = await supabase.from('respuestas_rapidas').select('*').order('orden').order('titulo')

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Respuestas rápidas</h1>
        <p className="text-sm text-slate-500">
          Plantillas que los asesores insertan en el chat con el botón ⚡. Puedes usar <code>{'{nombre}'}</code>,{' '}
          <code>{'{carrera}'}</code> y <code>{'{asesor}'}</code>: se reemplazan con los datos del lead y del asesor.
          El asesor puede editar el texto antes de enviarlo.
        </p>
      </div>

      <section className="tarjeta p-6">
        <h2 className="mb-4 font-semibold">Nueva respuesta</h2>
        <FormularioRespuesta />
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <ul className="tarjeta divide-y divide-slate-100">
        {(respuestas ?? []).map((r) => <FilaRespuesta key={r.id} respuesta={r} />)}
        {!respuestas?.length && <li className="px-5 py-8 text-center text-sm text-slate-500">Aún no hay respuestas rápidas.</li>}
      </ul>
    </div>
  )
}
