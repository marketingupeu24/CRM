// =====================================================================
//  Contactos de WhatsApp con número oculto (@lid).
//  BuilderBot los recibe como "<id>@lid" pero les responde a "<id>@s.whatsapp.net"
//  (no existe: el mensaje se pierde). Por la API sí se entregan si el número va
//  como "<id>@lid". Aquí se detecta si un número es de ese tipo (por los mensajes
//  que ya llegaron al webhook) para enviarle con la dirección correcta.
// =====================================================================
import type { SupabaseClient } from '@supabase/supabase-js'

const cache = new Map<string, { lid: boolean; hasta: number }>()

/** true si el contacto escribe con número oculto (llegó algún mensaje desde "<numero>@lid"). */
export async function esContactoLid(supabase: SupabaseClient, numero: string): Promise<boolean> {
  const limpio = numero.replace(/@.*$/, '')
  if (!/^\d{8,20}$/.test(limpio)) return false
  const guardado = cache.get(limpio)
  if (guardado && guardado.hasta > Date.now()) return guardado.lid
  const { data } = await supabase.from('webhook_eventos').select('id')
    .eq('payload->cuerpo->data->key->>remoteJid', `${limpio}@lid`).limit(1)
  const lid = !!data?.length
  cache.set(limpio, { lid, hasta: Date.now() + 10 * 60_000 })
  return lid
}

let proveedor: { valor: string | null; hasta: number } | null = null

/** "meta" si el bot usa la API oficial (ajustes.whatsapp_estado, lo guarda el webhook). */
async function proveedorWhatsApp(supabase: SupabaseClient): Promise<string | null> {
  if (proveedor && proveedor.hasta > Date.now()) return proveedor.valor
  const { data } = await supabase.from('ajustes').select('valor').eq('clave', 'whatsapp_estado').maybeSingle()
  let valor: string | null = null
  try { valor = data?.valor ? (JSON.parse(data.valor).proveedor ?? null) : null } catch { /* sin estado */ }
  proveedor = { valor, hasta: Date.now() + 5 * 60_000 }
  return valor
}

/**
 * Dirección para enviar por la API: "<id>@lid" si es un contacto con número oculto (conexión por QR).
 * Con la API oficial de Meta no existe "@lid": el número (o el ID de usuario "PE.123…") va tal cual.
 */
export async function destinoWhatsApp(supabase: SupabaseClient, numero: string): Promise<string> {
  if ((await proveedorWhatsApp(supabase)) === 'meta') return numero.replace(/@.*$/, '')
  return (await esContactoLid(supabase, numero)) ? `${numero.replace(/@.*$/, '')}@lid` : numero
}
