// =====================================================================
//  Envío de WhatsApp con la API de BuilderBot Cloud (número de Genesys).
//  Lo usan "genesys" (avisos a asesores) y "chat" (mensajes del asesor al lead).
//  Secretos: BUILDERBOT_URL (endpoint /messages) y BUILDERBOT_API_KEY (bb-...).
// =====================================================================

/** Quita comillas y caracteres invisibles que suelen colarse al pegar claves. */
function limpiarCredencial(valor: string | undefined): string {
  return (valor ?? '').replace(/[​-‍﻿]/g, '').replace(/^["']+|["']+$/g, '').trim()
}

const BUILDERBOT_URL = limpiarCredencial(Deno.env.get('BUILDERBOT_URL'))
const BUILDERBOT_API_KEY = limpiarCredencial(Deno.env.get('BUILDERBOT_API_KEY'))

/** Problemas de configuración, sin exponer los secretos. */
export function problemasBuilderBot(): string[] {
  const problemas: string[] = []
  if (!BUILDERBOT_URL) problemas.push('Falta BUILDERBOT_URL.')
  else if (!BUILDERBOT_URL.includes('/messages')) problemas.push('BUILDERBOT_URL no parece ser el endpoint /messages.')
  if (!BUILDERBOT_API_KEY) problemas.push('Falta BUILDERBOT_API_KEY.')
  else if (!BUILDERBOT_API_KEY.startsWith('bb-')) problemas.push('BUILDERBOT_API_KEY no empieza con bb-.')
  return problemas
}

/**
 * Envía un WhatsApp (igual que enviarWhatsApp del Apps Script). La API a veces tarda: 45 s de espera.
 * mediaUrl: imagen o PDF público que se adjunta (BuilderBot lo descarga desde la URL).
 */
export async function enviarWhatsApp(numero: string, texto: string, mediaUrl?: string): Promise<{ ok: boolean; error?: string }> {
  if (!BUILDERBOT_URL || !BUILDERBOT_API_KEY) {
    return { ok: false, error: 'Faltan los secretos BUILDERBOT_URL o BUILDERBOT_API_KEY' }
  }
  try {
    const res = await fetch(BUILDERBOT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-builderbot': BUILDERBOT_API_KEY },
      body: JSON.stringify({ messages: { content: texto, ...(mediaUrl ? { mediaUrl } : {}) }, number: numero, checkIfExists: false }),
      signal: AbortSignal.timeout(45_000),
    })
    if (res.ok) return { ok: true }
    return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Agrega o quita un número de la blacklist de BuilderBot (el bot no responde a los números de la lista).
 * Endpoint: <base del bot>/blacklist  { number, intent: 'add' | 'remove' }
 */
export async function cambiarBlacklist(numero: string, agregar: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!BUILDERBOT_URL || !BUILDERBOT_API_KEY) {
    return { ok: false, error: 'Faltan los secretos BUILDERBOT_URL o BUILDERBOT_API_KEY' }
  }
  const base = BUILDERBOT_URL.replace(/\/messages\/?$/, '')
  try {
    const res = await fetch(`${base}/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-builderbot': BUILDERBOT_API_KEY },
      body: JSON.stringify({ number: numero, intent: agregar ? 'add' : 'remove' }),
      signal: AbortSignal.timeout(20_000),
    })
    if (res.ok) return { ok: true }
    return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Descarga un archivo que un contacto envió por WhatsApp (urlTempFile del webhook).
 * BuilderBot lo guarda solo unos días. Devuelve null si no existe o pasa del límite.
 */
export async function descargarArchivo(url: string, maximoBytes: number): Promise<{ datos: Uint8Array; tipo: string } | null> {
  try {
    const res = await fetch(url, {
      headers: BUILDERBOT_API_KEY ? { 'x-api-builderbot': BUILDERBOT_API_KEY } : {},
      signal: AbortSignal.timeout(30_000),
    })
    const tipo = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    // Si el archivo ya no existe, la API responde un JSON {"message":"File not found"}
    if (!res.ok || tipo === 'application/json') return null
    const datos = new Uint8Array(await res.arrayBuffer())
    if (!datos.length || datos.length > maximoBytes) return null
    return { datos, tipo }
  } catch {
    return null
  }
}
