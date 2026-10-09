// Compresión de imágenes antes de subirlas (solo en el navegador).
// WhatsApp deja las imágenes en ~1600 px: subirlas más grandes solo ocupa espacio sin verse mejor.

const ANCHO_MAXIMO = 1600
const CALIDAD = 0.85
/** Por debajo de este tamaño (y del ancho máximo) la imagen se sube tal cual */
const BYTES_SIN_COMPRIMIR = 400 * 1024

/**
 * Devuelve la imagen reducida a 1600 px y en JPEG 85 % si así pesa menos.
 * PDF, GIF y cualquier archivo que no sea imagen se devuelven igual; si algo falla, también.
 */
export async function comprimirImagen(archivo: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return archivo
  try {
    const bitmap = await createImageBitmap(archivo)
    const escala = Math.min(1, ANCHO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    if (escala === 1 && archivo.size <= BYTES_SIN_COMPRIMIR) { bitmap.close(); return archivo }
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(bitmap.width * escala)
    lienzo.height = Math.round(bitmap.height * escala)
    const g = lienzo.getContext('2d')
    if (!g) { bitmap.close(); return archivo }
    // Fondo blanco: JPEG no tiene transparencia (una captura PNG con fondo transparente se vería negra)
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, lienzo.width, lienzo.height)
    g.imageSmoothingQuality = 'high'
    g.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', CALIDAD))
    if (!blob || blob.size >= archivo.size) return archivo
    return new File([blob], archivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return archivo
  }
}
