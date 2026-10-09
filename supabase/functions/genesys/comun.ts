// Genesys · Cliente de Supabase, configuración, utilidades, feriados y fecha/horario para Genesys.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../_shared/database.types.ts'
import { elegir, normalizarTelefono, proximaAtencion, textoProximaAtencion } from '../_shared/dominio.ts'

export type Lead = Database['public']['Tables']['leads']['Row']

export type Cuerpo = Record<string, unknown>

export type Respuesta = Record<string, unknown>

export interface ResultadoProcesar {
  status: 'success' | 'updated' | 'duplicate'
  reasignado?: boolean
  lead_id: string
  estado: string
  asesor_id: string | null
  asesor_nombre: string | null
  asesor_telefono: string | null
  notificar: boolean
}

export const supabase = createClient<Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

export const TOKEN = Deno.env.get('GENESYS_BOT_TOKEN') ?? ''

export const MODO: 'sombra' | 'activo' = Deno.env.get('GENESYS_MODO') === 'activo' ? 'activo' : 'sombra'

export const MAX_INTENTOS_NOTIFICACION = 3

// Pausa con la blacklist de BuilderBot (calla al bot, pero BuilderBot deja de enviar los mensajes
// de ese número al CRM). Apagada por defecto: secreto BLACKLIST_PAUSA=activa para encenderla.
export const USAR_BLACKLIST = Deno.env.get('BLACKLIST_PAUSA') === 'activa'

export const PANEL_URL = (Deno.env.get('PANEL_URL') ?? 'https://crm-admision.vercel.app').replace(/\/+$/, '')

// Aviso de mensaje nuevo al asesor: como máximo uno cada 10 minutos por lead
export const MINUTOS_ENTRE_AVISOS = 10

export function responder(datos: Respuesta, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export class ErrorApi extends Error {
  constructor(public codigo: string, mensaje: string, public status = 200) {
    super(mensaje)
  }
}

/** Comparación en tiempo constante para no filtrar el token por tiempos de respuesta. */
export function tokenValido(recibido: string | null): boolean {
  if (!TOKEN || !recibido || recibido.length !== TOKEN.length) return false
  let diferencia = 0
  for (let i = 0; i < TOKEN.length; i++) diferencia |= TOKEN.charCodeAt(i) ^ recibido.charCodeAt(i)
  return diferencia === 0
}

export function telefonoDe(cuerpo: Cuerpo): string {
  const telefono = normalizarTelefono(elegir(cuerpo.telefono, cuerpo.from, cuerpo.celular, cuerpo.Celular))
  if (!telefono) throw new ErrorApi('telefono_invalido', 'Falta el teléfono del lead o no es válido', 400)
  return telefono
}

export async function buscarLead(telefono: string): Promise<Lead> {
  const { data, error } = await supabase.from('leads').select('*').eq('telefono', telefono).maybeSingle()
  if (error) throw error
  if (!data) throw new ErrorApi('lead_no_existe', 'El lead no existe. Llama primero a /registrar', 404)
  return data
}

export async function registrarEvento(leadId: string, contenido: string) {
  await supabase.from('lead_interacciones').insert({ lead_id: leadId, tipo: 'sistema', contenido })
}

/**
 * Todo el que escribe es un lead. Se guarda cada mensaje en su conversación.
 * bot_atiende=false: Genesys no debe responder (espera a su asesor o el asesor está conversando).
 */
/** Celulares de quienes reciben leads (o son asesores): reciben los avisos del CRM, no son leads. */
export async function telefonosAsesores(): Promise<Set<string>> {
  const { data } = await supabase.from('asesores').select('telefono')
    .or('rol.eq.asesor,activo.eq.true,ausencia_activa.eq.true').is('eliminado_at', null).not('telefono', 'is', null)
  return new Set((data ?? []).map((a) => a.telefono!))
}

/** "jueves 9 de octubre, 6:00 pm" (hora de Perú, sin puntos: BuilderBot corta los mensajes en cada punto) */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const dia = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  const hora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
    .replace(/\s*a\.?\s*m\.?/i, ' am').replace(/\s*p\.?\s*m\.?/i, ' pm')
  return `${dia}, ${hora}`
}

/** "Hoy es miércoles 7 de octubre de 2026, 3:06 pm (hora de Perú). La oficina está abierta…" */
export function fechaYHorario(): string {
  const ahora = new Date()
  const hoy = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ahora)
  const hora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hour12: true }).format(ahora)
    .replace(/\s*a\.?\s*m\.?/i, ' am').replace(/\s*p\.?\s*m\.?/i, ' pm')
  const apertura = proximaAtencion(ahora, FERIADOS)
  const oficina = apertura ? `La oficina está cerrada ahora; la próxima atención es ${textoProximaAtencion(apertura, ahora)}.` : 'La oficina está abierta ahora.'
  // Mañana: si no hay atención (feriado o fin de semana), se dice explícitamente
  const fechaLima = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d)
  const mananaFecha = new Date(ahora.getTime() + 86_400_000)
  const mananaTexto = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' }).format(mananaFecha)
  const feriadoManana = NOMBRES_FERIADOS.get(fechaLima(mananaFecha))
  const finDeSemana = [0, 6].includes(new Date(`${fechaLima(mananaFecha)}T12:00:00Z`).getUTCDay())
  const manana = feriadoManana || finDeSemana
    ? ` Mañana (${mananaTexto}) NO hay atención${feriadoManana ? ` por feriado: ${feriadoManana}` : ''}.`
    : ` Mañana (${mananaTexto}) sí hay atención en el horario normal.`
  // Feriados de los próximos 14 días
  const hoyFecha = fechaLima(ahora)
  const limite = fechaLima(new Date(ahora.getTime() + 14 * 86_400_000))
  const proximos = [...NOMBRES_FERIADOS].filter(([f]) => f > hoyFecha && f <= limite)
    .map(([f, n]) => `${new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${f}T12:00:00Z`))} (${n})`)
  const feriados = proximos.length ? ` Feriados próximos sin atención: ${proximos.join(', ')}.` : ''
  return `Hoy es ${hoy}, ${hora} (hora de Perú). ${oficina}${manana}${feriados}`
}

/**
 * Tarea diaria (8am, ver docs): solo en modo activo.
 * 1) Reintenta notificaciones pendientes o con error (máx. 3 intentos).
 * 2) Envía a cada asesor un resumen de sus leads asignados hace más de 12 h sin contactar.
 */
/** Feriados (public.feriados, "AAAA-MM-DD"): se recargan como máximo cada 10 min. */
export let FERIADOS: ReadonlySet<string> = new Set()

export let NOMBRES_FERIADOS: ReadonlyMap<string, string> = new Map()

export let feriadosCargados = 0

export async function cargarFeriados() {
  if (Date.now() - feriadosCargados < 10 * 60_000) return
  const { data } = await supabase.from('feriados').select('fecha, nombre')
  if (data) {
    FERIADOS = new Set(data.map((f) => f.fecha))
    NOMBRES_FERIADOS = new Map(data.map((f) => [f.fecha, f.nombre]))
    feriadosCargados = Date.now()
  }
}

export const SELECCION_CON_ASESOR = '*, asesor:asesores!leads_asesor_id_fkey(nombre, telefono)'
