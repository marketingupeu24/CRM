// Rangos de fechas (hora de Lima) para filtrar leads por mes o por campaña.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-09" de hoy en Lima, desplazado n meses. */
export function mesLima(desplazar = 0): string {
  const [a, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()).split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + desplazar, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** "2026-09" -> { desde: "2026-09-01", hasta: "2026-09-30" }. */
export function rangoMes(mes: string): { desde: string; hasta: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return null
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

/** "2026-09" -> "setiembre 2026". */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}

/** Fecha "2026-09-01" -> "01/09/2026". */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split('-')
  return `${d}/${m}/${a}`
}

export interface Campana {
  id: number
  nombre: string
  origen: string | null
  inicio: string
  fin: string
  activa: boolean
}
