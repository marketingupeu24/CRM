import { ETIQUETAS_ESTADO, type LeadEstado } from '@crm/db'
import { COLOR_ESTADO } from '@/lib/formato'

export function InsigniaEstado({ estado }: { estado: LeadEstado }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${COLOR_ESTADO[estado]}`}>
      {ETIQUETAS_ESTADO[estado]}
    </span>
  )
}
