'use client'

// "🤝 Atendidos como apoyo": quitar de mi lista un lead de otro asesor que ya no necesito ver.
import { useTransition } from 'react'
import { ocultarApoyo } from './acciones'
import { useAviso, useConfirmar } from '@/components/Confirmacion'

export function QuitarApoyo({ leadId, nombre }: { leadId: string; nombre: string }) {
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  const avisar = useAviso()
  const quitar = async () => {
    const ok = await confirmar({
      titulo: '¿Quitar de tu lista de apoyo?',
      mensaje: <>Dejarás de ver a <b>{nombre}</b> en «Atendidos como apoyo». El lead sigue siendo de su asesor y no se borra nada.</>,
      confirmar: 'Quitar',
    })
    if (!ok) return
    iniciar(async () => { const r = await ocultarApoyo(leadId); if (r.error) void avisar(r.error) })
  }
  return (
    <button
      type="button" onClick={quitar} disabled={pendiente} title="Quitar de mi lista de apoyo"
      className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    >
      {pendiente ? '…' : '✕ Quitar'}
    </button>
  )
}
