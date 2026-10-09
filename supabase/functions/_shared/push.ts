// =====================================================================
//  Notificaciones push a la app del CRM (celular o PC donde el asesor activó los avisos).
//  Secretos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACTO.
//  Se envían además del WhatsApp: si falla o no hay suscripción, no pasa nada.
// =====================================================================
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

const PUBLICA = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const PRIVADA = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
let configurado = false

export interface AvisoPush {
  titulo: string
  cuerpo: string
  /** Página del CRM que se abre al tocar la notificación (ej. /leads/<id>#chat) */
  url: string
  /** Avisos con la misma etiqueta se reemplazan en vez de acumularse (ej. el id del lead) */
  etiqueta?: string
}

/** Envía el aviso a todos los dispositivos del asesor. Borra las suscripciones vencidas. */
export async function enviarPush(supabase: SupabaseClient, asesorId: string | null | undefined, aviso: AvisoPush): Promise<number> {
  if (!asesorId || !PUBLICA || !PRIVADA) return 0
  if (!configurado) {
    webpush.setVapidDetails(Deno.env.get('VAPID_CONTACTO') ?? 'https://crm-admision.vercel.app', PUBLICA, PRIVADA)
    configurado = true
  }
  const { data: subs } = await supabase.from('push_suscripciones').select('id, endpoint, p256dh, auth').eq('asesor_id', asesorId)
  let enviados = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...aviso, cuerpo: aviso.cuerpo.slice(0, 300) }),
        { TTL: 60 * 60 * 6, urgency: 'high' },
      )
      enviados++
      await supabase.from('push_suscripciones').update({ ultimo_envio_at: new Date().toISOString() }).eq('id', s.id)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      // 404/410: el navegador anuló la suscripción (desinstaló la app o quitó el permiso)
      if (status === 404 || status === 410) await supabase.from('push_suscripciones').delete().eq('id', s.id)
      else console.error('[push] No se pudo enviar:', status ?? e)
    }
  }
  return enviados
}
