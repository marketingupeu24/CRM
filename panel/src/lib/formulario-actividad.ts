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

const pregunta = z.object({
  id: z.string().regex(/^p\d{1,3}$/),
  texto: z.string().trim().min(3, 'Escribe el texto de cada pregunta.').max(200, 'Cada pregunta admite máximo 200 caracteres.'),
  tipo: z.enum(['texto', 'opcion', 'varias', 'si_no', 'fecha', 'correo', 'numero', 'lugar']),
  opciones: z.array(z.string().trim().min(1).max(100)).max(20, 'Máximo 20 opciones por pregunta.').optional(),
  obligatoria: z.boolean(),
}).refine((p) => !['opcion', 'varias'].includes(p.tipo) || (p.opciones?.length ?? 0) >= 2, 'Las preguntas de opciones necesitan al menos 2 opciones.')

export const esquemaFormulario = z.object({
  /** Plantilla de la que partió (solo para mostrarlo): formulario corto o con los datos de la inscripción */
  tipo: z.enum(['basico', 'inscripcion']).optional(),
  campos: z.partialRecord(z.enum(['dni', 'carrera', 'grado', 'colegio', 'procedencia']), z.enum(['oculto', 'opcional', 'obligatorio'])),
  preguntas: z.array(pregunta).max(15, 'Máximo 15 preguntas por actividad.'),
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
  inscripcion: { nombre: 'Inscripción completa', detalle: 'Los datos de la ficha de inscripción: DNI, carrera, colegio, domicilio, religión, bautizo, discapacidad, lugar de nacimiento, celular de un familiar…' },
} as const

/** Formularios listos para empezar (después se pueden ajustar campo por campo). */
export const PLANTILLAS: Record<keyof typeof TIPOS_FORMULARIO, FormularioActividad> = {
  basico: { tipo: 'basico', campos: {}, preguntas: [] },
  // Datos que pide la ficha de inscripción de Admisión. El orden sigue al formulario: carrera, DNI, colegio y domicilio
  // (campos del lead) y después estas preguntas, agrupadas para que se llenen de corrido.
  inscripcion: {
    tipo: 'inscripcion',
    campos: { dni: 'obligatorio', carrera: 'obligatorio', grado: 'oculto', colegio: 'obligatorio', procedencia: 'obligatorio' },
    preguntas: [
      { id: 'p1', texto: 'Domicilio: Jr. o Av. y número', tipo: 'texto', obligatoria: true },
      { id: 'p2', texto: 'Tipo de colegio', tipo: 'opcion', opciones: ['Estatal (público)', 'Particular (privado)', 'Parroquial', 'Otro'], obligatoria: true },
      { id: 'p3', texto: '¿Es colegio adventista?', tipo: 'si_no', obligatoria: true },
      { id: 'p4', texto: 'Situación educativa', tipo: 'opcion', opciones: ['Estoy en 5.° de secundaria', 'Ya terminé el colegio', 'Estudio o estudié en otra universidad o instituto', 'Tengo un título técnico o universitario'], obligatoria: true },
      { id: 'p5', texto: 'Año en el que culminaste (o culminarás) el colegio', tipo: 'opcion', opciones: ['2026', '2025', '2024', '2023', '2022', '2021 o antes'], obligatoria: true },
      { id: 'p6', texto: 'Religión', tipo: 'opcion', opciones: ['Adventista', 'Católica', 'Evangélica', 'Otra', 'Ninguna'], obligatoria: true },
      { id: 'p7', texto: '¿Bautizado?', tipo: 'si_no', obligatoria: true },
      { id: 'p8', texto: '¿Tienes alguna discapacidad?', tipo: 'si_no', obligatoria: true },
      { id: 'p9', texto: 'Lugar de nacimiento (departamento / provincia / distrito)', tipo: 'lugar', obligatoria: true },
      { id: 'p10', texto: 'Número de celular de un familiar (padre o madre)', tipo: 'numero', obligatoria: true },
      { id: 'p11', texto: '¿Cómo conociste la UPeU?', tipo: 'opcion', opciones: [...ORIGENES], obligatoria: true },
    ],
  },
}
