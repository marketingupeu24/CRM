'use client'

// Encabezado de acciones del chat: estado del bot (pausa) y botones Atendido / Matriculado.
import { useTransition } from 'react'
import { botAtiendeLead, type LeadEstado } from '@crm/db'
import { useAviso } from '@/components/Confirmacion'
import { YaRespondi } from '@/components/YaRespondi'
import { cambiarEstado, pausarBot, type Resultado } from '../acciones'

function horaLima(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

interface Props {
  leadId: string
  estado: LeadEstado
  botPausadoHasta: string | null
  tieneAsesor: boolean
  ahora: number
  /** Está en "Sin responder": muestra "✓ Ya le respondí" */
  sinResponder?: boolean
}

export function ControlesChat({ leadId, estado, botPausadoHasta, tieneAsesor, ahora, sinResponder = false }: Props) {
  const [pendiente, iniciar] = useTransition()
  const avisar = useAviso()
  const ejecutar = (accion: () => Promise<Resultado>) => iniciar(async () => { const r = await accion(); if (r.error) void avisar(r.error) })

  const pausado = !!botPausadoHasta && Date.parse(botPausadoHasta) > ahora
  const botResponde = botAtiendeLead(estado, botPausadoHasta, ahora)

  // corto: lo que se ve en el chip; texto: el detalle (al pasar el mouse)
  let aviso: { corto: string; texto: string; estilo: string }
  if (estado === 'lead_asignado' || estado === 'lead_interesado') {
    aviso = { corto: 'Bot callado', texto: 'Genesys no le responde: el lead espera a su asesor.', estilo: 'bg-slate-100 text-slate-700' }
  } else if (pausado) {
    aviso = { corto: `Pausa hasta ${horaLima(botPausadoHasta!)}`, texto: `Genesys en pausa hasta las ${horaLima(botPausadoHasta!)}: no responderá mientras conversas.`, estilo: 'bg-sky-50 text-sky-800' }
  } else if (!tieneAsesor) {
    aviso = { corto: 'Bot respondiendo · sin asesor', texto: 'Este lead aún no tiene asesor y Genesys le está respondiendo. Asígnalo o pausa el bot antes de escribirle.', estilo: 'bg-amber-50 text-amber-800' }
  } else {
    aviso = { corto: 'Bot respondiendo', texto: 'Genesys está respondiendo a este lead.', estilo: 'bg-amber-50 text-amber-800' }
  }
  // Si el chat es angosto, letra y relleno más chicos (el texto siempre se ve, en una línea)
  const chico = 'shrink-0 rounded-md px-2 py-0.5 font-medium whitespace-nowrap @max-[38rem]:px-1.5'

  return (
    <div className="flex min-w-0 flex-nowrap items-center justify-end gap-1.5 text-xs @max-[38rem]:gap-1 @max-[38rem]:text-[11px] @max-[26rem]:text-[10px]">
      <span title={aviso.texto} className={`min-w-0 truncate rounded-full px-2 py-0.5 whitespace-nowrap ${aviso.estilo}`}>🤖<span> {aviso.corto}</span></span>
      {pausado && (
        <button disabled={pendiente} onClick={() => ejecutar(() => pausarBot(leadId, false))} title="Reactivar bot" className={`${chico} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
          ▶<span> Reactivar<span className="@max-[30rem]:hidden"> bot</span></span>
        </button>
      )}
      {botResponde && (
        <button disabled={pendiente} onClick={() => ejecutar(() => pausarBot(leadId, true))} title="Pausar bot 5 h" className={`${chico} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
          ⏸<span> Pausar<span className="@max-[30rem]:hidden"> bot 5 h</span></span>
        </button>
      )}
      {sinResponder && <YaRespondi leadId={leadId} className={`${chico} border border-slate-300 text-slate-700 hover:bg-slate-50`} />}
      {estado !== 'lead_atendido' && estado !== 'lead_matriculado' && (
        <button
          disabled={pendiente} onClick={() => ejecutar(() => cambiarEstado(leadId, 'lead_atendido'))}
          title="Marcar como atendido" className={`${chico} bg-teal-600 text-white hover:brightness-110`}
        >
          ✓<span> Atendido</span>
        </button>
      )}
      {estado !== 'lead_matriculado' && (
        <button
          disabled={pendiente} onClick={() => ejecutar(() => cambiarEstado(leadId, 'lead_matriculado'))}
          title="Marcar como matriculado" className={`${chico} bg-emerald-600 text-white hover:brightness-110`}
        >
          🎓<span> Matriculado</span>
        </button>
      )}
    </div>
  )
}
