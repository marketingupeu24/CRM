// Generar el archivo de la proforma (imagen/PDF) y enviarla por el chat del CRM.
// Lo usan la página Proformas y el botón 💰 del chat del lead (solo en el navegador).
import { crearClienteNavegador } from '@/lib/supabase/client'
import { marcarEnviada, registrarProforma, type DatosProforma } from '@/app/(panel)/costos/acciones'

export type TipoAdjunto = 'imagen' | 'pdf' | 'texto'

/** Ancho de la proforma que se sube y envía: el mismo al que WhatsApp deja las imágenes (se ve igual y pesa menos de la mitad). */
const ANCHO_ENVIO = 1600
const CALIDAD_ENVIO = 0.85

/**
 * Captura la hoja (HojaProforma) como imagen o PDF A4.
 * - png: descarga en alta calidad (no se guarda en el sistema).
 * - jpg: la que se sube y se envía por WhatsApp (1600 px, JPEG 85 %: ~300 KB en vez de ~750 KB).
 * - pdf: A4 con la imagen en JPEG; con envio=true se arma a 1600 px para que pese menos al guardarse.
 */
export async function generarArchivoProforma(nodo: HTMLElement, tipo: 'png' | 'jpg' | 'pdf', envio = false): Promise<Blob> {
  const { toCanvas } = await import('html-to-image')
  await document.fonts?.ready
  const reducir = tipo === 'jpg' || envio
  const pixelRatio = reducir ? Math.min(2.5, ANCHO_ENVIO / Math.max(1, nodo.offsetWidth)) : 2.5
  const lienzo = await toCanvas(nodo, { pixelRatio, backgroundColor: '#ffffff', style: { transform: 'none', boxShadow: 'none' }, cacheBust: true })
  if (tipo === 'png') return await new Promise<Blob>((r) => lienzo.toBlob((b) => r(b!), 'image/png'))
  if (tipo === 'jpg') return await new Promise<Blob>((r) => lienzo.toBlob((b) => r(b!), 'image/jpeg', CALIDAD_ENVIO))
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const W = 210, H = 297
  let w = W, h = lienzo.height * W / lienzo.width
  if (h > H) { w = W * H / h; h = H }
  pdf.addImage(lienzo.toDataURL('image/jpeg', reducir ? CALIDAD_ENVIO : 0.93), 'JPEG', (W - w) / 2, 0, w, h)
  return pdf.output('blob')
}

/**
 * Guarda la proforma, sube el archivo al bucket "proformas" y la envía por WhatsApp
 * (función "chat") con el mensaje de costos. Devuelve el número o el error.
 */
export async function enviarProformaPorChat(
  { leadId, datos, nodo, adjunto, alEstado }:
  { leadId: string; datos: DatosProforma; nodo: HTMLElement | null; adjunto: TipoAdjunto; alEstado: (texto: string) => void },
): Promise<{ ok: true; numero: string } | { ok: false; error: string }> {
  alEstado('Preparando la proforma…')
  const registro = await registrarProforma(datos)
  if (registro.error || !registro.id) return { ok: false, error: registro.error ?? 'No se pudo guardar la proforma.' }
  const supabase = crearClienteNavegador()
  let url: string | null = null
  if (adjunto !== 'texto' && nodo) {
    try {
      alEstado('Subiendo el archivo…')
      const tipo = adjunto === 'pdf' ? 'pdf' : 'jpg'
      const blob = await generarArchivoProforma(nodo, tipo, true)
      const ruta = `${leadId}/${crypto.randomUUID()}.${tipo}`
      const { error } = await supabase.storage.from('proformas').upload(ruta, blob, { contentType: tipo === 'pdf' ? 'application/pdf' : 'image/jpeg' })
      if (error) throw error
      url = supabase.storage.from('proformas').getPublicUrl(ruta).data.publicUrl
    } catch {
      return { ok: false, error: 'No se pudo subir el archivo. Puedes enviar solo el texto.' }
    }
  }
  alEstado('Enviando por WhatsApp…')
  const { data, error } = await supabase.functions.invoke('chat', { body: { lead_id: leadId, texto: registro.texto, adjunto_url: url } })
  if (error || !data?.ok) {
    let detalle = data?.error as string | undefined
    if (!detalle && error && 'context' in error) {
      try { detalle = (await (error.context as Response).json()).error } catch { /* sin detalle */ }
    }
    return { ok: false, error: detalle ?? 'No se pudo enviar. Intenta de nuevo.' }
  }
  await marcarEnviada(registro.id, url, leadId)
  return { ok: true, numero: registro.numero! }
}
