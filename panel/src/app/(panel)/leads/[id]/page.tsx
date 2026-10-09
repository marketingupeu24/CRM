import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { carreraParecida, carreras, ETIQUETAS_FUENTE, type Fuente, type InteraccionTipo } from '@crm/db'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { fechaHora, haceCuanto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { BotonEliminarNota, BotonPapelera, EditarDatos, FormularioNota, ReasignarAsesor, SelectorEstado } from './Acciones'
import { esDelChat } from '@/lib/chat'
import { Conversacion, type MensajeChat } from './Conversacion'
import { ControlesChat } from './ControlesChat'
import { AccionesRapidas } from './AccionesRapidas'
import { ProformaRapida } from './ProformaRapida'
import { BotonesTarea, FormularioTarea } from '@/components/Tareas'

/** Sugerencias de carrera al editar los datos (presencial, campus Juliaca) */
const CARRERAS_EDITAR = [...new Set(carreras('PRES', 'JUL').map((c) => c[0]))]

export const metadata: Metadata = { title: 'Ficha del lead' }

const TIPO_INTERACCION: Record<InteraccionTipo, { etiqueta: string; estilo: string }> = {
  mensaje_lead: { etiqueta: 'Mensaje del lead', estilo: 'bg-sky-100 text-sky-700' },
  respuesta_bot: { etiqueta: 'Respuesta de Genesys', estilo: 'bg-slate-100 text-slate-600' },
  mensaje_asesor: { etiqueta: 'Mensaje del asesor', estilo: 'bg-green-100 text-green-700' },
  cambio_estado: { etiqueta: 'Cambio de estado', estilo: 'bg-amber-100 text-amber-700' },
  nota_asesor: { etiqueta: 'Nota', estilo: 'bg-emerald-100 text-emerald-700' },
  sistema: { etiqueta: 'Sistema', estilo: 'bg-zinc-100 text-zinc-600' },
}

const NOTIFICACION: Record<string, string> = {
  pendiente: 'Aviso al asesor pendiente',
  notificado: 'Asesor avisado por WhatsApp',
  error: 'Error al avisar al asesor',
  omitida: 'Sin aviso automático (registro manual o asesor elegido a mano)',
}

/** "lead_nuevo -> lead_en_conversacion" en palabras */
function textoCambioEstado(contenido: string | null): string {
  const etiquetas: Record<string, string> = {
    lead_nuevo: 'Nuevo', lead_en_conversacion: 'En conversación', lead_no_interesado: 'No interesado',
    lead_interesado: 'Interesado', lead_asignado: 'Asignado', lead_contactado: 'Contactado', lead_atendido: 'Atendido',
    lead_inscrito: 'Inscrito', lead_matriculado: 'Matriculado', lead_perdido: 'Perdido',
  }
  return (contenido ?? '').split(' -> ').map((e) => etiquetas[e] ?? e).join(' → ')
}

export default async function FichaLead(props: PageProps<'/leads/[id]'>) {
  const { id } = await props.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { esAdmin, perfil, puede } = await exigirPermiso('leads')
  const supabase = await crearClienteServidor()

  const [{ data: propio }, { data: historial }, { data: asesores }, { data: tareas }, { data: respuestas }] = await Promise.all([
    supabase.from('leads').select('*, asesor:asesores!leads_asesor_id_fkey(id, nombre, telefono), actividad:actividades(id, nombre)').eq('id', id).maybeSingle(),
    supabase.from('lead_interacciones')
      .select('*, autor:asesores!lead_interacciones_autor_id_fkey(nombre)')
      .eq('lead_id', id).order('created_at', { ascending: false }).limit(300),
    puede('asignar')
      ? supabase.from('asesores').select('id, nombre, activo').or('rol.eq.asesor,activo.eq.true').is('eliminado_at', null).order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string; activo: boolean }[] }),
    supabase.from('tareas').select('id, titulo, vence_at').eq('lead_id', id).is('completada_at', null).order('vence_at'),
    supabase.from('respuestas_rapidas').select('id, titulo, contenido').eq('activa', true).order('orden').order('titulo'),
  ])
  // Asesor de apoyo (atendió en persona al lead de otro): ve la ficha y el chat, el lead sigue siendo del otro
  let lead = propio
  const apoyo = !lead
  if (apoyo) {
    const { data } = await supabase.rpc('lead_apoyo_ficha', { p_lead_id: id })
    lead = data as unknown as typeof propio
  }
  if (!lead) notFound()

  // El chat muestra la conversación de WhatsApp (en orden); el resto va a "Actividad"
  const chat: MensajeChat[] = (historial ?? []).filter(esDelChat).reverse()
    .map(({ autor, ...m }) => ({ ...m, autor_nombre: autor?.nombre ?? null }))
  const actividad = (historial ?? []).filter((h) => !esDelChat(h))
  const nombresAutores = Object.fromEntries(
    (historial ?? []).filter((h) => h.autor_id && h.autor?.nombre).map((h) => [h.autor_id!, h.autor!.nombre]),
  )

  const anuncio = lead.anuncio as { titulo?: string; url?: string; red?: string } | null
  const datos: [string, React.ReactNode][] = [
    ['Celular', <a key="tel" href={`https://wa.me/${lead.telefono}`} target="_blank" rel="noreferrer" className="text-marca-700 hover:underline">{lead.telefono} ↗</a>],
    ['DNI', lead.dni],
    ['Programa', lead.programa === 'cepre' ? 'CePre' : 'Pregrado'],
    ['Carrera', lead.carrera_interes],
    ['Modalidad', lead.modalidad],
    ['Convocatoria', lead.convocatoria],
    ['Sede', lead.sede],
    ['Fuente', ETIQUETAS_FUENTE[lead.origen as Fuente] ?? lead.origen],
    ['Nos conoció por', lead.origen_campana],
    ['Llegó por', lead.canal_entrada],
    ['Anuncio', anuncio
      ? (anuncio.url
        ? <a key="ad" href={anuncio.url} target="_blank" rel="noreferrer" className="text-marca-700 hover:underline">📣 {anuncio.titulo ?? `Anuncio de ${anuncio.red ?? 'Facebook'}`} ↗</a>
        : `📣 ${anuncio.titulo ?? `Anuncio de ${anuncio.red ?? 'Facebook'}`}`)
      : null],
    ['Actividad (QR)', lead.actividad
      ? <Link key="act" href={`/leads?actividad=${lead.actividad.id}`} className="text-marca-700 hover:underline">{lead.actividad.nombre}</Link>
      : null],
    ['Colegio', [lead.colegio, lead.grado].filter(Boolean).join(' · ') || null],
    ['Consulta', lead.resumen],
    ['Mensajes al bot', lead.total_mensajes],
    ['Primer contacto', fechaHora(lead.primer_contacto)],
    ['Último contacto', `${fechaHora(lead.ultimo_contacto)} (${haceCuanto(lead.ultimo_contacto)})`],
    ['Asignado', fechaHora(lead.fecha_asignado)],
    ['Reasignado automáticamente', lead.reasignaciones ? `${lead.reasignaciones} ${lead.reasignaciones === 1 ? 'vez' : 'veces'} (no fue contactado a tiempo)` : null],
    ['Motivo no interés / pérdida', lead.motivo_no_interes],
    ['Registros repetidos', lead.duplicados_ignorados || null],
  ]

  return (
    <div className="space-y-6">
      <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-800">← Volver a leads</Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{lead.nombre ?? 'Lead sin nombre'}</h1>
        <InsigniaEstado estado={lead.estado} />
        {puede('papelera') && !apoyo && <span className="ml-auto"><BotonPapelera leadId={lead.id} nombre={lead.nombre ?? lead.telefono} /></span>}
      </div>

      {apoyo && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          🤝 Eres <b>asesor(a) de apoyo</b> (lo atendiste en persona o cubres la ausencia de su asesor): es lead de <b>{lead.asesor?.nombre ?? 'otro asesor'}</b>.
          Puedes ver su conversación, escribirle y dejar notas; su estado y seguimiento los lleva su asesor(a).
        </p>
      )}

      <AccionesRapidas telefono={lead.telefono} proformaHref={puede('costos') ? `/costos?lead=${lead.id}` : undefined} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {lead.origen === 'actividad' && !lead.ultimo_mensaje_lead_at && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Este alumno se registró con un QR y <b>aún no escribe al WhatsApp</b>. Para cuidar el número de Genesys, espera su mensaje
              (el formulario le pidió escribirnos) o llámalo; si le escribes primero desde aquí, el bot inicia la conversación.
            </p>
          )}
          <Conversacion
            leadId={lead.id} telefono={lead.telefono} inicial={chat}
            miNombre={perfil.nombre} nombresAutores={nombresAutores}
            respuestas={respuestas ?? []}
            acciones={puede('costos') ? (
              <ProformaRapida datos={{
                leadId: lead.id, nombre: lead.nombre, dni: lead.dni, asesor: perfil.nombre,
                carreraSugerida: carreraParecida(lead.carrera_interes ?? lead.modalidad, 'PRES', 'JUL'),
              }} />
            ) : undefined}
            variables={{
              nombre: (lead.nombre ?? '').split(' ')[0] ?? '',
              carrera: lead.carrera_interes ?? lead.modalidad ?? 'la carrera de tu interés',
              asesor: perfil.nombre.split(' ')[0] ?? perfil.nombre,
            }}
            encabezado={apoyo ? undefined : (
              <ControlesChat
                leadId={lead.id} estado={lead.estado} botPausadoHasta={lead.bot_pausado_hasta}
                tieneAsesor={!!lead.asesor_id} ahora={Date.now()}
              />
            )}
          />

          <section id="datos" className="tarjeta scroll-mt-32 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Datos del lead</h2>
              {!apoyo && <EditarDatos lead={lead} puedeCelular={puede('editar_celular') || lead.registrado_por === perfil.id} carreras={CARRERAS_EDITAR} />}
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
            <h2 className="mb-4 font-semibold">Actividad</h2>
            <ol className="space-y-4">
              {actividad.map((h) => {
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
              {!actividad.length && <p className="text-sm text-slate-500">Sin actividad todavía.</p>}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          <section className="tarjeta p-6">
            <h2 className="mb-3 font-semibold">Estado</h2>
            {apoyo
              ? <InsigniaEstado estado={lead.estado} />
              : <SelectorEstado key={lead.estado} leadId={lead.id} estado={lead.estado} />}
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
            {puede('asignar') && !apoyo && (
              <div className="mt-4">
                <ReasignarAsesor key={lead.asesor_id} leadId={lead.id} asesorId={lead.asesor_id} asesores={asesores ?? []} />
              </div>
            )}
          </section>

          {!apoyo && <section id="proxima-accion" className="tarjeta scroll-mt-36 p-6">
            <h2 className="mb-3 font-semibold">Próxima acción</h2>
            {!!tareas?.length && (
              <ul className="mb-4 space-y-2">
                {tareas.map((t) => {
                  const vencida = Date.parse(t.vence_at) < Date.now()
                  return (
                    <li key={t.id} className={`rounded-lg border p-2 text-sm ${vencida ? 'border-rose-200 bg-rose-50' : 'border-slate-200'}`}>
                      <p className="font-medium">{t.titulo}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className={`text-xs ${vencida ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
                          {vencida ? 'Venció ' : ''}{fechaHora(t.vence_at)}
                        </span>
                        <BotonesTarea tareaId={t.id} leadId={lead.id} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <FormularioTarea leadId={lead.id} />
          </section>}

          <section id="nueva-nota" className="tarjeta scroll-mt-36 p-6">
            <h2 className="mb-3 font-semibold">Nueva nota</h2>
            <FormularioNota leadId={lead.id} />
          </section>
        </div>
      </div>
    </div>
  )
}
