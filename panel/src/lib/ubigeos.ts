// Procedencia de los leads: país (ISO, ej. PE) y UBIGEO del INEI (DD0000 departamento, DDPP00 provincia, DDPPDD distrito).
// La lista de UBIGEO está en public/ubigeos.json como [[codigo, nombre], ...] (la misma que la tabla ubigeos de la base).
import { paraBuscar } from './texto'

export type FilaUbigeo = [codigo: string, nombre: string]
export type Ubigeos = Map<string, string>

export const nivelUbigeo = (codigo: string): 1 | 2 | 3 => (codigo.endsWith('0000') ? 1 : codigo.endsWith('00') ? 2 : 3)
export const departamentoDe = (codigo: string) => `${codigo.slice(0, 2)}0000`
export const provinciaDe = (codigo: string) => `${codigo.slice(0, 4)}00`

/** "Juliaca · San Román · Puno" (del nivel elegido hacia arriba). */
export function rutaUbigeo(codigo: string, ubigeos: Ubigeos): string {
  const partes = [codigo]
  if (nivelUbigeo(codigo) === 3) partes.push(provinciaDe(codigo))
  if (nivelUbigeo(codigo) >= 2) partes.push(departamentoDe(codigo))
  return partes.map((c) => ubigeos.get(c) ?? c).join(' · ')
}

/** Busca por nombre (sin tildes): primero los que empiezan igual, luego Puno (campus Juliaca), luego por nivel. */
export function buscarUbigeos(consulta: string, filas: FilaUbigeo[], max = 8): FilaUbigeo[] {
  const q = paraBuscar(consulta.trim())
  if (q.length < 2) return []
  const encontrados: { fila: FilaUbigeo; puntos: number }[] = []
  for (const fila of filas) {
    const nombre = paraBuscar(fila[1])
    const pos = nombre.indexOf(q)
    if (pos < 0) continue
    const puntos = (nombre === q ? 0 : pos === 0 ? 10 : 20) + (fila[0].startsWith('21') ? 0 : 5) + nivelUbigeo(fila[0])
    encontrados.push({ fila, puntos })
  }
  return encontrados.sort((a, b) => a.puntos - b.puntos || a.fila[1].localeCompare(b.fila[1], 'es')).slice(0, max).map((e) => e.fila)
}

let cache: Promise<FilaUbigeo[]> | null = null
/** En el navegador: carga la lista una sola vez (≈50 KB, comprimida ≈15 KB). */
export function cargarUbigeos(): Promise<FilaUbigeo[]> {
  cache ??= fetch('/ubigeos.json').then((r) => {
    if (!r.ok) throw new Error('No se pudo cargar la lista de lugares')
    return r.json() as Promise<FilaUbigeo[]>
  }).catch((e) => { cache = null; throw e })
  return cache
}

// ---------------------------------------------------------------------
// País
// ---------------------------------------------------------------------
const nombresPais = new Intl.DisplayNames(['es'], { type: 'region' })
/** "PE" → "Perú". */
export function nombrePais(iso: string | null | undefined): string {
  if (!iso) return 'Sin dato'
  try { return nombresPais.of(iso) ?? iso } catch { return iso }
}

/** Países para elegir (los más frecuentes primero). */
export const PAISES = ['PE', 'BO', 'CL', 'AR', 'BR', 'CO', 'EC', 'VE', 'PY', 'UY', 'MX', 'US', 'ES', 'IT', 'CA', 'CR', 'DO', 'GT', 'HN', 'NI', 'PA', 'SV', 'CU', 'FR', 'DE', 'GB', 'JP', 'KR', 'CN'] as const

/** País según el celular. Igual que pais_de_telefono() en la base. */
export function paisDeTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null
  if (/^[A-Z]{2}\./.test(telefono)) return telefono.slice(0, 2)
  const t = telefono.replace(/\D/g, '')
  const reglas: [RegExp, string][] = [
    [/^51\d{8,9}$/, 'PE'], [/^591\d{8}$/, 'BO'], [/^56\d{9}$/, 'CL'], [/^54\d{10,11}$/, 'AR'], [/^55\d{10,11}$/, 'BR'],
    [/^57\d{10}$/, 'CO'], [/^593\d{8,9}$/, 'EC'], [/^58\d{10}$/, 'VE'], [/^595\d{9}$/, 'PY'], [/^598\d{8}$/, 'UY'],
    [/^52\d{10,11}$/, 'MX'], [/^34\d{9}$/, 'ES'], [/^39\d{9,10}$/, 'IT'], [/^1\d{10}$/, 'US'],
  ]
  return reglas.find(([r]) => r.test(t))?.[1] ?? null
}

/** Texto de la procedencia de un lead para mostrar ("Juliaca · San Román · Puno", "Bolivia", null si no hay dato). */
export function textoProcedencia(lead: { pais: string | null; ubigeo: string | null; telefono: string }, ubigeos: Ubigeos | null): string | null {
  const pais = lead.pais ?? paisDeTelefono(lead.telefono)
  if (lead.ubigeo && ubigeos) return rutaUbigeo(lead.ubigeo, ubigeos) + (pais && pais !== 'PE' ? ` (${nombrePais(pais)})` : '')
  return pais && pais !== 'PE' ? nombrePais(pais) : null
}
