import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ETIQUETAS_FUENTE, type Fuente, type InteraccionTipo } from '@crm/db'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { fechaHora, haceCuanto } from '@/lib/formato'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { BotonEliminarNota, EditarDatos, FormularioNota, ReasignarAsesor, SelectorEstado } from './Acciones'

export const metadata: Metadata = { title: 'Ficha del lead' }

const TIPO_INTERACCION: Record<InteraccionTipo, { etiqueta: string; estilo: string }> = {
  mensaje_lead: { etiqueta: 'Mensaje del lead', estilo: 'bg-sky-100 text-sky-700' },
  respuesta_bot: { etiqueta: 'Respuesta de Genesys', estilo: 'bg-slate-100 text-slate-600' },
  cambio_estado: { etiqueta: 'Cambio de estado', estilo: 'bg-amber-100 text-amber-700' },
  nota_asesor: { etiqueta: 'Nota', estilo: 'bg-emerald-100 text-emerald-700' },
  sistema: { etiqueta: 'Sistema', estilo: 'bg-zinc-100 text-zinc-600' },
}

const NOTIFICACION: Record<string, string> = {
  pendiente: 'Aviso al asesor pendiente',
  notificado: 'Asesor avisado por WhatsApp',
  error: 'Error al avisar al asesor',
  omitida: 'Aviso enviado por el Apps Script / no requerido',
}

/** "lead_nuevo -> lead_en_conversacion" en palabras */
function textoCambioEstado(contenido: string | null): string {
  const etiquetas: Record<string, string> = {
    lead_nuevo: 'Nuevo', lead_en_conversacion: 'En conversación', lead_no_interesado: 'No interesado',
    lead_interesado: 'Interesado', lead_asignado: 'Asignado', lead_contactado: 'Contactado',
    lead_inscrito: 'Inscrito', lead_matriculado: 'Matriculado', lead_perdido: 'Perdido',
  }
  return (contenido ?? '').split(' -> ').map((e) => etiquetas[e] ?? e).join(' → ')
}

export default async function FichaLead(props: PageProps<'/leads/[id]'>) {
  const { id } = await props.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { esAdmin, perfil } = await obtenerSesion()
  const supabase = await crearClienteServidor()

  const [{ data: lead }, { data: historial }, { data: asesores }] = await Promise.all([
    supabase.from('leads').select('*, asesor:asesores!leads_asesor_id_fkey(id, nombre, telefono)').eq('id', id).maybeSingle(),
    supabase.from('lead_interacciones')
      .select('*, autor:asesores!lead_interacciones_autor_id_fkey(nombre)')
      .eq('lead_id', id).order('created_at', { ascending: false }).limit(300),
    esAdmin
      ? supabase.from('asesores').select('id, nombre, activo').eq('rol', 'asesor').order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string; activo: boolean }[] }),
  ])
  if (!lead) notFound()

  const datos: [string, React.ReactNode][] = [
    ['Celular', <a key="tel" href={`https://wa.me/${lead.telefono}`} target="_blank" rel="noreferrer" className="text-marca-700 hover:underline">{lead.telefono} ↗</a>],
    ['DNI', lead.dni],
    ['Programa', lead.programa === 'cepre' ? 'CePre' : 'Pregrado'],
    ['Carrera', lead.carrera_interes],
    ['Modalidad', lead.modalidad],
    ['Convocatoria', lead.convocatoria],
    ['Sede', lead.sede],
    ['Fuente', ETIQUETAS_FUENTE[lead.origen as Fuente] ?? lead.origen],
    ['Consulta', lead.resumen],
    ['Mensajes al bot', lead.total_mensajes],
    ['Primer contacto', fechaHora(lead.primer_contacto)],
    ['Último contacto', `${fechaHora(lead.ultimo_contacto)} (${haceCuanto(lead.ultimo_contacto)})`],
    ['Asignado', fechaHora(lead.fecha_asignado)],
    ['Motivo no interés / pérdida', lead.motivo_no_interes],
    ['Registros repetidos', lead.duplicados_ignorados || null],
  ]

  return (
    <div className="space-y-6">
      <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-800">← Volver a leads</Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{lead.nombre ?? 'Lead sin nombre'}</h1>
        <InsigniaEstado estado={lead.estado} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="tarjeta p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Datos del lead</h2>
              <EditarDatos lead={lead} />
            </div>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {datos.map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt className="text-xs text-slate-500">{etiqueta}</dt>
                  <dd className="mt-0.5">{valor ?? <span className="text-slate-400">—</span>}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="tarjeta p-6">
            <h2 className="mb-4 font-semibold">Historial</h2>
            <ol className="space-y-4">
              {(historial ?? []).map((h) => {
                const tipo = TIPO_INTERACCION[h.tipo]
                const esMiNota = h.tipo === 'nota_asesor' && (h.autor_id === perfil.id || esAdmin)
                return (
                  <li key={h.id} className="flex gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${tipo.estilo}`}>{tipo.etiqueta}</span>
                        <span className="text-slate-500" title={fechaHora(h.created_at)}>{haceCuanto(h.created_at)}</span>
                        {h.autor?.nombre && <span className="text-slate-500">· {h.autor.nombre}</span>}
                        {esMiNota && <BotonEliminarNota leadId={lead.id} notaId={h.id} />}
                      </div>
                      <p className="mt-1 text-sm break-words whitespace-pre-wrap text-slate-700">
                        {h.tipo === 'cambio_estado' ? textoCambioEstado(h.contenido) : h.contenido}
                      </p>
                    </div>
                  </li>
                )
              })}
              {!historial?.length && <p className="text-sm text-slate-500">Sin interacciones todavía.</p>}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          <section className="tarjeta p-6">
            <h2 className="mb-3 font-semibold">Estado</h2>
            <SelectorEstado key={lead.estado} leadId={lead.id} estado={lead.estado} />
          </section>

          <section className="tarjeta p-6">
            <h2 className="mb-3 font-semibold">Asesor</h2>
            <p className="text-sm">{lead.asesor?.nombre ?? <span className="text-slate-400">Sin asesor</span>}</p>
            {lead.notificacion_estado && (
              <p className={`mt-1 text-xs ${lead.notificacion_estado === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
                {NOTIFICACION[lead.notificacion_estado] ?? lead.notificacion_estado}
                {lead.notificacion_error ? `: ${lead.notificacion_error}` : ''}
              </p>
            )}
            {esAdmin && (
              <div className="mt-4">
                <ReasignarAsesor key={lead.asesor_id} leadId={lead.id} asesorId={lead.asesor_id} asesores={asesores ?? []} />
              </div>
            )}
          </section>

          <section className="tarjeta p-6">
            <h2 className="mb-3 font-semibold">Nueva nota</h2>
            <FormularioNota leadId={lead.id} />
          </section>
        </div>
      </div>
    </div>
  )
}
