// Arma el texto que se pega en el asistente de BuilderBot (prompt + base de conocimiento)
// a partir de las secciones activas de la base de conocimiento del CRM.
import { CATEGORIAS_CONOCIMIENTO, type CategoriaConocimiento } from '@crm/db'

export interface EntradaConocimiento {
  categoria: string
  titulo: string
  contenido: string
  activo: boolean
  orden: number
}

export function textoParaGenesys(entradas: EntradaConocimiento[], fecha: Date = new Date()): string {
  const hoy = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(fecha)
  const activas = entradas.filter((e) => e.activo)
  const partes = [
    '# Genesys – Asesora virtual de Admisión UPeU, campus Juliaca',
    `(Actualizado el ${hoy} desde el CRM de Admisión. Usa solo esta información; si un dato no está aquí, no lo inventes.)`,
  ]
  for (const [clave, nombre] of Object.entries(CATEGORIAS_CONOCIMIENTO) as [CategoriaConocimiento, string][]) {
    const deLaCategoria = activas.filter((e) => e.categoria === clave).sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo))
    if (!deLaCategoria.length) continue
    partes.push('', `## ${nombre}`)
    for (const e of deLaCategoria) {
      partes.push('', `### ${e.titulo}`, e.contenido.trim())
    }
  }
  return partes.join('\n')
}
