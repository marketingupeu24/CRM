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
} as const
export type TipoPregunta = keyof typeof TIPOS_PREGUNTA

const pregunta = z.object({
  id: z.string().regex(/^p\d{1,3}$/),
  texto: z.string().trim().min(3, 'Escribe el texto de cada pregunta.').max(200, 'Cada pregunta admite máximo 200 caracteres.'),
  tipo: z.enum(['texto', 'opcion', 'varias', 'si_no']),
  opciones: z.array(z.string().trim().min(1).max(100)).max(20, 'Máximo 20 opciones por pregunta.').optional(),
  obligatoria: z.boolean(),
}).refine((p) => !['opcion', 'varias'].includes(p.tipo) || (p.opciones?.length ?? 0) >= 2, 'Las preguntas de opciones necesitan al menos 2 opciones.')

export const esquemaFormulario = z.object({
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
