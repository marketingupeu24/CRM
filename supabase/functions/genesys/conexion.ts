// Genesys · Estado de la conexión de WhatsApp (BuilderBot avisa por el webhook: status.ready / status.disconnect).
// Se guarda en ajustes.whatsapp_estado para que el panel muestre un aviso, y sirve para no castigar a nadie
// por una caída: los avisos fallidos no gastan intentos y no se reasigna mientras está caído (ni justo después).
import { enviarPush } from '../_shared/push.ts'
import { supabase } from './comun.ts'

export interface EstadoWhatsApp {
  estado: 'conectado' | 'desconectado'
  /** Desde cuándo está en ese estado */
  desde: string
  /** API oficial de Meta o conexión por QR */
  proveedor?: 'meta' | 'qr'
}

const CLAVE = 'whatsapp_estado'

export async function estadoWhatsApp(): Promise<EstadoWhatsApp | null> {
  const { data } = await supabase.from('ajustes').select('valor').eq('clave', CLAVE).maybeSingle()
  try { return data?.valor ? JSON.parse(data.valor) as EstadoWhatsApp : null } catch { return null }
}

async function guardar(estado: EstadoWhatsApp) {
  await supabase.from('ajustes').upsert({ clave: CLAVE, valor: JSON.stringify(estado), updated_at: new Date().toISOString() })
}

/** Error de envío que viene de una caída de WhatsApp o de BuilderBot (no de un número equivocado). */
export function esCaidaWhatsApp(error: string | null | undefined): boolean {
  return /deploy not found|HTTP 5\d\d|fetch failed|timed? ?out|network|ECONN|socket|abort/i.test(error ?? '')
}

async function avisarSuperadmins(titulo: string, cuerpo: string) {
  const { data } = await supabase.from('asesores').select('id').eq('superadmin', true).is('eliminado_at', null)
  for (const a of data ?? []) await enviarPush(supabase, a.id, { titulo, cuerpo, url: '/dashboard', etiqueta: 'whatsapp-estado' })
}

/**
 * Evento del webhook: actualiza el estado. Devuelve true si era un evento de estado (status.*).
 * Un mensaje que entra también prueba que está conectado (por si se perdió el status.ready).
 */
export async function registrarConexion(tipo: string, cuerpo: Record<string, unknown>): Promise<boolean> {
  const datos = (cuerpo.data ?? {}) as { raw?: { id?: unknown } }
  const esStatus = tipo.startsWith('status.')
  const entrante = tipo === 'message.incoming'
  if (!esStatus && !entrante) return false
  const actual = await estadoWhatsApp()
  const ahora = new Date().toISOString()
  // Mensajes con id "wamid…" = API oficial de Meta
  const proveedor = entrante ? (String(datos.raw?.id ?? '').startsWith('wamid') ? 'meta' : 'qr') : actual?.proveedor
  if (esStatus) {
    const caido = /disconnect|require_action|close|logout|error/.test(tipo)
    const nuevo: EstadoWhatsApp = { estado: caido ? 'desconectado' : 'conectado', desde: ahora, proveedor }
    if (actual?.estado !== nuevo.estado) {
      await guardar(nuevo)
      if (caido) {
        await supabase.rpc('registrar_error', { p_clave: 'whatsapp/desconectado', p_detalle: `WhatsApp de Genesys desconectado (${tipo})` })
        await avisarSuperadmins('⚠️ WhatsApp de Genesys desconectado', 'No entran ni salen mensajes. Revisa la conexión en BuilderBot.')
      } else if (actual) {
        await avisarSuperadmins('✅ WhatsApp de Genesys reconectado', 'Los mensajes vuelven a entrar y salir.')
      }
    }
    return true
  }
  // Mensaje entrante: está conectado; se anota el proveedor si cambió
  if (actual?.estado !== 'conectado' || actual?.proveedor !== proveedor) {
    await guardar({ estado: 'conectado', desde: actual?.estado === 'conectado' ? actual.desde : ahora, proveedor })
    if (actual?.estado === 'desconectado') await avisarSuperadmins('✅ WhatsApp de Genesys reconectado', 'Los mensajes vuelven a entrar y salir.')
  }
  return false
}

/**
 * ¿Se puede reasignar por "no contactado a tiempo"? No mientras WhatsApp está caído, ni hasta que pasen
 * `horas` desde que se reconectó (a los asesores no les llegaban los avisos ni podían escribir).
 */
export async function puedeReasignar(horas: number): Promise<{ ok: boolean; motivo?: string }> {
  const e = await estadoWhatsApp()
  if (!e) return { ok: true }
  if (e.estado === 'desconectado') return { ok: false, motivo: 'WhatsApp desconectado' }
  const desde = Date.parse(e.desde)
  if (Number.isFinite(desde) && Date.now() - desde < horas * 3_600_000) return { ok: false, motivo: `WhatsApp se reconectó hace menos de ${horas} h` }
  return { ok: true }
}
