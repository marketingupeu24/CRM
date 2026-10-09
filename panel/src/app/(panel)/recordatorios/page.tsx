import type { Metadata } from 'next'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FormularioRecordatorio, TarjetaRecordatorio, type Recordatorio } from './Controles'

export const metadata: Metadata = { title: 'Recordatorios a alumnos' }

/** Avisos automáticos por WhatsApp a los alumnos (cierre de inscripciones, examen…). */
export default async function PaginaRecordatorios() {
  await exigirPermiso('conocimiento')
  const supabase = await crearClienteServidor()
  const { data } = await supabase.from('recordatorios_alumnos')
    .select('id, titulo, mensaje, enviar_el, desde_hora, carreras, excluir_carreras, solo_registrados, activo, completado_at')
    .order('enviar_el').order('id')
  const recordatorios = (data ?? []) as Recordatorio[]
  const resumenes = await Promise.all(recordatorios.map(async (r) => {
    const { data: res } = await supabase.rpc('resumen_recordatorio', { p_id: r.id })
    return (res ?? { pendientes: 0, enviados: 0, errores: 0 }) as { pendientes: number; enviados: number; errores: number }
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">⏰ Recordatorios a alumnos</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Avisos automáticos por WhatsApp (ej. &quot;faltan 3 días para el cierre de inscripciones&quot;). Llegan solo a quienes ya nos escribieron,
          no se inscribieron y no pidieron dejar de recibirlos; una sola vez por alumno, en horario de atención y de a pocos (10 cada 10 minutos).
          Si el alumno responde &quot;NO&quot;, no recibe más.
        </p>
        <p className="mt-2 max-w-3xl rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ El número de Genesys está conectado por QR: los envíos masivos pueden hacer que WhatsApp lo bloquee.
          Úsalos solo para avisos importantes. Con la API oficial de WhatsApp este riesgo desaparece.
        </p>
      </div>

      <details className="tarjeta p-4">
        <summary className="cursor-pointer text-sm font-semibold">+ Nuevo recordatorio</summary>
        <div className="mt-4"><FormularioRecordatorio /></div>
      </details>

      {recordatorios.length ? (
        <ul className="space-y-3">
          {recordatorios.map((r, i) => <TarjetaRecordatorio key={r.id} rec={r} resumen={resumenes[i]!} />)}
        </ul>
      ) : <p className="text-sm text-slate-500">Aún no hay recordatorios.</p>}
    </div>
  )
}
