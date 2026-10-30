import type { Metadata } from 'next'
import Link from '@/components/Enlace'
import { PARTES_GENESYS, type FichaGenesys } from '@crm/db'
import { fechasEnFicha } from '@/lib/genesys'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { Vencimientos, type FichaVencimiento } from './Vencimientos'
import { hoyLima } from '@/lib/texto'

export const metadata: Metadata = { title: 'Vencimientos del prompt' }

/** Todas las fechas "Vence el" del prompt de Genesys en un solo lugar: verlas y programarlas rápido. */
export default async function PaginaVencimientos() {
  const { puede } = await obtenerSesion()
  const editable = puede('conocimiento')
  const supabase = await crearClienteServidor()
  const hoy = hoyLima()
  const [{ data: filas, error }, { data: version }] = await Promise.all([
    supabase.from('genesys_fichas').select('id, parte, titulo, campos, activo, orden, vence_el, vencida_at').order('orden').order('titulo'),
    supabase.from('genesys_versiones').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const ultimaPegada = version?.created_at ?? null
  // Solo interesan las que van en el prompt y las que salieron por vencer
  const fichas: FichaVencimiento[] = ((filas ?? []) as FichaGenesys[])
    .filter((f) => f.activo || f.vencida_at)
    .map((f) => {
      const parte = PARTES_GENESYS.find((p) => p.clave === f.parte)
      // Sugerencia: la última fecha (de hoy en adelante) escrita en la ficha, ej. el día del examen
      const sugerida = fechasEnFicha(f).filter((d) => d >= hoy).at(-1) ?? null
      return {
        id: f.id, titulo: f.titulo, parte: f.parte, parteTitulo: parte?.titulo ?? f.parte, icono: parte?.icono ?? '•',
        venceEl: f.vence_el ?? null, sugerida,
        // Vencida y BuilderBot aún no tiene el prompt sin ella
        pendientePegar: !!f.vencida_at && (!ultimaPegada || f.vencida_at > ultimaPegada),
      }
    })

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/genesys" className="text-sm text-slate-500 hover:text-slate-800">← Prompt de Genesys</Link>
        <h1 className="mt-1 text-2xl font-semibold">⏰ Vencimientos del prompt</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Información que cambia cada campaña (exámenes, CEPRE, promociones): ponle el último día en que vale.
          Al día siguiente sale sola del prompt y el CRM te avisa hasta que pegues el prompt nuevo en BuilderBot.
        </p>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}
      <Vencimientos fichas={fichas} hoy={hoy} editable={editable} />
    </div>
  )
}
