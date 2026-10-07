// =====================================================================
//  Prompt de Genesys dividido en partes y fichas pequeñas.
//  Cada ficha es un dato fácil de actualizar (una carrera, un programa CEPRE,
//  una modalidad…); el CRM las une en el prompt que se pega en BuilderBot.
//  Los costos no se escriben aquí: salen del tarifario de las proformas.
// =====================================================================

export type TipoCampo = 'texto' | 'area' | 'lista' | 'opciones'

export interface CampoFicha {
  clave: string
  etiqueta: string
  tipo: TipoCampo
  opciones?: readonly string[]
  ayuda?: string
}

export interface ParteGenesys {
  clave: string
  titulo: string
  icono: string
  descripcion: string
  /** Etiqueta del nombre de cada ficha (ej. "Carrera", "Pregunta") */
  nombreFicha: string
  campos: readonly CampoFicha[]
}

const TEXTO: readonly CampoFicha[] = [{ clave: 'texto', etiqueta: 'Texto', tipo: 'area' }]

export const PARTES_GENESYS: readonly ParteGenesys[] = [
  {
    clave: 'identidad', titulo: 'Identidad y estilo', icono: '🧭', nombreFicha: 'Tema',
    descripcion: 'Quién es Genesys y cómo escribe. Cada ficha es una regla corta.',
    campos: TEXTO,
  },
  {
    clave: 'plantillas', titulo: 'Plantillas de respuesta', icono: '🎨', nombreFicha: 'Plantilla',
    descripcion: 'Cómo se ven las respuestas (emojis, negritas, orden). Genesys copia este estilo. Usa [corchetes] para lo que cambia.',
    campos: [{ clave: 'texto', etiqueta: 'Plantilla', tipo: 'area' }],
  },
  {
    clave: 'registro', titulo: 'Registro de alumnos', icono: '📋', nombreFicha: 'Paso',
    descripcion: 'Cómo pide y confirma los datos. Aquí vive el único PEDIDO_CONFIRMADO del prompt.',
    campos: TEXTO,
  },
  {
    clave: 'reglas', titulo: 'Reglas y límites', icono: '🚦', nombreFicha: 'Regla',
    descripcion: 'Lo que nunca debe hacer y cuándo derivar a un asesor.',
    campos: TEXTO,
  },
  {
    clave: 'carreras', titulo: 'Carreras', icono: '🎓', nombreFicha: 'Carrera',
    descripcion: 'Una ficha por carrera. Los costos se agregan solos desde el tarifario de las proformas.',
    campos: [
      { clave: 'modalidad', etiqueta: 'Modalidad', tipo: 'opciones', opciones: ['Presencial', 'A distancia', 'Semipresencial'] },
      { clave: 'sede', etiqueta: 'Sede', tipo: 'opciones', opciones: ['Juliaca', 'Lima'] },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'opciones', opciones: ['Vigente', 'Nueva 2027-1', 'Próximamente'] },
      { clave: 'duracion', etiqueta: 'Duración', tipo: 'texto', ayuda: 'Ej.: 10 semestres (5 años)' },
      { clave: 'enfoque', etiqueta: 'Enfoque', tipo: 'texto' },
      { clave: 'aprendera', etiqueta: 'Lo que aprenderá', tipo: 'lista', ayuda: 'Uno por línea' },
      { clave: 'perfil', etiqueta: 'Perfil del egresado', tipo: 'area' },
      { clave: 'salidas', etiqueta: 'Campo laboral', tipo: 'texto' },
      { clave: 'notas', etiqueta: 'Notas para Genesys', tipo: 'area', ayuda: 'Ej.: inicia en 2027-1; la sede es Lima' },
    ],
  },
  {
    clave: 'modalidades', titulo: 'Modalidades de admisión', icono: '🚪', nombreFicha: 'Modalidad',
    descripcion: 'Una ficha por modalidad de ingreso (examen general, tercio superior, traslado…).',
    campos: [
      { clave: 'dirigido', etiqueta: 'Dirigido a', tipo: 'area' },
      { clave: 'requisitos', etiqueta: 'Requisitos', tipo: 'lista', ayuda: 'Uno por línea' },
      { clave: 'examen', etiqueta: 'Examen de conocimientos', tipo: 'opciones', opciones: ['Rinde examen', 'Exonerado (solo entrevista)', 'Según evaluación'] },
      { clave: 'notas', etiqueta: 'Notas para Genesys', tipo: 'area' },
    ],
  },
  {
    clave: 'cepre', titulo: 'CEPRE', icono: '📚', nombreFicha: 'Programa',
    descripcion: 'Una ficha por programa y modalidad (ej. Primavera presencial, Medicina virtual).',
    campos: [
      { clave: 'modalidad', etiqueta: 'Modalidad', tipo: 'opciones', opciones: ['Presencial', 'Virtual', 'Semipresencial'] },
      { clave: 'costo', etiqueta: 'Costo', tipo: 'texto', ayuda: 'Ej.: S/ 660' },
      { clave: 'fechas', etiqueta: 'Fechas', tipo: 'texto' },
      { clave: 'horario', etiqueta: 'Horario', tipo: 'texto', ayuda: 'Escribe "pm" y "am" sin puntos' },
      { clave: 'lugar', etiqueta: 'Lugar', tipo: 'texto' },
      { clave: 'areas', etiqueta: 'Áreas o carreras', tipo: 'lista', ayuda: 'Una por línea' },
      { clave: 'incluye', etiqueta: 'Beneficios', tipo: 'lista', ayuda: 'Uno por línea' },
      { clave: 'notas', etiqueta: 'Notas para Genesys', tipo: 'area' },
    ],
  },
  {
    clave: 'examenes', titulo: 'Exámenes y fechas', icono: '🗓️', nombreFicha: 'Examen o fecha',
    descripcion: 'Fechas de examen, inscripción y su costo.',
    campos: [
      { clave: 'fecha', etiqueta: 'Fecha', tipo: 'texto' },
      { clave: 'costo', etiqueta: 'Costo / derecho', tipo: 'texto' },
      { clave: 'notas', etiqueta: 'Notas para Genesys', tipo: 'area' },
    ],
  },
  {
    clave: 'becas', titulo: 'Becas y descuentos', icono: '🎁', nombreFicha: 'Beneficio',
    descripcion: 'Cómo hablar de becas y descuentos (los montos los confirma el asesor).',
    campos: TEXTO,
  },
  {
    clave: 'sede', titulo: 'Sede y contacto', icono: '📍', nombreFicha: 'Dato',
    descripcion: 'Dirección, teléfono, mapa. El horario de atención se agrega solo.',
    campos: TEXTO,
  },
  {
    clave: 'faq', titulo: 'Preguntas frecuentes', icono: '❓', nombreFicha: 'Pregunta',
    descripcion: 'Respuestas a preguntas que Genesys no supo responder (desde "Revisión del bot").',
    campos: [{ clave: 'texto', etiqueta: 'Respuesta', tipo: 'area' }],
  },
] as const

export type ClaveParte = (typeof PARTES_GENESYS)[number]['clave']

export interface FichaGenesys {
  id: number
  parte: string
  titulo: string
  campos: Record<string, string>
  activo: boolean
  orden: number
}
