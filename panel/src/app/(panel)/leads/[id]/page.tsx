import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { asesorDeLaVista, COOKIE_BANDEJA, COOKIE_DETALLES, leerPreferencia } from '@/lib/bandeja'
import { CasillaDetalles } from './CasillaDetalles'
import { CARRERAS_OFICIALES, carreraParecida, ETIQUETAS_FUENTE, type Fuente, type InteraccionTipo } from '@crm/db'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { PuntajeInteres } from '@/components/PuntajeInteres'
import { fechaHora, haceCuanto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { BotonEliminarNota, BotonPapelera, EditarDatos, FormularioNota, ReasignarAsesor, SelectorEstado } from './Acciones'
import { esDelChat } from '@/lib/chat'
import { Conversacion, type MensajeChat } from './Conversacion'
import { ControlesChat } from './ControlesChat'
import { RegistrarContacto } from './RegistrarContacto'
import { AccionesRapidas } from './AccionesRapidas'
import { ProformaRapida } from './ProformaRapida'
import { ListaConversaciones, type Conversacion as ItemBandeja } from './ListaConversaciones'
import { BandejaMovil } from './BandejaMovil'
import { QuitarApoyo } from './QuitarApoyo'
import { BotonesTarea, FormularioTarea } from '@/components/Tareas'

/** Sugerencias de carrera al editar los datos (presencial, campus Juliaca) */
const CARRERAS_EDITAR = [...CARRERAS_OFICIALES]

export const metadata: Metadata = { title: 'Ficha del lead' }

const TIPO_INTERACCION: Record<InteraccionTipo, { etiqueta: string; estilo: string }> = {
  mensaje_lead: { etiqueta: 'Mensaje del lead', estilo: 'bg-sky-100 text-sky-700' },
  respuesta_bot: { etiqueta: 'Respuesta de Genesys', estilo: 'bg-slate-100 text-slate-600' },
  mensaje_asesor: { etiqueta: 'Mensaje del asesor', estilo: 'bg-green-100 text-green-700' },
  cambio_estado: { etiqueta: 'Cambio de estado', estilo: 'bg-amber-100 text-amber-700' },
  nota_asesor: { etiqueta: 'Nota', estilo: 'bg-emerald-100 text-emerald-700' },
  llamada: { etiqueta: 'Contacto del asesor', estilo: 'bg-violet-100 text-violet-700' },
  sistema: { etiqueta: 'Sistema', estilo: 'bg-zinc-100 text-zinc-600' },
}

const NOTIFICACION: Record<string, string> = {
  pendiente: 'Aviso al asesor pendiente',
  notificado: 'Asesor avisado por WhatsApp',
  error: 'Error al avisar al asesor',
  omitida: 'Sin aviso automático (registro manual o asesor elegido a mano)',
  fuera_horario: 'Llegó con la oficina cerrada: el asesor lo ve en el resumen de apertura',
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

export default async function PaginaFicha(props: PageProps<'/leads/[id]'>) {
  return <FichaLead id={(await props.params).id} seccion="leads" />
}

/** La ficha con el chat. Se usa en Leads (/leads/[id]) y en Chats (/chats/[id]): en Chats el menú queda en "Chats"
 *  y la bandeja te lleva a otras conversaciones sin salir de esa sección. */
export async function FichaLead({ id, seccion }: { id: string; seccion: 'leads' | 'chats' }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { esAdmin, perfil, puede } = await exigirPermiso(seccion)
  const supabase = await crearClienteServidor()

  const camposBandeja = 'id, nombre, telefono, ultimo_mensaje_texto, ultimo_mensaje_at, ultimo_mensaje_lead_at, sin_responder, asesor_id, fecha_asignado, reasignaciones'
  // Bandeja: la última vista elegida (todo el equipo, los míos o los de un asesor) se recuerda en una cookie
  const preferencia = leerPreferencia((await cookies()).get(COOKIE_BANDEJA)?.value)
  // Panel de detalles abierto o cerrado como lo dejaste en la conversación anterior
  const detallesMarcado = (await cookies()).get(COOKIE_DETALLES)?.value === '1'
  const asesorBandeja = asesorDeLaVista(preferencia, perfil.id, esAdmin)
  const deLaVista = <T extends { eq: (c: 'asesor_id', v: string) => T }>(c: T) => (asesorBandeja ? c.eq('asesor_id', asesorBandeja) : c)
  const [{ data: propio }, { data: historial }, { data: asesores }, { data: tareas }, { data: todasRespuestas }, { data: ocultas }, { data: recientes }, { data: esperando }, { data: sinChat }, { data: deApoyo }, { data: miApoyo }] = await Promise.all([
    supabase.from('leads').select('*, asesor:asesores!leads_asesor_id_fkey(id, nombre, telefono), actividad:actividades(id, nombre)').eq('id', id).maybeSingle(),
    supabase.from('lead_interacciones')
      .select('*, autor:asesores!lead_interacciones_autor_id_fkey(nombre)')
      .eq('lead_id', id).order('created_at', { ascending: false }).limit(300),
    puede('asignar')
      ? supabase.from('asesores').select('id, nombre, activo').or('rol.eq.asesor,activo.eq.true').is('eliminado_at', null).order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string; activo: boolean }[] }),
    supabase.from('tareas').select('id, titulo, vence_at').eq('lead_id', id).is('completada_at', null).order('vence_at'),
    // Respuestas rápidas del chat: las "para todos" y las personales mías, menos las que elegí no usar
    supabase.from('respuestas_rapidas').select('id, titulo, contenido, asesor_id, categoria').eq('activa', true)
      .or(`asesor_id.is.null,asesor_id.eq.${perfil.id}`).order('orden').order('titulo'),
    supabase.from('respuestas_ocultas').select('respuesta_id').eq('asesor_id', perfil.id),
    puede('chats')
      ? deLaVista(supabase.from('leads').select(camposBandeja).not('ultimo_mensaje_at', 'is', null)).order('ultimo_mensaje_at', { ascending: false }).limit(80)
      : Promise.resolve({ data: [] }),
    puede('chats')
      ? deLaVista(supabase.from('leads').select(camposBandeja).eq('sin_responder', true)).order('ultimo_mensaje_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [] }),
    // Asignados o reasignados en la última semana (con o sin mensajes): suben arriba hasta que alguien escriba
    puede('chats')
      ? deLaVista(supabase.from('leads').select(camposBandeja).not('asesor_id', 'is', null)
        .gte('fecha_asignado', new Date(Date.now() - 7 * 86_400_000).toISOString())).order('fecha_asignado', { ascending: false }).limit(40)
      : Promise.resolve({ data: [] }),
    // Leads de otros asesores que atendí como apoyo o que cubro por su ausencia: salen con etiqueta
    puede('chats') ? supabase.rpc('mis_leads_apoyo') : Promise.resolve({ data: [] }),
    // ¿Soy apoyo de este lead? (para poder quitarlo de mi lista)
    supabase.from('lead_apoyo').select('oculto_at').eq('lead_id', id).eq('asesor_id', perfil.id).maybeSingle(),
  ])
  // Asesores para el filtro de la bandeja (solo quien ve los chats de todo el equipo)
  const { data: asesoresBandeja } = esAdmin && puede('chats') ? await supabase.rpc('posibles_reemplazos') : { data: [] as { id: string; nombre: string }[] }
  const propsBandeja = { actualId: id, preferencia, asesores: (asesoresBandeja ?? []) as { id: string; nombre: string }[], miId: perfil.id, veTodos: esAdmin, base: `/${seccion}` as const }
  // Bandeja: sin repetir, de la más reciente a la más antigua
  const vistos = new Set<string>()
  type ConFechas = { ultimo_mensaje_at: string | null; fecha_asignado: string | null; asesor_id: string | null }
  // Recién asignado o reasignado: nadie escribió desde que se lo dieron a su asesor (en la última semana)
  const haceSemana = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const recienAsignado = (c: ConFechas) => !!c.asesor_id && !!c.fecha_asignado && c.fecha_asignado > haceSemana && c.fecha_asignado > (c.ultimo_mensaje_at ?? '')
  const cuando = (c: ConFechas) => (recienAsignado(c) ? c.fecha_asignado! : c.ultimo_mensaje_at ?? c.fecha_asignado ?? '')
  // De apoyo: solo en la vista propia (no al mirar los chats de otro asesor)
  const apoyos = !asesorBandeja || asesorBandeja === perfil.id ? (deApoyo ?? []) : []
  const etiquetaApoyo = new Map(apoyos.map((a) => [a.id, a.cubriendo ? `🧳 Cubres a ${a.asesor ?? 'otro asesor'}` : '🤝 Apoyo']))
  const bandeja: ItemBandeja[] = [...(esperando ?? []), ...(recientes ?? []), ...(sinChat ?? []),
    ...apoyos.filter((a) => a.ultimo_mensaje_at || !a.cubriendo).map((a) => ({ ...a, asesor_id: null, fecha_asignado: a.desde, reasignaciones: 0 }))]
    .filter((c) => !vistos.has(c.id) && vistos.add(c.id))
    .sort((a, b) => cuando(b).localeCompare(cuando(a)))
    .map((c) => ({
      id: c.id, nombre: c.nombre ?? c.telefono,
      ultimo: c.ultimo_mensaje_at ? c.ultimo_mensaje_texto : 'Aún sin mensajes',
      deMi: !!c.ultimo_mensaje_at && c.ultimo_mensaje_lead_at !== c.ultimo_mensaje_at,
      hace: haceCuanto(cuando(c) || null), sinResponder: !!c.sin_responder, mio: c.asesor_id === perfil.id, ultimoAlumno: c.ultimo_mensaje_lead_at,
      etiqueta: etiquetaApoyo.get(c.id) ?? (recienAsignado(c) ? (c.reasignaciones ? '🔁 Reasignado' : '📌 Asignado') : undefined),
    }))
  const noUsa = new Set((ocultas ?? []).map((o) => o.respuesta_id))
  // Las personales primero
  const respuestas = (todasRespuestas ?? []).filter((r) => !noUsa.has(r.id))
    .map((r) => ({ id: r.id, titulo: r.titulo, contenido: r.contenido, personal: r.asesor_id !== null, categoria: r.categoria }))
    .sort((a, b) => Number(b.personal) - Number(a.personal))
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
    ['Nombre', lead.nombre],
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
    <div className="group space-y-4 max-xl:flex max-md:h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] md:max-xl:h-[calc(100dvh-8rem)] max-xl:flex-col max-xl:gap-2 max-xl:space-y-0 max-xl:overflow-hidden xl:flex xl:h-[calc(100dvh-8rem)] xl:flex-col xl:space-y-0 xl:gap-4 xl:overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 max-xl:shrink-0 max-xl:flex-nowrap max-xl:gap-x-2 xl:shrink-0">
        <Link href={seccion === 'chats' ? '/chats?lista' : '/leads'} title={seccion === 'chats' ? 'Volver a chats' : 'Volver a leads'} aria-label={seccion === 'chats' ? 'Volver a chats' : 'Volver a leads'} className="-ml-1 rounded-lg px-1.5 text-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">←</Link>
        <h1 className="text-xl font-semibold max-xl:min-w-0 max-xl:truncate max-xl:text-lg md:text-2xl">{lead.nombre ?? 'Lead sin nombre'}</h1>
        <span className="shrink-0"><InsigniaEstado estado={lead.estado} /></span>
        <span className="shrink-0"><PuntajeInteres puntaje={lead.puntaje} motivos={lead.puntaje_motivos} /></span>
        {puede('chats') && <BandejaMovil key="bandeja-movil" conversaciones={bandeja} {...propsBandeja} />}
        <label className="ml-auto hidden cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-superficie px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 has-checked:border-marca-600 has-checked:text-marca-700 xl:inline-flex" title="Mostrar u ocultar el panel de detalles (estado, próxima acción, notas, datos)">
          <CasillaDetalles marcada={detallesMarcado} />📋 Detalles
        </label>
        {puede('papelera') && !apoyo && <span className="hidden"><BotonPapelera leadId={lead.id} nombre={lead.nombre ?? lead.telefono} /></span>}
      </div>

      {apoyo && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 max-xl:shrink-0 max-xl:px-3 max-xl:py-2 max-xl:text-xs">
          🤝 Eres <b>asesor(a) de apoyo</b> (lo atendiste en persona o cubres la ausencia de su asesor): es lead de <b>{lead.asesor?.nombre ?? 'otro asesor'}</b>.
          Puedes ver su conversación, escribirle y dejar notas; su estado y seguimiento los lleva su asesor(a).
          {miApoyo && !miApoyo.oculto_at && <span className="ml-2 inline-block"><QuitarApoyo key="quitar-apoyo" leadId={lead.id} nombre={lead.nombre ?? lead.telefono} /></span>}
        </p>
      )}
      {!apoyo && miApoyo && !miApoyo.oculto_at && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-violet-700 max-xl:shrink-0">
          🤝 Lo atendiste como apoyo: sale con esa etiqueta en tus chats.
          <QuitarApoyo key="quitar-apoyo" leadId={lead.id} nombre={lead.nombre ?? lead.telefono} />
        </p>
      )}

      <div className="max-xl:shrink-0 xl:hidden">
        <AccionesRapidas telefono={lead.telefono} proformaHref={puede('costos') ? `/costos?lead=${lead.id}` : undefined} />
      </div>

      {/* Celular: pestañas Chat | Detalles (el chat queda fijo; estado, próxima acción, notas y datos a un toque) */}
      <div role="tablist" aria-label="Vista de la ficha" className="flex shrink-0 rounded-xl border border-slate-200 bg-slate-100 p-1 text-sm font-medium xl:hidden">
        <label className="flex-1 cursor-pointer rounded-lg py-1.5 text-center text-slate-600 has-checked:bg-superficie has-checked:text-marca-700 has-checked:shadow-theme-xs">
          <input type="radio" name="pestana-ficha" id="pestana-chat" defaultChecked className="sr-only" />💬 Chat
        </label>
        <label className="flex-1 cursor-pointer rounded-lg py-1.5 text-center text-slate-600 has-checked:bg-superficie has-checked:text-marca-700 has-checked:shadow-theme-xs">
          <input type="radio" name="pestana-ficha" id="pestana-detalles" className="sr-only" />📋 Detalles
        </label>
      </div>

      {/* Pantallas grandes: el chat ocupa todo el alto (como en las bandejas de Intercom o Chatwoot) y el panel lateral se desplaza aparte */}
      <div className="grid gap-4 max-xl:min-h-0 max-xl:flex-1 max-xl:grid-rows-[minmax(0,1fr)] xl:min-h-0 xl:flex-1 xl:grid-cols-[17rem_minmax(0,1fr)_3.5rem] xl:grid-rows-[minmax(0,1fr)] xl:group-has-[#alternar-detalles:checked]:grid-cols-[17rem_minmax(0,1fr)_3.5rem_21rem] 3xl:grid-cols-[19rem_minmax(0,1fr)_3.5rem_23rem] 3xl:group-has-[#alternar-detalles:checked]:grid-cols-[19rem_minmax(0,1fr)_3.5rem]">
        {/* Bandeja de conversaciones (pantallas grandes) */}
        {puede('chats') && (
          <div className="hidden xl:order-1 xl:flex xl:min-h-0 xl:flex-col">
            <ListaConversaciones key="bandeja" conversaciones={bandeja} {...propsBandeja} />
          </div>
        )}
        {!puede('chats') && <div className="hidden xl:order-1 xl:block" />}
        {/* Pantallas grandes: acciones rápidas en íconos a la derecha del chat (se despliegan hacia la izquierda al pasar el mouse) */}
        <div className="relative hidden xl:order-3 xl:z-20 xl:block">
          <AccionesRapidas
            variante="riel" telefono={lead.telefono} proformaHref={puede('costos') ? `/costos?lead=${lead.id}` : undefined}
            alFinal={puede('papelera') && !apoyo ? <BotonPapelera key="papelera" variante="riel" leadId={lead.id} nombre={lead.nombre ?? lead.telefono} /> : undefined}
          />
        </div>
        <div className="space-y-4 max-xl:flex max-xl:min-h-0 max-xl:flex-col max-xl:gap-2 max-xl:space-y-0 max-xl:group-has-[#pestana-detalles:checked]:hidden xl:order-2 xl:flex xl:min-h-0 xl:flex-col xl:gap-4 xl:space-y-0">
          {lead.origen === 'actividad' && !lead.ultimo_mensaje_lead_at && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Este alumno se registró con un QR y <b>aún no escribe al WhatsApp</b>. Para cuidar el número de Genesys, espera su mensaje
              (el formulario le pidió escribirnos) o llámalo; si le escribes primero desde aquí, el bot inicia la conversación.
            </p>
          )}
          <Conversacion
            leadId={lead.id} telefono={lead.telefono} inicial={chat} nombreAlumno={lead.nombre}
            miNombre={perfil.nombre} nombresAutores={nombresAutores}
            respuestas={respuestas}
            acciones={puede('costos') ? (
              <ProformaRapida key="proforma" datos={{
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
              <ControlesChat key="controles"
                leadId={lead.id} estado={lead.estado} botPausadoHasta={lead.bot_pausado_hasta}
                tieneAsesor={!!lead.asesor_id} ahora={Date.now()} sinResponder={!!lead.sin_responder}
              />
            )}
          />

        </div>

        <div className="space-y-4 max-xl:hidden max-xl:min-h-0 max-xl:overflow-y-auto max-xl:overscroll-contain max-xl:group-has-[#pestana-detalles:checked]:block xl:hidden space-y-3 xl:order-4 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:group-has-[#alternar-detalles:checked]:block 3xl:block 3xl:group-has-[#alternar-detalles:checked]:hidden">
          {/* Resumen: lo que más se usa, compacto y siempre a la vista */}
          <section className="tarjeta divide-y divide-slate-100">
            <div className="space-y-1.5 p-4">
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Estado</h2>
              {apoyo
                ? <InsigniaEstado estado={lead.estado} />
                : <SelectorEstado key={lead.estado} leadId={lead.id} estado={lead.estado} />}
            </div>
            <div className="space-y-1.5 p-4">
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Asesor</h2>
              <p className="text-sm font-medium">{lead.asesor?.nombre ?? <span className="text-slate-400">Sin asesor</span>}</p>
              {lead.notificacion_estado && (
                <p className={`text-xs ${lead.notificacion_estado === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
                  {NOTIFICACION[lead.notificacion_estado] ?? lead.notificacion_estado}
                  {lead.notificacion_error ? `: ${lead.notificacion_error}` : ''}
                </p>
              )}
              {puede('asignar') && !apoyo && (
                <ReasignarAsesor key={lead.asesor_id} leadId={lead.id} asesorId={lead.asesor_id} asesores={asesores ?? []} />
              )}
            </div>
            <div className="p-3">
              <RegistrarContacto leadId={lead.id} />
            </div>
          </section>

          {!apoyo && <details id="proxima-accion" open className="group/sec tarjeta scroll-mt-36">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span>📅 Próxima acción{!!tareas?.length && <span className="ml-1.5 rounded-full bg-marca-50 px-1.5 text-xs text-marca-700">{tareas.length}</span>}</span><span aria-hidden className="text-xs text-slate-400 transition group-open/sec:rotate-180">▾</span></summary>
            <div className="px-4 pb-4">
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
            </div>
          </details>}

          <details id="nueva-nota" className="group/sec tarjeta scroll-mt-36">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span>📝 Nueva nota</span><span aria-hidden className="text-xs text-slate-400 transition group-open/sec:rotate-180">▾</span></summary>
            <div className="px-4 pb-4"><FormularioNota leadId={lead.id} /></div>
          </details>

          <details id="datos" className="group/sec tarjeta scroll-mt-32">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span>🪪 Datos del lead</span><span aria-hidden className="text-xs text-slate-400 transition group-open/sec:rotate-180">▾</span></summary>
            <div className="px-4 pb-4">
            {!apoyo && <div className="mb-3 flex justify-end"><EditarDatos lead={lead} puedeCelular={puede('editar_celular') || lead.registrado_por === perfil.id} carreras={CARRERAS_EDITAR} /></div>}
            <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
              {datos.map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt className="text-xs text-slate-500">{etiqueta}</dt>
                  <dd className="mt-0.5">{valor ?? <span className="text-slate-400">—</span>}</dd>
                </div>
              ))}
            </dl>
            </div>
          </details>

          <details className="group/sec tarjeta">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span>🕘 Actividad <span className="ml-1 text-xs font-normal text-slate-400">{actividad.length}</span></span><span aria-hidden className="text-xs text-slate-400 transition group-open/sec:rotate-180">▾</span></summary>
            <ol className="space-y-3 px-4 pb-4">
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
          </details>
          {puede('papelera') && !apoyo && <div className="flex justify-end xl:hidden"><BotonPapelera leadId={lead.id} nombre={lead.nombre ?? lead.telefono} /></div>}
        </div>
      </div>
    </div>
  )
}
