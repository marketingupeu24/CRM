// Preferencias de la bandeja de chats (se recuerdan en una cookie para que el servidor cargue directo la vista elegida).
// de: 'todos' (todo el equipo), 'mios' o el id de un asesor · filtro: 'todos' o 'sin_responder'.
export const COOKIE_BANDEJA = 'crm-bandeja'

export interface PreferenciaBandeja {
  de: string
  filtro: 'todos' | 'sin_responder'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function leerPreferencia(valor: string | undefined): PreferenciaBandeja {
  const [de = 'todos', filtro = 'todos'] = decodeURIComponent(valor ?? '').split('|')
  return {
    de: de === 'mios' || UUID.test(de) ? de : 'todos',
    filtro: filtro === 'sin_responder' ? 'sin_responder' : 'todos',
  }
}

export function guardarPreferencia(p: PreferenciaBandeja) {
  document.cookie = `${COOKIE_BANDEJA}=${encodeURIComponent(`${p.de}|${p.filtro}`)}; path=/; max-age=31536000; samesite=lax`
}

/** Id del asesor por el que filtrar (o null = todos), según quién puede ver todo el equipo. */
export function asesorDeLaVista(p: PreferenciaBandeja, miId: string, veTodos: boolean): string | null {
  if (!veTodos) return null // el RLS ya le muestra solo lo suyo
  if (p.de === 'mios') return miId
  return UUID.test(p.de) ? p.de : null
}

/** Panel "📋 Detalles" de la ficha: se recuerda si lo dejaste abierto o cerrado al pasar a otra conversación. */
export const COOKIE_DETALLES = 'crm-detalles'
