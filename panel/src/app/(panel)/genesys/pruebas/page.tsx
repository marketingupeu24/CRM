import type { Metadata } from 'next'
import Link from 'next/link'
import { fechaHora } from '@/lib/formato'
import { cobertura, PROHIBIDAS_SIEMPRE, proveedorIA, type Prueba } from '@/lib/pruebas-genesys'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { promptActual } from './acciones'
import { FormularioPrueba, ProbarTodas, TarjetaPrueba } from './Controles'

export const metadata: Metadata = { title: 'Pruebas del prompt' }

/**
 * Banco de preguntas reales para revisar el prompt de Genesys antes de pegarlo en BuilderBot.
 * La cobertura (¿el prompt tiene el dato?) se calcula siempre; la prueba con IA, si hay clave.
 */
export default async function PaginaPruebas() {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const [{ data: filas }, prompt] = await Promise.all([
    supabase.from('genesys_pruebas')
      .select('id, pregunta, debe_incluir, no_debe_incluir, ultima_respuesta, ultimo_resultado, ultimo_detalle, probado_at')
      .eq('activo', true).order('orden').order('id'),
    promptActual(),
  ])
  const pruebas = filas ?? []
  const ia = proveedorIA()
  const conCobertura = pruebas.map((p) => ({ ...p, faltanEnPrompt: cobertura(prompt, p as Prueba) }))
  const sinDato = conCobertura.filter((p) => p.faltanEnPrompt.length)
  const probadas = pruebas.filter((p) => p.ultimo_resultado !== null)
  const correctas = probadas.filter((p) => p.ultimo_resultado).length

  return (
    <div className="space-y-6">
      <div>
        <Link href="/genesys" className="text-sm text-slate-500 hover:text-slate-800">← Prompt de Genesys</Link>
        <h1 className="mt-1 text-2xl font-semibold">🧪 Pruebas del prompt</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Preguntas reales de alumnos con lo que la respuesta <b>debe incluir</b> y lo que <b>no debe decir</b>.
          Revísalas cada vez que cambies el prompt, antes de pegarlo en BuilderBot. En todas, Genesys nunca debe decir: {PROHIBIDAS_SIEMPRE.map((x) => `"${x}"`).join(', ')}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="tarjeta p-4">
          <h2 className="font-semibold">1. Cobertura del prompt <span className="text-xs font-normal text-slate-500">(sin IA, siempre al día)</span></h2>
          {sinDato.length
            ? <p className="mt-1 text-sm text-amber-700">⚠️ {sinDato.length} de {pruebas.length} preguntas necesitan un dato que <b>no está en el prompt</b>: Genesys no podría responderlas bien.</p>
            : <p className="mt-1 text-sm text-emerald-700">✅ El prompt tiene los datos de las {pruebas.length} preguntas.</p>}
        </section>
        <section className="tarjeta p-4">
          <h2 className="font-semibold">2. Prueba con IA <span className="text-xs font-normal text-slate-500">{ia ? `(${ia.modelo})` : ''}</span></h2>
          {ia ? (
            <>
              <p className="mt-1 text-sm text-slate-600">
                {probadas.length ? <>Última prueba: <b>{correctas} de {probadas.length}</b> correctas.</> : 'Aún no se probó.'}
              </p>
              <ProbarTodas ids={pruebas.map((p) => p.id)} />
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Para que el CRM le haga las preguntas a una IA con el prompt real, agrega en Vercel la variable <code>OPENAI_API_KEY</code>{' '}
              (o <code>ANTHROPIC_API_KEY</code>). Cada prueba completa cuesta unos centavos de dólar.
            </p>
          )}
        </section>
      </div>

      <details className="tarjeta p-4">
        <summary className="cursor-pointer text-sm font-semibold">+ Agregar pregunta</summary>
        <div className="mt-4"><FormularioPrueba /></div>
      </details>

      <ul className="space-y-2">
        {conCobertura.map((p) => (
          <TarjetaPrueba
            key={p.id} prueba={p} faltanEnPrompt={p.faltanEnPrompt} conIA={!!ia}
            probado={p.probado_at ? fechaHora(p.probado_at) : null}
          />
        ))}
      </ul>
    </div>
  )
}
