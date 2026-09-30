import type { LeadEstado } from '@crm/db'

const ZONA = 'America/Lima'

export function fechaHora(valor: string | null | undefined): string {
  if (!valor) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(valor))
}

export function fecha(valor: string | null | undefined): string {
  if (!valor) return '—'
  return new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(valor))
}

/**
 * "hace 3 días", "hace 2 h", "hace un momento".
 * En componentes de cliente pasa `ahora` desde el servidor: así el HTML del servidor
 * y el del navegador coinciden aunque los relojes difieran.
 */
export function haceCuanto(valor: string | null | undefined, ahora: number = Date.now()): string {
  if (!valor) return '—'
  const minutos = Math.floor((ahora - Date.parse(valor)) / 60_000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`
}

/** Clases de color para la insignia de cada estado del lead. */
export const COLOR_ESTADO: Record<LeadEstado, string> = {
  lead_nuevo: 'bg-slate-100 text-slate-700 ring-slate-300',
  lead_en_conversacion: 'bg-sky-50 text-sky-700 ring-sky-200',
  lead_no_interesado: 'bg-zinc-100 text-zinc-500 ring-zinc-300',
  lead_interesado: 'bg-amber-50 text-amber-700 ring-amber-200',
  lead_asignado: 'bg-orange-50 text-orange-700 ring-orange-200',
  lead_contactado: 'bg-blue-50 text-blue-700 ring-blue-200',
  lead_atendido: 'bg-teal-50 text-teal-700 ring-teal-200',
  lead_inscrito: 'bg-violet-50 text-violet-700 ring-violet-200',
  lead_matriculado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  lead_perdido: 'bg-rose-50 text-rose-700 ring-rose-200',
}

/** Mensaje de error de Supabase entendible para el usuario. */
export function mensajeError(error: { message?: string } | null | undefined): string {
  const texto = error?.message ?? 'Error desconocido'
  if (texto.includes('row-level security')) return 'No tienes permiso para esta acción.'
  if (texto.includes('leads_dni_unico')) return 'Ya existe un lead con ese DNI.'
  if (texto.includes('duplicate key')) return 'Ese registro ya existe.'
  return texto
}

const formatoNumero = new Intl.NumberFormat('es-PE')

/** 1234 -> '1,234' */
export const num = (n: number) => formatoNumero.format(n)

/** Porcentaje con un decimal; '—' si el total es 0. */
export const pct = (parte: number, total: number) => (total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : '—')
