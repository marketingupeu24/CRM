import type { Metadata } from 'next'
import Link from 'next/link'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { BotonesTarea } from '@/components/Tareas'
import { YaRespondi } from '@/components/YaRespondi'
import { fechaHora, haceCuanto } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { DIAS_SIN_ACTIVIDAD, finDeHoyLima, HORAS_SIN_CONTACTAR, limitesAlertas } from '@/lib/pendientes'
import { crearClienteServidor } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Pendientes' }

interface FilaLead {
  id: string
  nombre: string | null
  telefono: string
  estado: Parameters<typeof InsigniaEstado>[0]['estado']
  asesor: { nombre: string } | null
}

function ListaLeads(
  { titulo, descripcion, leads, detalle, esAdmin, vacio, accion }:
  {
    titulo: string; descripcion: string; leads: FilaLead[]; detalle: (l: FilaLead) => string; esAdmin: boolean; vacio: string
    /** Botón al lado de cada lead (p. ej. "Ya le respondí") */
    accion?: (l: FilaLead) => React.ReactNode
  },
) {
  return (
    <section className="tarjeta">
      <div className="flex items-baseline justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <h2 className="font-semibold">{titulo}</h2>
          <p className="text-xs text-slate-500">{descripcion}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${leads.length ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
          {leads.length}
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {leads.map((l) => (
          <li key={l.id} className="flex items-center gap-2 pr-3 hover:bg-slate-50">
            <Link href={`/leads/${l.id}#chat`} className="block min-w-0 flex-1 py-2.5 pl-5 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-marca-700">{l.nombre ?? l.telefono}</span>
                <span className="shrink-0 text-xs text-slate-500">{detalle(l)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <InsigniaEstado estado={l.estado} />
                {esAdmin && <span className="truncate">{l.asesor?.nombre ?? 'Sin asesor'}</span>}
              </div>
            </Link>
            {accion?.(l)}
          </li>
        ))}
        {!leads.length && <li className="px-5 py-6 text-center text-sm text-slate-400">{vacio}</li>}
      </ul>
    </section>
  )
}

export default async function PaginaPendientes() {
  const { esAdmin } = await exigirPermiso('pendientes')
  const supabase = await crearClienteServidor()
  const ahora = Date.now()
  const { contacto: limiteContacto, actividad: limiteActividad } = limitesAlertas(ahora)
  const en7Dias = new Date(ahora + 7 * 86_400_000).toISOString()
  const camposLead = 'id, nombre, telefono, estado, asesor:asesores!leads_asesor_id_fkey(nombre)'

  const [tareasR, sinContactarR, sinResponderR, inactivosR, futurasR] = await Promise.all([
    supabase.from('tareas')
      .select('id, titulo, vence_at, lead:leads(id, nombre, telefono, estado), asesor:asesores!tareas_asesor_id_fkey(nombre)')
      .is('completada_at', null).lte('vence_at', en7Dias).order('vence_at').limit(200),
    supabase.from('leads').select(camposLead + ', fecha_asignado')
      .eq('estado', 'lead_asignado').lt('fecha_asignado', limiteContacto).order('fecha_asignado').limit(100),
    supabase.from('leads').select(camposLead + ', ultimo_mensaje_lead_at')
      .eq('sin_responder', true).order('ultimo_mensaje_lead_at').limit(100),
    supabase.from('leads').select(camposLead + ', ultimo_contacto, ultima_respuesta_at')
      .eq('estado', 'lead_contactado').lt('ultimo_contacto', limiteActividad).lt('updated_at', limiteActividad)
      .or(`ultima_respuesta_at.is.null,ultima_respuesta_at.lt.${limiteActividad}`)
      .order('ultimo_contacto').limit(100),
    // Agendados más adelante (p. ej. "el próximo año, cuando esté en 5to"): no cuentan como "sin actividad"
    supabase.from('tareas')
      .select('id, titulo, vence_at, lead_id, lead:leads(id, nombre, telefono, estado), asesor:asesores!tareas_asesor_id_fkey(nombre)')
      .is('completada_at', null).gt('vence_at', en7Dias).order('vence_at').limit(500),
  ])
  const futuras = futurasR.data ?? []

  const tareas = tareasR.data ?? []
  // Con una tarea por venir (esta semana o más adelante) el lead no está "sin actividad"
  const conTareaFutura = new Set([...futuras.map((t) => t.lead_id), ...tareas.filter((t) => Date.parse(t.vence_at) > ahora).map((t) => t.lead?.id)])
  const finHoy = Date.parse(finDeHoyLima())
  const vencidas = tareas.filter((t) => Date.parse(t.vence_at) < ahora)
  const hoy = tareas.filter((t) => Date.parse(t.vence_at) >= ahora && Date.parse(t.vence_at) <= finHoy)
  const proximas = tareas.filter((t) => Date.parse(t.vence_at) > finHoy)
  const error = tareasR.error ?? sinContactarR.error ?? sinResponderR.error ?? inactivosR.error ?? futurasR.error

  const GrupoTareas = ({ titulo, lista, estilo }: { titulo: string; lista: typeof tareas; estilo: string }) => (
    <div>
      <h3 className={`px-5 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase ${estilo}`}>{titulo} · {lista.length}</h3>
      <ul className="divide-y divide-slate-100">
        {lista.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.titulo}</p>
              <p className="truncate text-xs text-slate-500">
                <Link href={`/leads/${t.lead?.id}`} className="text-marca-700 hover:underline">{t.lead?.nombre ?? t.lead?.telefono}</Link>
                {' · '}{fechaHora(t.vence_at)}
                {esAdmin && t.asesor && ` · ${t.asesor.nombre}`}
              </p>
            </div>
            {t.lead && <BotonesTarea tareaId={t.id} leadId={t.lead.id} />}
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pendientes</h1>
        <p className="text-sm text-slate-500">
          {esAdmin ? 'Pendientes de todo el equipo' : 'Lo que tienes que atender'}: tus tareas agendadas y las alertas automáticas.
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <section className="tarjeta pb-2">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">Tareas agendadas</h2>
          <p className="text-xs text-slate-500">Se agendan desde la ficha del lead (tarjeta «Próxima acción»).</p>
        </div>
        {!tareas.length && <p className="px-5 py-6 text-center text-sm text-slate-400">No tienes tareas en los próximos 7 días.</p>}
        {!!vencidas.length && <GrupoTareas titulo="Vencidas" lista={vencidas} estilo="text-rose-600" />}
        {!!hoy.length && <GrupoTareas titulo="Hoy" lista={hoy} estilo="text-amber-600" />}
        {!!proximas.length && <GrupoTareas titulo="Próximos 7 días" lista={proximas} estilo="text-slate-500" />}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <ListaLeads
          titulo="Sin contactar" esAdmin={esAdmin}
          descripcion={`Asignados hace más de ${HORAS_SIN_CONTACTAR} h y nadie les escribió`}
          leads={(sinContactarR.data ?? []) as unknown as FilaLead[]}
          detalle={(l) => haceCuanto((l as FilaLead & { fecha_asignado: string }).fecha_asignado, ahora)}
          vacio="Todos tus leads asignados ya fueron contactados."
        />
        <ListaLeads
          titulo="Sin responder" esAdmin={esAdmin}
          descripcion="Escribieron y esperan respuesta"
          leads={(sinResponderR.data ?? []) as unknown as FilaLead[]}
          detalle={(l) => haceCuanto((l as FilaLead & { ultimo_mensaje_lead_at: string }).ultimo_mensaje_lead_at, ahora)}
          vacio="No hay mensajes sin responder."
          accion={(l) => <YaRespondi leadId={l.id} />}
        />
        <ListaLeads
          titulo="Sin actividad" esAdmin={esAdmin}
          descripcion={`Contactados sin movimiento en ${DIAS_SIN_ACTIVIDAD} días`}
          leads={((inactivosR.data ?? []) as unknown as FilaLead[]).filter((l) => !conTareaFutura.has(l.id))}
          detalle={(l) => haceCuanto((l as FilaLead & { ultimo_contacto: string }).ultimo_contacto, ahora)}
          vacio="Ningún lead contactado está detenido."
        />
      </div>

      <details className="tarjeta">
        <summary className="cursor-pointer px-5 py-3">
          <span className="font-semibold">Agendados más adelante</span>
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-600">{futuras.length}</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Tareas para después de 7 días (por ejemplo, alumnos de 4to para contactar cuando pasen a 5to). Aparecen arriba cuando se acerque la fecha
            y mientras tanto no salen en «Sin actividad».
          </span>
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {futuras.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.titulo}</p>
                <p className="truncate text-xs text-slate-500">
                  <Link href={`/leads/${t.lead?.id}`} className="text-marca-700 hover:underline">{t.lead?.nombre ?? t.lead?.telefono}</Link>
                  {' · '}{fechaHora(t.vence_at)}
                  {esAdmin && t.asesor && ` · ${t.asesor.nombre}`}
                </p>
              </div>
              {t.lead && <BotonesTarea tareaId={t.id} leadId={t.lead.id} />}
            </li>
          ))}
          {!futuras.length && <li className="px-5 py-6 text-center text-sm text-slate-400">No hay tareas agendadas más adelante.</li>}
        </ul>
      </details>
    </div>
  )
}
