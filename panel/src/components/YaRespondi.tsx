'use client'

// "✓ Ya le respondí": quita un lead de "Sin responder" cuando el asesor ya lo atendió
// por fuera del chat del CRM (llamada, su WhatsApp) o el mensaje no necesitaba respuesta.
import { useTransition } from 'react'
import { marcarAtendido } from '@/app/(panel)/pendientes/acciones'
import { useAviso } from '@/components/Confirmacion'

/** claseTexto: para esconder el texto en espacios angostos (queda "✓"). */
export function YaRespondi({ leadId, className, claseTexto = '' }: { leadId: string; className?: string; claseTexto?: string }) {
  const [pendiente, iniciar] = useTransition()
  const avisar = useAviso()
  return (
    <button
      type="button" disabled={pendiente}
      title="Ya lo atendiste (por llamada, por tu WhatsApp o no necesitaba respuesta): quítalo de «Sin responder»"
      onClick={() => iniciar(async () => { const r = await marcarAtendido(leadId); if (r.error) void avisar(r.error) })}
      className={className ?? 'shrink-0 rounded border border-emerald-600 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50'}
    >
      {pendiente ? '…' : <>✓<span className={claseTexto}> Ya le respondí</span></>}
    </button>
  )
}
