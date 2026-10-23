// Doble check de WhatsApp: lectura de los ids (wamid) y de los avisos de estado de Meta (sin base de datos).

type Datos = Record<string, unknown>

/** Id de WhatsApp del mensaje enviado, en el eco "message.outgoing" (respMessage.messages[0].id). */
export function wamidDe(datos: Datos): string | null {
  const id = (datos.respMessage as { messages?: { id?: unknown }[] } | undefined)?.messages?.[0]?.id
  return typeof id === 'string' && id.startsWith('wamid.') ? id : null
}

export interface EstadoEntrega { wamid: string; estado: 'sent' | 'delivered' | 'read' | 'failed'; momento: string; error: string | null }

const ESTADOS = new Set(['sent', 'delivered', 'read', 'failed'])

/**
 * Avisos de estado dentro del webhook, en el formato de Meta ({ id: "wamid…", status, timestamp, errors })
 * donde sea que BuilderBot los ponga (data, statuses, entry[].changes[].value.statuses…).
 */
export function estadosDeEntrega(cuerpo: unknown): EstadoEntrega[] {
  const encontrados: EstadoEntrega[] = []
  const visitar = (valor: unknown, profundidad: number) => {
    if (!valor || typeof valor !== 'object' || profundidad > 8) return
    if (Array.isArray(valor)) { for (const v of valor) visitar(v, profundidad + 1); return }
    const o = valor as Record<string, unknown>
    const id = o.id ?? o.message_id ?? o.messageId
    const estado = String(o.status ?? '').toLowerCase()
    if (typeof id === 'string' && id.startsWith('wamid.') && ESTADOS.has(estado)) {
      const segundos = Number(o.timestamp)
      const errores = o.errors as { title?: string; message?: string; code?: number }[] | undefined
      encontrados.push({
        wamid: id,
        estado: estado as EstadoEntrega['estado'],
        momento: Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : new Date().toISOString(),
        error: errores?.length ? [errores[0]!.code, errores[0]!.title ?? errores[0]!.message].filter(Boolean).join(' · ') : null,
      })
      return
    }
    for (const v of Object.values(o)) visitar(v, profundidad + 1)
  }
  visitar(cuerpo, 0)
  return encontrados
}
