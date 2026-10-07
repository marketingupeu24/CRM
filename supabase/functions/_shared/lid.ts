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

/** Dirección para enviar por la API: "<id>@lid" si es un contacto con número oculto. */
export async function destinoWhatsApp(supabase: SupabaseClient, numero: string): Promise<string> {
  return (await esContactoLid(supabase, numero)) ? `${numero.replace(/@.*$/, '')}@lid` : numero
}
