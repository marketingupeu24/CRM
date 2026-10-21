// Categorías de las respuestas rápidas (igual que el check de respuestas_rapidas.categoria).
// Organizadas por tema de la consulta, como las carpetas de respuestas guardadas de los helpdesks.
export const CATEGORIAS_RESPUESTA = [
  { clave: 'saludo', nombre: 'Saludo y seguimiento', icono: '👋' },
  { clave: 'carreras', nombre: 'Carreras', icono: '🎓' },
  { clave: 'modalidades', nombre: 'Modalidades de admisión', icono: '🚪' },
  { clave: 'examen', nombre: 'Examen y proceso de admisión', icono: '📝' },
  { clave: 'cepre', nombre: 'CEPRE', icono: '📚' },
  { clave: 'costos', nombre: 'Costos y pagos', icono: '💰' },
  { clave: 'otros', nombre: 'Otros', icono: '📌' },
] as const

export type CategoriaRespuesta = (typeof CATEGORIAS_RESPUESTA)[number]['clave']

export function categoriaRespuesta(clave: string | null | undefined) {
  return CATEGORIAS_RESPUESTA.find((c) => c.clave === clave) ?? CATEGORIAS_RESPUESTA[CATEGORIAS_RESPUESTA.length - 1]!
}

/** Ordena por categoría (en el orden de arriba) y deja el orden propio de cada una. */
export function agruparPorCategoria<T extends { categoria?: string | null }>(lista: T[]): { categoria: (typeof CATEGORIAS_RESPUESTA)[number]; items: T[] }[] {
  return CATEGORIAS_RESPUESTA
    .map((categoria) => ({ categoria, items: lista.filter((r) => categoriaRespuesta(r.categoria).clave === categoria.clave) }))
    .filter((g) => g.items.length)
}
