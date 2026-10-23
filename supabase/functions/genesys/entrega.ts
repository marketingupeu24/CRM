// Genesys · Doble check de WhatsApp (API oficial de Meta).
// Cada mensaje enviado tiene un id ("wamid…"). Meta avisa después si se entregó, se leyó o falló.
// Aquí se guarda el id de cada mensaje (desde el eco del webhook) y se aplican esos avisos de estado.
import { supabase } from './comun.ts'
import type { EstadoEntrega } from '../_shared/entrega.ts'

export { estadosDeEntrega, wamidDe } from '../_shared/entrega.ts'

export async function registrarEstados(estados: EstadoEntrega[]): Promise<number> {
  let actualizados = 0
  for (const e of estados) {
    const { data } = await supabase.rpc('registrar_estado_whatsapp', { p_wamid: e.wamid, p_estado: e.estado, p_momento: e.momento, p_error: e.error ?? undefined })
    actualizados += Number(data ?? 0)
  }
  return actualizados
}

/**
 * Une el id de WhatsApp al mensaje que ya está guardado en el chat (el más reciente del mismo contacto, de los
 * últimos 5 minutos, con el mismo texto y todavía sin id). Sirve para los mensajes que envía el CRM.
 */
export async function vincularWamid(contacto: string, texto: string, wamid: string): Promise<boolean> {
  const { data: leadId } = await supabase.rpc('lead_de_contacto', { p_contacto: contacto })
  if (!leadId) return false
  const { data: candidatos } = await supabase.from('lead_interacciones').select('id, contenido')
    .eq('lead_id', leadId as string).in('tipo', ['mensaje_asesor', 'respuesta_bot']).is('wamid', null)
    .gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
    .order('created_at', { ascending: false }).limit(10)
  const limpio = texto.trim()
  const elegido = (candidatos ?? []).find((c) => {
    const guardado = (c.contenido ?? '').trim()
    return !!guardado && (guardado === limpio || limpio.endsWith(guardado) || guardado.endsWith(limpio))
  })
  if (!elegido) return false
  await supabase.from('lead_interacciones').update({ wamid }).eq('id', elegido.id)
  return true
}
