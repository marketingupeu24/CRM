// Formulario personalizable de cada actividad (Actividades y QR): qué campos pide y sus preguntas propias.
// Se guarda en actividades.formulario; registrar_lead_actividad() valida lo obligatorio con los mismos datos.
import { z } from 'zod'

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
} as const
export type TipoPregunta = keyof typeof TIPOS_PREGUNTA

const pregunta = z.object({
  id: z.string().regex(/^p\d{1,3}$/),
  texto: z.string().trim().min(3, 'Escribe el texto de cada pregunta.').max(200, 'Cada pregunta admite máximo 200 caracteres.'),
  tipo: z.enum(['texto', 'opcion', 'varias', 'si_no', 'fecha', 'correo', 'numero']),
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
  inscripcion: { nombre: 'Inscripción completa', detalle: 'Todos los datos para inscribir al alumno: DNI, colegio, procedencia, nacimiento, apoderado, modalidad…' },
} as const

/** Modalidades de admisión (las mismas de Genesys → Modalidades). */
const MODALIDADES = [
  'Examen General', 'Examen Preferencial', 'Centro Preuniversitario (CEPRE)', 'Primeros Puestos', 'Tercio Superior',
  'Egresados de Colegios UPeU', 'Egresados de Colegios de la Promotora', 'Deportista Calificado', 'Personas con Discapacidad',
  'Traslado Externo', 'Traslado Interno', 'Graduados y Titulados', 'Titulados de Instituto Superior', 'Internacionales', 'Aún no lo sé',
]

/** Formularios listos para empezar (después se pueden ajustar campo por campo). */
export const PLANTILLAS: Record<keyof typeof TIPOS_FORMULARIO, FormularioActividad> = {
  basico: { tipo: 'basico', campos: {}, preguntas: [] },
  inscripcion: {
    tipo: 'inscripcion',
    campos: { dni: 'obligatorio', carrera: 'obligatorio', grado: 'opcional', colegio: 'obligatorio', procedencia: 'obligatorio' },
    preguntas: [
      { id: 'p1', texto: 'Fecha de nacimiento', tipo: 'fecha', obligatoria: true },
      { id: 'p2', texto: 'Sexo', tipo: 'opcion', opciones: ['Femenino', 'Masculino'], obligatoria: true },
      { id: 'p3', texto: 'Correo electrónico', tipo: 'correo', obligatoria: true },
      { id: 'p4', texto: 'Dirección (calle, número, barrio o comunidad)', tipo: 'texto', obligatoria: true },
      { id: 'p5', texto: '¿En qué año terminaste (o terminarás) el colegio?', tipo: 'opcion', opciones: ['2026', '2025', '2024', '2023', '2022 o antes'], obligatoria: true },
      { id: 'p6', texto: 'Tu colegio es', tipo: 'opcion', opciones: ['Público', 'Privado', 'Adventista'], obligatoria: false },
      { id: 'p7', texto: 'Modalidad de ingreso', tipo: 'opcion', opciones: MODALIDADES, obligatoria: true },
      { id: 'p8', texto: '¿Tienes tu certificado de estudios de secundaria?', tipo: 'opcion', opciones: ['Sí, lo tengo (en PDF o físico)', 'Lo estoy tramitando', 'Aún no'], obligatoria: true },
      { id: 'p9', texto: 'Nombre del padre, madre o apoderado', tipo: 'texto', obligatoria: true },
      { id: 'p10', texto: 'Celular del padre, madre o apoderado', tipo: 'numero', obligatoria: true },
      { id: 'p11', texto: 'Parentesco', tipo: 'opcion', opciones: ['Padre', 'Madre', 'Otro familiar', 'Apoderado'], obligatoria: true },
      { id: 'p12', texto: 'Religión', tipo: 'opcion', opciones: ['Adventista', 'Católica', 'Evangélica', 'Otra', 'Prefiero no decirlo'], obligatoria: false },
    ],
  },
}
