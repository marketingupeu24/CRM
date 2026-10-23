// Utilidades del chat del lead: formatos de fecha/hora, atajo "/" y búsqueda de respuestas rápidas.
import type { LeadInteraccion } from '@crm/db'
import { diaLima, paraBuscar } from '@/lib/texto'

export type MensajeChat = LeadInteraccion & { autor_nombre?: string | null }

/** Respuesta rápida tal como llega al chat (con la marca de personal y su categoría). */
export interface RespuestaChat { id: number; titulo: string; contenido: string; personal?: boolean; categoria?: string | null }

/** Pantalla táctil (celular): Enter hace salto de línea y se envía con el botón */
export const TACTIL = '(pointer: coarse)'
export function suscribirTactil(cambio: () => void) {
  const m = matchMedia(TACTIL)
  m.addEventListener('change', cambio)
  return () => m.removeEventListener('change', cambio)
}

/** Atajo "/texto" al inicio de la última línea del mensaje: devuelve dónde empieza y lo buscado */
export function atajoEscrito(texto: string): { desde: number; buscado: string } | null {
  const m = /(?:^|\n)\/([^\n]{0,40})$/.exec(texto)
  if (!m) return null
  return { desde: texto.length - m[1]!.length - 1, buscado: m[1]! }
}

/** Respuestas que coinciden con lo buscado: primero las que lo tienen en el título */
export function buscarRespuestas<T extends { titulo: string; contenido: string }>(respuestas: T[], buscado: string): T[] {
  const palabras = paraBuscar(buscado).split(/\s+/).filter(Boolean)
  if (!palabras.length) return respuestas
  const normalizadas = respuestas.map((r) => ({ r, titulo: paraBuscar(r.titulo), todo: paraBuscar(r.titulo + ' ' + r.contenido) }))
  const enTitulo = normalizadas.filter((n) => palabras.every((p) => n.titulo.includes(p)))
  const yaEnTitulo = new Set(enTitulo)
  const enTexto = normalizadas.filter((n) => !yaEnTitulo.has(n) && palabras.every((p) => n.todo.includes(p)))
  return [...enTitulo, ...enTexto].map((n) => n.r)
}

/** Lo que se puede adjuntar en el chat (igual que el bucket "chat-envios"). */
export const TIPOS_ADJUNTO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const MAX_ADJUNTO = 10 * 1024 * 1024

/** "Hoy", "Ayer" o "lunes 13 de octubre" (con el año si no es el actual). */
export function etiquetaDia(dia: string): string {
  const hoy = diaLima(new Date().toISOString())
  const ayer = diaLima(new Date(Date.now() - 86_400_000).toISOString())
  if (dia === hoy) return 'Hoy'
  if (dia === ayer) return 'Ayer'
  const fecha = new Date(`${dia}T12:00:00Z`)
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', ...(dia.slice(0, 4) !== hoy.slice(0, 4) ? { year: 'numeric' } : {}),
  }).format(fecha)
}

/** Solo la hora ("07:33 p. m."): el día va en el separador. */
export function soloHora(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** Fecha y hora completas (para el título al pasar el mouse). */
export function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

/** Quién habla: alumno, bot o un asesor en particular (para agrupar mensajes seguidos). */
export const quien = (m: MensajeChat) => (m.tipo === 'mensaje_asesor' ? `asesor-${m.autor_id ?? ''}` : m.tipo)

/** Distancia al final (px) para considerar que el asesor está "abajo" leyendo lo último. */
export const CERCA_DEL_FINAL = 150
