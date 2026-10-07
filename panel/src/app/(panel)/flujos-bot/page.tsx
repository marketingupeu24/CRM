import type { Metadata } from 'next'
import { fechaHora } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FormularioFlujo, TarjetaFlujo, type Flujo } from './Controles'

export const metadata: Metadata = { title: 'Flujos de BuilderBot' }

/** Copia de los flujos de Genesys en BuilderBot: su prompt actual y la versión mejorada para pegar. */
export default async function PaginaFlujosBot() {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('flujos_bot')
    .select('id, nombre, disparador, palabras, prompt, prompt_mejorado, notas, updated_at').order('orden').order('nombre')
  const flujos = (data ?? []) as Flujo[]
  const faltan = flujos.filter((f) => !f.prompt).length
  const mejorados = flujos.filter((f) => f.prompt_mejorado).length
  const ultima = flujos.reduce((max, f) => (f.updated_at > max ? f.updated_at : max), '')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Flujos de BuilderBot</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Copia de cada flujo de Genesys. Pega el prompt (o el texto de cada paso) tal como está en BuilderBot: se revisa y aquí aparece la
          <b> versión mejorada</b> lista para copiar y pegar de vuelta.{ultima && <> Última actualización: {fechaHora(ultima)}.</>}
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{flujos.length} flujos</span>
        {faltan > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{faltan} sin prompt</span>}
        {mejorados > 0 && <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">{mejorados} con versión mejorada</span>}
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <details className="tarjeta p-5">
        <summary className="cursor-pointer font-semibold">+ Agregar flujo</summary>
        <div className="mt-4"><FormularioFlujo /></div>
      </details>

      <ul className="space-y-4">
        {flujos.map((f) => <TarjetaFlujo key={f.id} flujo={f} />)}
      </ul>
    </div>
  )
}
