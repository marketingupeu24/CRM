// Nombres oficiales de las carreras (los de las fichas de carreras del prompt de Genesys).
// La base de datos aplica la misma regla al guardar cualquier lead (public.carrera_oficial):
// esta copia sirve para las listas del panel y para mostrar en la importación cómo quedará cada carrera.
// Si cambias una regla aquí, cámbiala también en la migración 20261019000001_carrera_oficial.sql.

export const CARRERAS_OFICIALES = [
  'Administración',
  'Arquitectura y Urbanismo',
  'Contabilidad, Gestión Tributaria y Aduanera',
  'Derecho',
  'Educación Física, Recreación y Deportes',
  'Educación Inicial y Puericultura',
  'Educación Primaria y Pedagogía Terapéutica',
  'Educación, Ciencias Naturales y Tecnología',
  'Educación, Especialidad Lingüística e Inglés',
  'Educación, Matemática, Análisis de Datos y Computación',
  'Enfermería',
  'Ingeniería Ambiental',
  'Ingeniería Civil',
  'Ingeniería de Industrias Alimentarias',
  'Ingeniería de Sistemas',
  'Medicina Humana',
  'Nutrición Humana',
  'Psicología',
  'Tecnología Médica en Laboratorio Clínico y Anatomía Patológica',
  'Tecnología Médica en Terapia Física y Rehabilitación',
] as const

const REGLAS: [RegExp, string | null][] = [
  [/tecnolog.*laborat|laborat.*tecnolog/, 'Tecnología Médica en Laboratorio Clínico y Anatomía Patológica'],
  [/tecnolog.*(terapia|rehabilit)|(terapia|rehabilit).*tecnolog/, 'Tecnología Médica en Terapia Física y Rehabilitación'],
  [/ medicina /, 'Medicina Humana'],
  [/enfermer/, 'Enfermería'],
  [/nutric/, 'Nutrición Humana'],
  [/psicolog/, 'Psicología'],
  [/arquitect/, 'Arquitectura y Urbanismo'],
  [/ambiental/, 'Ingeniería Ambiental'],
  [/ civil /, 'Ingeniería Civil'],
  [/alimentar/, 'Ingeniería de Industrias Alimentarias'],
  [/ sistemas /, 'Ingeniería de Sistemas'],
  [/contab/, 'Contabilidad, Gestión Tributaria y Aduanera'],
  [/administra/, 'Administración'],
  [/ derecho /, 'Derecho'],
  [/inicial|puericult/, 'Educación Inicial y Puericultura'],
]

/** Nombre oficial de una carrera escrita de cualquier forma (o el texto tal cual si no se reconoce). */
export function carreraOficial(texto: string | null | undefined): string | null {
  if (!texto || !texto.trim()) return null
  const limpio = texto.trim().replace(/\s+/g, ' ')
  const k = ` ${texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `
  if (/ (posgrado|maestria|doctorado|diplomado) |segunda especialidad/.test(k)) return limpio
  const sufijo = / distancia /.test(k) ? ' (a distancia)' : / semipresencial /.test(k) ? ' (semipresencial)' : ''
  let base: string | null = REGLAS.find(([r]) => r.test(k))?.[1] ?? null
  if (!base) {
    const fisica = /( fisica |deporte|recreacion)/.test(k)
    const primaria = /(primaria|terapeut)/.test(k)
    if (fisica && !primaria) base = 'Educación Física, Recreación y Deportes'
    else if (primaria && !fisica) base = 'Educación Primaria y Pedagogía Terapéutica'
    else if (fisica && primaria) base = null
    else if (/(ingles|linguist)/.test(k)) base = 'Educación, Especialidad Lingüística e Inglés'
    else if (/matemat/.test(k)) base = 'Educación, Matemática, Análisis de Datos y Computación'
    else if (/ciencias naturales/.test(k)) base = 'Educación, Ciencias Naturales y Tecnología'
  }
  return base ? base + sufijo : limpio
}
