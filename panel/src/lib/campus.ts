// Campus al que postula el alumno (leads.sede). Hay datos antiguos escritos a mano ("Campus Juliaca", "JULIACA"): se agrupan.
export const CAMPUS = ['Juliaca', 'Lima', 'Tarapoto'] as const
export type Campus = (typeof CAMPUS)[number]

export function campusDe(sede: string | null | undefined): Campus | null {
  const s = (sede ?? '').toLowerCase()
  return CAMPUS.find((c) => s.includes(c.toLowerCase())) ?? null
}
