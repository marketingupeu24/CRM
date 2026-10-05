import type { Metadata } from 'next'
import Link from 'next/link'
import { CATEGORIAS_CONOCIMIENTO, type CategoriaConocimiento } from '@crm/db'
import { fechaHora } from '@/lib/formato'
import { textoParaGenesys } from '@/lib/genesys'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { CopiarTexto, FormularioEntrada, TarjetaEntrada, type Entrada } from './Controles'

export const metadata: Metadata = { title: 'Base de conocimiento' }

function parametro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? ''
}

export default async function PaginaConocimiento(props: PageProps<'/conocimiento'>) {
  const sp = await props.searchParams
  const { puede } = await obtenerSesion()
  const editable = puede('conocimiento')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('conocimiento')
    .select('id, categoria, titulo, contenido, activo, orden, updated_at').order('orden').order('titulo')
  const entradas = (data ?? []) as (Entrada & { updated_at: string })[]
  const porCompletar = entradas.filter((e) => !e.activo).length
  const ultima = entradas.reduce((max, e) => (e.updated_at > max ? e.updated_at : max), '')
  // Desde "Revisión del bot": abre el formulario con la pregunta del lead como título
  const nuevo = parametro(sp.nuevo)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Base de conocimiento de Genesys</h1>
        <p className="text-sm text-slate-500">
          Lo que el bot sabe y cómo debe responder. {editable ? 'Cuando cambies algo, copia el texto y pégalo en BuilderBot.' : 'Consúltala para responder igual que el bot.'}
          {ultima && <> Última actualización: {fechaHora(ultima)}.</>}
        </p>
      </div>

      {porCompletar > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Hay <b>{porCompletar}</b> {porCompletar === 1 ? 'sección por completar' : 'secciones por completar'} (costos, becas, fechas…).
          Son las preguntas que Genesys hoy no puede responder.{editable ? ' Complétalas y marca "Incluir en el texto".' : ''}
        </p>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
        <div className="space-y-6">
          {editable && (
            <details className="tarjeta p-5" open={!!nuevo}>
              <summary className="cursor-pointer font-semibold">+ Agregar información</summary>
              <div className="mt-4">
                <FormularioEntrada inicial={nuevo ? { titulo: nuevo.slice(0, 120), categoria: 'otros', activo: true } : undefined} />
              </div>
            </details>
          )}
          {(Object.entries(CATEGORIAS_CONOCIMIENTO) as [CategoriaConocimiento, string][]).map(([clave, nombre]) => {
            const lista = entradas.filter((e) => e.categoria === clave)
            if (!lista.length) return null
            return (
              <section key={clave} className="tarjeta p-5">
                <h2 className="mb-3 font-semibold">{nombre}</h2>
                <ul className="space-y-3">
                  {lista.map((e) => <TarjetaEntrada key={e.id} entrada={e} editable={editable} />)}
                </ul>
              </section>
            )
          })}
        </div>

        {editable && (
          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <section className="tarjeta p-5">
              <h2 className="font-semibold">Texto para Genesys</h2>
              <p className="mt-1 mb-4 text-xs text-slate-500">
                Reúne las reglas y los datos marcados para incluir. En BuilderBot: abre tu proyecto, entra al bloque
                de IA (asistente) del flujo de Genesys y reemplaza su prompt o conocimiento por este texto. Si tu plan
                tiene la opción de dividir los mensajes en partes, apágala.
              </p>
              <CopiarTexto texto={textoParaGenesys(entradas)} />
            </section>
            <Link href="/revision-bot" className="tarjeta block p-4 text-sm hover:bg-slate-50">
              <b>Revisión del bot</b>
              <span className="block text-xs text-slate-500">Preguntas que Genesys no supo responder →</span>
            </Link>
          </aside>
        )}
      </div>
    </div>
  )
}
