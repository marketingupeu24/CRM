// Pequeñas utilidades de texto y fecha que se usaban repetidas en varias páginas.

/** Minúsculas y sin tildes, para buscar sin importar acentos ("Psicología" ≈ "psicologia"). */
export function paraBuscar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Valor de un parámetro de la URL (searchParams): el primero si viene repetido, sin espacios a los lados. */
export function parametro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? ''
}

/** Día en Lima como "AAAA-MM-DD" de una fecha (Date, milisegundos o texto ISO). */
export function diaLima(valor: Date | number | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(valor instanceof Date ? valor : new Date(valor))
}

/** Fecha de hoy en Lima como "AAAA-MM-DD" (con `dias` se mueve: -6 = hace 6 días). */
export function hoyLima(dias = 0): string {
  return diaLima(Date.now() + dias * 86_400_000)
}
