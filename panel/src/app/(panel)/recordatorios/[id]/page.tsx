import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { ReporteEnvios, type FilaReporte } from './ReporteEnvios'

export const metadata: Metadata = { title: 'Envíos del recordatorio' }

/** Reporte de un envío masivo: a quién se mandó, si llegó, si respondió o pidió no recibir más, y quiénes faltan. */
export default async function PaginaEnviosRecordatorio(props: PageProps<'/recordatorios/[id]'>) {
  await exigirPermiso('conocimiento')
  const id = Number((await props.params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const supabase = await crearClienteServidor()
  const [{ data: rec }, { data: filas, error }] = await Promise.all([
    supabase.from('recordatorios_alumnos').select('id, titulo, mensaje, activo, completado_at, enviar_el, desde_hora, dias_sin_contacto').eq('id', id).maybeSingle(),
    supabase.rpc('reporte_recordatorio', { p_id: id }),
  ])
  if (!rec) notFound()
  const estado = rec.completado_at ? '✅ Terminado' : rec.activo ? '🟢 Enviando' : '⏸ Apagado'

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link href="/recordatorios" className="text-sm text-marca-700 hover:underline">← Recordatorios</Link>
        <h1 className="mt-1 text-2xl font-semibold">{rec.titulo}</h1>
        <p className="text-sm text-slate-500">
          {estado} · {rec.dias_sin_contacto ? `automático a los ${rec.dias_sin_contacto} días sin contacto` : `desde el ${rec.enviar_el} a las ${rec.desde_hora.slice(0, 5)}`} ·
          se envía en horario de atención, 4 cada 10 minutos.
        </p>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}
      <ReporteEnvios filas={(filas ?? []) as FilaReporte[]} titulo={rec.titulo} />
      <details className="tarjeta p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Mensaje enviado</summary>
        <p className="mt-2 whitespace-pre-wrap text-slate-700">{rec.mensaje}</p>
      </details>
    </div>
  )
}
