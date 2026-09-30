'use client'

// Encabezado de acciones del chat: estado del bot (pausa) y botones Atendido / Matriculado.
import { useState, useTransition } from 'react'
import { botAtiendeLead, type LeadEstado } from '@crm/db'
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
}

export function ControlesChat({ leadId, estado, botPausadoHasta, tieneAsesor, ahora }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<Resultado>({})
  const ejecutar = (accion: () => Promise<Resultado>) => iniciar(async () => setResultado(await accion()))

  const pausado = !!botPausadoHasta && Date.parse(botPausadoHasta) > ahora
  const botResponde = botAtiendeLead(estado, botPausadoHasta, ahora)

  let aviso: { texto: string; estilo: string }
  if (estado === 'lead_asignado' || estado === 'lead_interesado') {
    aviso = { texto: 'Genesys no le responde: el lead espera a su asesor.', estilo: 'bg-slate-50 text-slate-700 border-slate-200' }
  } else if (pausado) {
    aviso = { texto: `Genesys en pausa hasta las ${horaLima(botPausadoHasta!)}: no responderá mientras conversas.`, estilo: 'bg-sky-50 text-sky-800 border-sky-200' }
  } else if (!tieneAsesor) {
    aviso = { texto: 'Este lead aún no tiene asesor y Genesys le está respondiendo. Asígnalo o pausa el bot antes de escribirle.', estilo: 'bg-amber-50 text-amber-800 border-amber-200' }
  } else {
    aviso = { texto: 'Genesys está respondiendo a este lead.', estilo: 'bg-amber-50 text-amber-800 border-amber-200' }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 border-b px-5 py-2 text-xs ${aviso.estilo}`}>
      <span className="mr-auto">🤖 {aviso.texto}</span>
      {pausado && (
        <button disabled={pendiente} onClick={() => ejecutar(() => pausarBot(leadId, false))} className="rounded border border-current px-2 py-0.5 font-medium hover:bg-white/60">
          Reactivar bot
        </button>
      )}
      {botResponde && (
        <button disabled={pendiente} onClick={() => ejecutar(() => pausarBot(leadId, true))} className="rounded border border-current px-2 py-0.5 font-medium hover:bg-white/60">
          Pausar bot 5 h
        </button>
      )}
      {estado !== 'lead_atendido' && estado !== 'lead_matriculado' && (
        <button
          disabled={pendiente} onClick={() => ejecutar(() => cambiarEstado(leadId, 'lead_atendido'))}
          className="rounded bg-teal-600 px-2.5 py-1 font-semibold text-white hover:bg-teal-700"
        >
          ✓ Atendido
        </button>
      )}
      {estado !== 'lead_matriculado' && (
        <button
          disabled={pendiente} onClick={() => ejecutar(() => cambiarEstado(leadId, 'lead_matriculado'))}
          className="rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
        >
          🎓 Matriculado
        </button>
      )}
      {resultado.error && <span role="alert" className="w-full text-rose-700">{resultado.error}</span>}
    </div>
  )
}
