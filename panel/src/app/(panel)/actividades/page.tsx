import type { Metadata } from 'next'
import { exigirPermiso } from '@/lib/sesion'
import { urlBase } from '@/lib/sitio'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FormularioActividad, TarjetaActividad, type Actividad } from './Controles'

export const metadata: Metadata = { title: 'Actividades y QR' }

export default async function PaginaActividades() {
  const { perfil, puede } = await exigirPermiso('actividades')
  const supabase = await crearClienteServidor()
  const [{ data, error }, { data: resumen }, { data: asesores }, base] = await Promise.all([
    supabase.from('actividades')
      .select('id, codigo, nombre, tipo, lugar, fecha, activa, asignacion, bienvenida, responsable_id, responsable:asesores!actividades_responsable_id_fkey(nombre)')
      .order('activa', { ascending: false }).order('fecha', { ascending: false, nullsFirst: true }).order('id', { ascending: false }),
    supabase.rpc('resumen_actividades'),
    puede('asignar')
      ? supabase.from('asesores').select('id, nombre').eq('rol', 'asesor').eq('activo', true).is('eliminado_at', null).order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    urlBase(),
  ])
  const porActividad = new Map((resumen ?? []).map((r) => [r.actividad_id, r]))
  const actividades: Actividad[] = (data ?? []).map((a) => ({
    ...a,
    responsable: a.responsable?.nombre ?? null,
    registrados: porActividad.get(a.id)?.registrados ?? 0,
    contactados: porActividad.get(a.id)?.contactados ?? 0,
    matriculados: porActividad.get(a.id)?.matriculados ?? 0,
    editable: a.responsable_id === perfil.id || puede('ver_todos'),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Actividades y QR</h1>
        <p className="text-sm text-slate-500">
          Para ferias y visitas a colegios: crea la actividad, imprime o muestra su QR y los alumnos dejan sus datos desde su celular.
          Cada registro entra como lead (sin duplicados), se asigna y el asesor recibe el aviso por WhatsApp.
        </p>
      </div>

      <details className="tarjeta p-5" open={!actividades.length}>
        <summary className="cursor-pointer font-semibold">+ Nueva actividad</summary>
        <div className="mt-4"><FormularioActividad asesores={asesores ?? []} /></div>
      </details>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <ul className="space-y-4">
        {actividades.map((a) => <TarjetaActividad key={a.id} actividad={a} base={base} asesores={asesores ?? []} />)}
        {!actividades.length && <li className="tarjeta px-5 py-10 text-center text-sm text-slate-500">Aún no hay actividades. Crea la primera arriba.</li>}
      </ul>
    </div>
  )
}
