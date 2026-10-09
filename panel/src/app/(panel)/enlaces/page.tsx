import type { Metadata } from 'next'
import { exigirPermiso } from '@/lib/sesion'
import { urlBase } from '@/lib/sitio'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FormularioEnlace, TarjetaEnlace, type Enlace, type ResultadoEnlace } from './Controles'

export const metadata: Metadata = { title: 'Enlaces y QR por medio' }

/** Un enlace y un QR por medio (TikTok, Facebook, flyers…) para saber de dónde llega cada lead. */
export default async function PaginaEnlaces() {
  const { puede } = await exigirPermiso('campanas')
  const editable = puede('gestionar_campanas')
  const supabase = await crearClienteServidor()
  const [{ data: enlaces }, { data: resultados }, base] = await Promise.all([
    supabase.from('enlaces_origen').select('id, nombre, origen, codigo, mensaje, visitas, activo').order('activo', { ascending: false }).order('created_at', { ascending: false }),
    supabase.rpc('resultados_enlaces'),
    urlBase(),
  ])
  const porId = new Map((resultados ?? []).map((r) => [r.id, r]))
  const vacio: ResultadoEnlace = { leads: 0, registrados: 0, contactados: 0, inscritos: 0, matriculados: 0 }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">🔗 Enlaces y QR por medio</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Crea un enlace y un QR para cada medio: biografía de TikTok, publicación de Facebook, flyers, afiches, radio…
          Abren WhatsApp con un mensaje listo; cuando el alumno lo envía, queda registrado de qué medio llegó
          (&quot;Nos conoció por&quot;) y aquí ves cuántos escribieron, se inscribieron y se matricularon por cada uno.
        </p>
      </div>

      {editable && (
        <details className="tarjeta p-4">
          <summary className="cursor-pointer text-sm font-semibold">+ Nuevo enlace y QR</summary>
          <div className="mt-4"><FormularioEnlace /></div>
        </details>
      )}

      {(enlaces ?? []).length ? (
        <ul className="space-y-3">
          {(enlaces as Enlace[]).map((e) => (
            <TarjetaEnlace key={e.id} enlace={e} base={base} resultado={porId.get(e.id) ?? vacio} editable={editable} />
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">Aún no hay enlaces. {editable ? 'Crea el primero arriba.' : ''}</p>}

      <p className="text-xs text-slate-500">
        Las visitas son aproximadas (también cuentan las vistas previas de redes sociales). Si el alumno borra el código del mensaje antes de enviarlo, no se puede saber de qué medio llegó.
      </p>
    </div>
  )
}
