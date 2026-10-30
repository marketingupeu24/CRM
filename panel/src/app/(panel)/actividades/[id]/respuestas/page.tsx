import type { Metadata } from 'next'
import Link from '@/components/Enlace'
import { notFound } from 'next/navigation'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { fechaHora } from '@/lib/formato'
import { leerFormulario } from '@/lib/formulario-actividad'
import { rutaUbigeo } from '@/lib/ubigeos'
import { UBIGEOS } from '@/lib/ubigeos-servidor'
import { BotonCsv } from '@/components/BotonCsv'

export const metadata: Metadata = { title: 'Respuestas del formulario' }

interface Respuesta { id: string; pregunta: string; respuesta: string }

/** Respuestas a las preguntas propias de una actividad: una fila por alumno y una columna por pregunta. */
export default async function RespuestasActividad(props: PageProps<'/actividades/[id]/respuestas'>) {
  const { id } = await props.params
  if (!/^\d+$/.test(id)) notFound()
  await exigirPermiso('actividades')
  const supabase = await crearClienteServidor()
  const [{ data: act }, { data: filas, error }] = await Promise.all([
    supabase.from('actividades').select('id, nombre, lugar, formulario').eq('id', Number(id)).maybeSingle(),
    supabase.from('actividad_respuestas')
      .select('lead_id, respuestas, updated_at, lead:leads(nombre, telefono, dni, carrera_interes, colegio, ubigeo, asesor:asesores!leads_asesor_id_fkey(nombre))')
      .eq('actividad_id', Number(id)).order('updated_at', { ascending: false }).limit(2000),
  ])
  if (!act) notFound()

  // Columnas: las preguntas actuales y, al final, las que ya se quitaron pero tienen respuestas
  const actuales = leerFormulario(act.formulario).preguntas.map((p) => ({ id: p.id, texto: p.texto }))
  const columnas = [...actuales]
  for (const f of filas ?? []) {
    for (const r of f.respuestas as unknown as Respuesta[]) {
      if (!columnas.some((c) => c.id === r.id)) columnas.push({ id: r.id, texto: `${r.pregunta} (ya no está en el formulario)` })
    }
  }
  const tabla = (filas ?? []).map((f) => {
    const porId = new Map((f.respuestas as unknown as Respuesta[]).map((r) => [r.id, r.respuesta]))
    return {
      leadId: f.lead_id,
      nombre: f.lead?.nombre ?? '—',
      telefono: f.lead?.telefono ?? '',
      dni: f.lead?.dni ?? '',
      carrera: f.lead?.carrera_interes ?? '',
      colegio: f.lead?.colegio ?? '',
      // Domicilio (procedencia del lead): "Juliaca · San Román · Puno"
      domicilio: f.lead?.ubigeo && UBIGEOS.has(f.lead.ubigeo) ? rutaUbigeo(f.lead.ubigeo, UBIGEOS) : '',
      asesor: f.lead?.asesor?.nombre ?? '',
      fecha: f.updated_at,
      valores: columnas.map((c) => porId.get(c.id) ?? ''),
    }
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/actividades" className="text-sm text-marca-700 hover:underline">← Actividades y QR</Link>
          <h1 className="mt-1 text-2xl font-semibold">Respuestas: {act.nombre}</h1>
          <p className="text-sm text-slate-500">{tabla.length} {tabla.length === 1 ? 'alumno respondió' : 'alumnos respondieron'} las preguntas de la actividad{act.lugar ? ` · ${act.lugar}` : ''}</p>
        </div>
        {tabla.length > 0 && (
          <BotonCsv
            nombreArchivo={`respuestas-${act.nombre}`}
            filas={[
              ['Nombre', 'Celular', 'DNI', 'Carrera', 'Colegio', 'Domicilio', 'Asesor', 'Fecha', ...columnas.map((c) => c.texto)],
              ...tabla.map((t) => [t.nombre, t.telefono, t.dni, t.carrera, t.colegio, t.domicilio, t.asesor, fechaHora(t.fecha), ...t.valores]),
            ]}
          />
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      {!tabla.length ? (
        <p className="tarjeta px-5 py-10 text-center text-sm text-slate-500">
          {actuales.length ? 'Aún nadie respondió. Las respuestas aparecen aquí apenas un alumno llena el formulario del QR.' : 'Esta actividad no tiene preguntas propias. Agrégalas en Actividades y QR → Editar → Formulario del QR.'}
        </p>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Alumno</th>
                <th className="px-4 py-2.5">DNI</th>
                <th className="px-4 py-2.5">Carrera</th>
                <th className="px-4 py-2.5">Colegio</th>
                <th className="px-4 py-2.5">Domicilio</th>
                {columnas.map((c) => <th key={c.id} className="max-w-[16rem] px-4 py-2.5 normal-case">{c.texto}</th>)}
                <th className="px-4 py-2.5">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tabla.map((t) => (
                <tr key={t.leadId} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/leads/${t.leadId}`} className="font-medium text-marca-700 hover:underline">{t.nombre}</Link>
                    <p className="text-xs text-slate-500">{t.telefono}{t.asesor ? ` · ${t.asesor}` : ''}</p>
                  </td>
                  {[t.dni, t.carrera, t.colegio, t.domicilio].map((v, i) => <td key={i} className="max-w-[16rem] px-4 py-2.5">{v || <span className="text-slate-300">—</span>}</td>)}
                  {t.valores.map((v, i) => <td key={columnas[i]!.id} className="max-w-[16rem] px-4 py-2.5 whitespace-pre-wrap">{v || <span className="text-slate-300">—</span>}</td>)}
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{fechaHora(t.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
