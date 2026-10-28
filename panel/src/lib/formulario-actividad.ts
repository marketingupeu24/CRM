// Formulario personalizable de cada actividad (Actividades y QR): qué campos pide y sus preguntas propias.
// Se guarda en actividades.formulario; registrar_lead_actividad() valida lo obligatorio con los mismos datos.
import { z } from 'zod'
import { ORIGENES } from '@crm/db'

export const CAMPOS_FORMULARIO = [
  { clave: 'dni', etiqueta: 'DNI' },
  { clave: 'carrera', etiqueta: 'Carrera que le interesa' },
  { clave: 'grado', etiqueta: 'Grado' },
  { clave: 'colegio', etiqueta: 'Colegio' },
  { clave: 'procedencia', etiqueta: '¿De dónde eres? (distrito o provincia)' },
] as const
export type CampoFormulario = (typeof CAMPOS_FORMULARIO)[number]['clave']
export type ModoCampo = 'oculto' | 'opcional' | 'obligatorio'

export const TIPOS_PREGUNTA = {
  texto: 'Respuesta escrita',
  opcion: 'Una opción',
  varias: 'Varias opciones',
  si_no: 'Sí / No',
  fecha: 'Fecha',
  correo: 'Correo electrónico',
  numero: 'Número (celular, teléfono)',
  lugar: 'Lugar (departamento / provincia / distrito)',
} as const
export type TipoPregunta = keyof typeof TIPOS_PREGUNTA

export const MAXIMO_PREGUNTAS = 30

const pregunta = z.object({
  id: z.string().regex(/^p\d{1,3}$/),
  texto: z.string().trim().min(3, 'Escribe el texto de cada pregunta.').max(200, 'Cada pregunta admite máximo 200 caracteres.'),
  tipo: z.enum(['texto', 'opcion', 'varias', 'si_no', 'fecha', 'correo', 'numero', 'lugar']),
  opciones: z.array(z.string().trim().min(1).max(100)).max(20, 'Máximo 20 opciones por pregunta.').optional(),
  obligatoria: z.boolean(),
  /** Lugar: hasta qué nivel se pide (por defecto distrito) */
  hasta: z.enum(['provincia', 'distrito']).optional(),
  /** Se muestra justo después de ese dato del formulario (ej. la dirección, junto al domicilio) */
  junto: z.enum(['dni', 'carrera', 'grado', 'colegio', 'procedencia']).optional(),
  /** Se muestra justo antes de ese dato (ej. el lugar y el régimen del colegio, antes de su nombre) */
  antes: z.enum(['dni', 'carrera', 'grado', 'colegio', 'procedencia']).optional(),
}).refine((p) => !['opcion', 'varias'].includes(p.tipo) || (p.opciones?.length ?? 0) >= 2, 'Las preguntas de opciones necesitan al menos 2 opciones.')

export const esquemaFormulario = z.object({
  /** Plantilla de la que partió (solo para mostrarlo): formulario corto o con los datos de la inscripción */
  tipo: z.enum(['basico', 'inscripcion']).optional(),
  campos: z.partialRecord(z.enum(['dni', 'carrera', 'grado', 'colegio', 'procedencia']), z.enum(['oculto', 'opcional', 'obligatorio'])),
  preguntas: z.array(pregunta).max(MAXIMO_PREGUNTAS, `Máximo ${MAXIMO_PREGUNTAS} preguntas por actividad.`),
})
export type FormularioActividad = z.infer<typeof esquemaFormulario>
export type PreguntaActividad = FormularioActividad['preguntas'][number]

/** Lo guardado en la base (puede ser {} en actividades antiguas) con sus valores por defecto: todo opcional, sin preguntas. */
export function leerFormulario(valor: unknown): FormularioActividad {
  const r = esquemaFormulario.safeParse({ campos: {}, preguntas: [], ...(valor && typeof valor === 'object' ? valor : {}) })
  return r.success ? r.data : { campos: {}, preguntas: [] }
}

export const modoDe = (f: FormularioActividad, campo: CampoFormulario): ModoCampo => f.campos[campo] ?? 'opcional'

export const TIPOS_FORMULARIO = {
  basico: { nombre: 'Básico', detalle: 'Pocos datos (todo opcional): para ferias y charlas, el asesor completa después.' },
  inscripcion: { nombre: 'Inscripción completa', detalle: 'Los datos de la ficha de inscripción y en su orden: datos personales, lugar de nacimiento, domicilio, datos de admisión y centro de estudios de procedencia.' },
} as const

/** Formularios listos para empezar (después se pueden ajustar campo por campo). */
export const PLANTILLAS: Record<keyof typeof TIPOS_FORMULARIO, FormularioActividad> = {
  basico: { tipo: 'basico', campos: {}, preguntas: [] },
  // En el mismo orden que la ficha de inscripción de Admisión: datos personales (con el DNI), lugar de nacimiento,
  // dirección de domicilio, datos de admisión (carrera) y centro de estudios de procedencia (termina con el nombre del colegio).
  inscripcion: {
    tipo: 'inscripcion',
    campos: { dni: 'obligatorio', carrera: 'obligatorio', grado: 'oculto', colegio: 'obligatorio', procedencia: 'obligatorio' },
    preguntas: [
      // Datos personales
      { id: 'p13', texto: 'Estado civil', tipo: 'opcion', opciones: ['Soltero(a)', 'Casado(a)', 'Conviviente', 'Divorciado(a)', 'Viudo(a)'], obligatoria: true, junto: 'dni' },
      { id: 'p14', texto: 'Nacionalidad', tipo: 'opcion', opciones: ['Perú', 'Bolivia', 'Chile', 'Argentina', 'Brasil', 'Colombia', 'Ecuador', 'Venezuela', 'Otro país'], obligatoria: true, junto: 'dni' },
      { id: 'p6', texto: 'Afiliación religiosa', tipo: 'opcion', opciones: ['Adventista', 'Católico', 'Evangélico', 'Otra', 'Ninguna'], obligatoria: true, junto: 'dni' },
      { id: 'p7', texto: 'Bautizado', tipo: 'si_no', obligatoria: true, junto: 'dni' },
      { id: 'p8', texto: 'Discapacitado', tipo: 'si_no', obligatoria: true, junto: 'dni' },
      { id: 'p15', texto: 'Por tus costumbres y antepasados te sientes parte de', tipo: 'opcion', opciones: ['Quechua', 'Aimara', 'Nativo o indígena de la Amazonía', 'Otro pueblo indígena u originario', 'Afroperuano', 'Blanco', 'Mestizo', 'Otro', 'No sabe / no responde'], obligatoria: true, junto: 'dni' },
      { id: 'p16', texto: 'Hablas alguna lengua indígena u originaria', tipo: 'opcion', opciones: ['No', 'Quechua', 'Aimara', 'Otra lengua originaria'], obligatoria: true, junto: 'dni' },
      { id: 'p10', texto: 'Nro. de referencia familiar (padre o madre)', tipo: 'numero', obligatoria: true, junto: 'dni' },
      { id: 'p17', texto: 'Correo electrónico', tipo: 'correo', obligatoria: true, junto: 'dni' },
      { id: 'p9', texto: 'Lugar de nacimiento', tipo: 'lugar', hasta: 'distrito', obligatoria: true, junto: 'dni' },
      // Dirección de domicilio (después del departamento / provincia / distrito)
      { id: 'p18', texto: 'Ubicación', tipo: 'opcion', opciones: ['Jirón', 'Avenida', 'Calle', 'Pasaje', 'Urbanización', 'Carretera', 'Comunidad', 'Otro'], obligatoria: true, junto: 'procedencia' },
      { id: 'p1', texto: 'Dirección (nombre y número)', tipo: 'texto', obligatoria: true, junto: 'procedencia' },
      // Datos de admisión: la modalidad de estudio antes de la carrera; el resto, después
      { id: 'p23', texto: 'Modalidad de estudio', tipo: 'opcion', opciones: ['Presencial', 'Semipresencial', 'A distancia'], obligatoria: true, antes: 'carrera' },
      { id: 'p19', texto: 'Modalidad de ingreso', tipo: 'opcion', opciones: ['Examen de admisión', 'CEPRE', 'Primeros puestos', 'Traslado externo', 'Graduados o titulados', 'Aún no lo sé'], obligatoria: true, junto: 'carrera' },
      { id: 'p11', texto: 'Canal de referencia (¿cómo conociste la UPeU?)', tipo: 'opcion', opciones: [...ORIGENES], obligatoria: true, junto: 'carrera' },
      // Centro de estudios de procedencia (antes del nombre del colegio)
      { id: 'p12', texto: 'Lugar del centro de estudios', tipo: 'lugar', hasta: 'distrito', obligatoria: true, antes: 'colegio' },
      { id: 'p20', texto: 'Tipo de institución', tipo: 'opcion', opciones: ['Colegio', 'Instituto', 'Universidad', 'CEBA', 'Otro'], obligatoria: true, antes: 'colegio' },
      { id: 'p5', texto: 'Año de egreso del colegio', tipo: 'opcion', opciones: ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018 o antes'], obligatoria: true, antes: 'colegio' },
      { id: 'p2', texto: 'Régimen', tipo: 'opcion', opciones: ['Público', 'Privado'], obligatoria: true, antes: 'colegio' },
      { id: 'p3', texto: '¿La institución o colegio de donde provienes es adventista?', tipo: 'si_no', obligatoria: true, antes: 'colegio' },
      { id: 'p21', texto: 'Procedencia educativa', tipo: 'opcion', opciones: ['Educación Básica Regular', 'Educación Básica Alternativa (CEBA)', 'COAR', 'Colegio en el extranjero', 'Otro'], obligatoria: true, antes: 'colegio' },
      { id: 'p22', texto: 'Nivel educativo', tipo: 'opcion', opciones: ['Secundaria', 'Técnico', 'Universitario'], obligatoria: true, antes: 'colegio' },
      { id: 'p4', texto: 'Situación educativa', tipo: 'opcion', opciones: ['Completa', 'Cursando el último año', 'Incompleta'], obligatoria: true, antes: 'colegio' },
    ],
  },
}
