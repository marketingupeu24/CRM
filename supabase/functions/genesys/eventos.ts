// Genesys · Webhook de eventos de BuilderBot: mensajes entrantes y salientes, archivos y reenvío a contactos @lid.
import { normalizarTelefono, valorResuelto } from '../_shared/dominio.ts'
import { descargarArchivo, enviarWhatsApp } from '../_shared/builderbot.ts'
import { esContactoLid } from '../_shared/lid.ts'
import { type Cuerpo, type Respuesta, supabase, PANEL_URL } from './comun.ts'
import { registrar } from './registro.ts'

// Runtime de Supabase Edge Functions: mantiene viva una tarea después de responder
declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void }

/** Busca el primer valor de texto bajo alguna de estas claves (en cualquier nivel del JSON). */
export function buscarCampo(obj: unknown, claves: string[], profundidad = 0): string | null {
  if (!obj || typeof obj !== 'object' || profundidad > 4) return null
  for (const clave of claves) {
    const valor = (obj as Record<string, unknown>)[clave]
    if (typeof valor === 'string' && valor.trim()) return valor.trim()
    if (typeof valor === 'number') return String(valor)
  }
  for (const valor of Object.values(obj as Record<string, unknown>)) {
    const encontrado = buscarCampo(valor, claves, profundidad + 1)
    if (encontrado) return encontrado
  }
  return null
}

/**
 * Webhook de BuilderBot: llega cada mensaje (también los de números en blacklist).
 * Se guarda una copia cruda en webhook_eventos y, si es un mensaje del lead, se registra
 * en su conversación (mismo efecto que /registrar: chat, "sin responder" y aviso al asesor).
 */
/**
 * Avisos que el CRM envía a los asesores (lead nuevo, reasignado, recordatorio, mensaje nuevo).
 * También llegan por el webhook como salientes: no son respuestas del bot y no van al chat del lead
 * (pasa cuando el número de un asesor también está registrado como lead).
 */
export function esAvisoParaAsesor(texto: string): boolean {
  return texto.includes(PANEL_URL) || texto.includes('*Celular:*') || texto.startsWith('*RECORDATORIO')
}

/** Archivo que el lead envió por WhatsApp (BuilderBot pone "_event_document__<id>" en el texto). */
export interface ArchivoEntrante {
  texto: string
  url: string | null
  nombre: string
  tipo: string
}

export const EXTENSIONES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/mp4': 'mp4',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

/** Traduce el código de BuilderBot a un texto legible para el chat (y para la vista previa y los avisos). */
export function archivoEntrante(cuerpo: Cuerpo, texto: string | null): ArchivoEntrante | null {
  const evento = texto?.match(/^_event_([a-z_]+?)__/)?.[1]
  if (!evento) return null
  const data = ((cuerpo as { data?: Record<string, unknown> }).data ?? cuerpo) as Record<string, unknown>
  const msg = (data.message ?? {}) as Record<string, Record<string, unknown> | undefined>
  const url = typeof data.urlTempFile === 'string' ? data.urlTempFile : null
  const cadena = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const doc = msg.documentMessage ?? msg.documentWithCaptionMessage
  const imagen = msg.imageMessage
  const video = msg.videoMessage
  const audio = msg.audioMessage
  const ubicacion = msg.locationMessage ?? msg.liveLocationMessage

  if (evento === 'location' || ubicacion) {
    const lat = Number(ubicacion?.degreesLatitude), lng = Number(ubicacion?.degreesLongitude)
    const mapa = Number.isFinite(lat) && Number.isFinite(lng) ? `\nhttps://maps.google.com/?q=${lat},${lng}` : ''
    return { texto: `📍 Ubicación${mapa}`, url: null, nombre: '', tipo: '' }
  }
  const conLeyenda = (titulo: string, leyenda: string) => (leyenda ? `${titulo}\n${leyenda}` : titulo)
  if (evento === 'voice_note' || audio) {
    return { texto: '🎤 Nota de voz', url, nombre: 'nota-de-voz', tipo: cadena(audio?.mimetype) || 'audio/ogg' }
  }
  if (doc) {
    const nombre = cadena(doc.fileName) || cadena(doc.title) || 'documento'
    return { texto: conLeyenda(`📎 Documento: ${nombre}`, cadena(doc.caption)), url, nombre, tipo: cadena(doc.mimetype) }
  }
  if (video) {
    return { texto: conLeyenda('🎬 Video', cadena(video.caption)), url, nombre: 'video', tipo: cadena(video.mimetype) || 'video/mp4' }
  }
  if (evento === 'media' || imagen) {
    return { texto: conLeyenda('🖼️ Imagen', cadena(imagen?.caption)), url, nombre: 'imagen', tipo: cadena(imagen?.mimetype) || 'image/jpeg' }
  }
  return { texto: '📎 Archivo', url, nombre: 'archivo', tipo: '' }
}

/** Copia el archivo al bucket privado "adjuntos" (BuilderBot lo borra en unos días) y lo une al mensaje. */
export async function guardarArchivo(leadId: string, archivo: ArchivoEntrante): Promise<void> {
  if (!archivo.url) return
  const descarga = await descargarArchivo(archivo.url, 16 * 1024 * 1024)
  if (!descarga) {
    console.warn('[genesys] No se pudo descargar el archivo del lead', leadId)
    return
  }
  const tipo = archivo.tipo || descarga.tipo || 'application/octet-stream'
  const base = archivo.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'archivo'
  const extension = archivo.nombre.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase()
    ?? EXTENSIONES[tipo.split(';')[0]] ?? archivo.url.match(/\.([a-z0-9]{1,5})(\?|$)/i)?.[1]?.toLowerCase() ?? 'bin'
  const ruta = `${leadId}/${Date.now()}-${base}.${extension}`
  const subida = await supabase.storage.from('adjuntos').upload(ruta, descarga.datos, { contentType: tipo.split(';')[0], upsert: false })
  if (subida.error) {
    console.error('[genesys] No se pudo guardar el archivo:', subida.error.message)
    return
  }
  // El mensaje que acaba de guardar registrar_lead (último de este lead con ese texto)
  const { data: mensaje } = await supabase.from('lead_interacciones').select('id')
    .eq('lead_id', leadId).eq('tipo', 'mensaje_lead').eq('contenido', archivo.texto).is('adjunto_url', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (mensaje) await supabase.from('lead_interacciones').update({ adjunto_url: `adjuntos/${ruta}` }).eq('id', mensaje.id)
}

/**
 * Reenvía a "<id>@lid" una respuesta de Genesys que BuilderBot mandó a una dirección que no existe.
 * Las respuestas en varias partes llegan casi juntas: se espera según su orden para no desordenarlas.
 */
export async function reenviarALid(numero: string, texto: string, media: string | undefined, registroId: number | null) {
  const desde = new Date(Date.now() - 20_000).toISOString()
  const { count } = await supabase.from('webhook_eventos').select('id', { count: 'exact', head: true })
    .eq('payload->cuerpo->>eventName', 'message.outgoing').eq('payload->cuerpo->data->>from', numero)
    .gte('recibido_at', desde).lt('id', registroId ?? Number.MAX_SAFE_INTEGER)
  await new Promise((r) => setTimeout(r, Math.min(count ?? 0, 8) * 2_500))
  const inicio = Date.now()
  const envio = await enviarWhatsApp(`${numero}@lid`, texto, media)
  if (!envio.ok) console.error('[genesys] No se pudo reenviar a @lid:', envio.error)
  // Diagnóstico: queda anotado en el evento original
  if (registroId) {
    await supabase.from('webhook_eventos')
      .update({ procesado: `respuesta del bot guardada · reenviada a @lid (${envio.ok ? 'ok' : 'error'}, ${Math.round((Date.now() - inicio) / 1000)} s)` })
      .eq('id', registroId)
  }
}

/** Primer objeto "contextInfo" del mensaje (WhatsApp guarda ahí el origen del chat y el anuncio). */
function buscarContexto(obj: unknown, profundidad = 0): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object' || profundidad > 8) return null
  const o = obj as Record<string, unknown>
  const ci = o.contextInfo
  if (ci && typeof ci === 'object' && ('entryPointConversionSource' in ci || 'externalAdReply' in ci)) return ci as Record<string, unknown>
  for (const v of Object.values(o)) {
    const r = buscarContexto(v, profundidad + 1)
    if (r) return r
  }
  return null
}

/** Origen del chat (enlace, Facebook, búsqueda…) y anuncio de Facebook/Instagram, si los trae el mensaje. */
function origenDelMensaje(cuerpo: Cuerpo): { fuente: string | null; app: string | null; anuncio: Record<string, string> | null } | null {
  const ci = buscarContexto(cuerpo)
  if (!ci) return null
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null)
  const ad = ci.externalAdReply as Record<string, unknown> | undefined
  const anuncio = ad && typeof ad === 'object'
    ? Object.fromEntries(Object.entries({
        titulo: texto(ad.title), texto: texto(ad.body), url: texto(ad.sourceUrl), id: texto(ad.sourceId),
        tipo: texto(ad.sourceType), app: texto(ad.sourceApp), ctwa_clid: texto(ad.ctwaClid),
      }).filter(([, v]) => v !== null)) as Record<string, string>
    : null
  return {
    fuente: texto(ci.entryPointConversionSource),
    app: texto(ci.entryPointConversionApp),
    anuncio: anuncio && Object.keys(anuncio).length ? anuncio : null,
  }
}

export async function evento(cuerpo: Cuerpo, registroId: number | null): Promise<Respuesta> {
  const marcar = (procesado: string) =>
    registroId ? supabase.from('webhook_eventos').update({ procesado }).eq('id', registroId) : Promise.resolve()

  const tipo = (buscarCampo(cuerpo, ['eventName', 'event', 'type', 'evento']) ?? '').toLowerCase()
  const saliente = /out|send|sent|bot/.test(tipo) || (cuerpo as { fromMe?: unknown }).fromMe === true
  const telefono = normalizarTelefono(buscarCampo(cuerpo, ['from', 'phone', 'number', 'remoteJid', 'telefono', 'to']))
  const texto = valorResuelto(buscarCampo(cuerpo, ['body', 'message', 'text', 'content', 'mensaje', 'answer']))
  // Contacto con privacidad de WhatsApp: llega un identificador (@lid) en vez del número
  const jid = buscarCampo(cuerpo, ['remoteJid']) ?? ''
  const esLid = jid.endsWith('@lid') && !!telefono && jid.replace(/\D/g, '') === telefono

  if (!telefono) { await marcar('sin teléfono'); return { ok: true, procesado: 'sin teléfono' } }
  if (saliente) {
    const datos = ((cuerpo as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>
    const destinoJid = String(((datos.respMessage as { key?: { remoteJid?: string } } | undefined)?.key?.remoteJid) ?? '')
    // Eco de un envío del CRM a "<id>@lid": ya está guardado en el chat
    if (destinoJid.endsWith('@lid')) {
      await marcar('saliente @lid (envío del CRM)')
      return { ok: true, procesado: 'saliente @lid' }
    }
    // BuilderBot respondió a un contacto con número oculto en "<id>@s.whatsapp.net": no le llega.
    // El CRM reenvía la respuesta a "<id>@lid", que sí se entrega.
    const lid = texto && destinoJid.endsWith('@s.whatsapp.net') && !esAvisoParaAsesor(texto) ? await esContactoLid(supabase, telefono) : false
    console.log('[genesys] saliente', telefono, destinoJid, 'lid:', lid)
    if (lid && texto) {
      const media = ((datos.options as { media?: unknown } | undefined)?.media)
      EdgeRuntime.waitUntil(reenviarALid(telefono, texto, typeof media === 'string' ? media : undefined, registroId))
    }
    // Respuesta del bot: se guarda en la conversación (los mensajes del CRM ya están guardados)
    if (texto && !/^\*[^*\n]{1,40}:\* /.test(texto) && !esAvisoParaAsesor(texto)) {
      // Por celular o por alias (LID unido a un lead registrado)
      const { data: leadId } = await supabase.rpc('lead_de_contacto', { p_contacto: telefono })
      if (leadId) {
        await supabase.from('lead_interacciones').insert({ lead_id: leadId, tipo: 'respuesta_bot', contenido: texto.slice(0, 4000) })
        await marcar('respuesta del bot guardada')
        return { ok: true, procesado: 'respuesta_bot' }
      }
    }
    await marcar('saliente ignorado')
    return { ok: true, procesado: 'saliente ignorado' }
  }
  // Documento, nota de voz, imagen o ubicación: texto legible y copia del archivo
  const archivo = archivoEntrante(cuerpo, texto)
  const r = await registrar({ telefono, mensaje: archivo?.texto ?? texto ?? undefined, es_lid: esLid })
  if (archivo?.url && typeof r.lead_id === 'string') EdgeRuntime.waitUntil(guardarArchivo(r.lead_id, archivo))
  // Respondió "NO" a un recordatorio automático: no recibe más
  if (texto && typeof r.lead_id === 'string' && texto.length < 30) {
    EdgeRuntime.waitUntil(Promise.resolve(supabase.rpc('baja_recordatorios', { p_lead_id: r.lead_id, p_texto: texto })).then(() => undefined))
  }
  // De dónde llegó (enlace, Facebook, anuncio): se guarda solo la primera vez
  const origen = origenDelMensaje(cuerpo)
  if (origen && typeof r.lead_id === 'string' && (origen.fuente || origen.anuncio)) {
    EdgeRuntime.waitUntil(Promise.resolve(supabase.rpc('guardar_origen_contacto', {
      // null = sin dato (la base lo acepta aunque el tipo generado no lo diga)
      p_lead_id: r.lead_id,
      p_fuente: origen.fuente as string, p_app: origen.app as string, p_anuncio: origen.anuncio as unknown as string,
    })).then(({ error }) => { if (error) console.error('[genesys] No se pudo guardar el origen:', error.message) }))
  }
  await marcar(archivo ? `archivo del lead guardado (${archivo.texto.split('\n')[0]})` : texto ? 'mensaje del lead guardado' : 'contacto registrado (sin texto)')
  return { ok: true, procesado: 'mensaje_lead', bot_atiende: r.bot_atiende }
}
