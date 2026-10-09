// Esquemas de validación (Zod) para lo que llega de formularios a las acciones del servidor.
// Revisan forma y tamaño de cada campo antes de llamar a la base; las reglas del negocio
// (DNI de 8 dígitos, celular válido, duplicados…) las sigue validando la base con sus mensajes.
import { z } from 'zod'

const campo = (max: number) => z.string().trim().max(max)

/** Lee los campos de un FormData como texto (los que faltan quedan vacíos). */
export function camposDe(formData: FormData, nombres: readonly string[]): Record<string, string> {
  return Object.fromEntries(nombres.map((n) => [n, String(formData.get(n) ?? '')]))
}

/** Formularios públicos del QR (feria/colegio y asesor): los llena el alumno sin iniciar sesión. */
export const esquemaRegistroPublico = z.object({
  codigo: campo(64).min(1),
  nombre: campo(200),
  celular: campo(40),
  dni: campo(20),
  colegio: campo(200),
  grado: campo(60),
  carrera: campo(200),
  sitio_web: campo(500),
})
export type RegistroPublico = z.infer<typeof esquemaRegistroPublico>
export const CAMPOS_REGISTRO_PUBLICO = ['nombre', 'celular', 'dni', 'colegio', 'grado', 'carrera', 'sitio_web'] as const

/** Ausencia temporal (Mi cuenta / Usuarios). */
export const esquemaAusencia = z.object({
  asesorId: z.uuid(),
  duracion: z.enum(['4h', '1d', '2d', '3d', '7d', 'fechas'], { error: 'Elige cuánto tiempo estarás ausente.' }),
  desde: campo(20),
  hasta: campo(20),
  reemplazo: z.union([z.literal(''), z.uuid()], { error: 'Reemplazo no válido' }),
  motivo: campo(200),
})
export const CAMPOS_AUSENCIA = ['duracion', 'desde', 'hasta', 'reemplazo', 'motivo'] as const

/** Primer mensaje de error de una validación fallida. */
export function primerError(error: z.ZodError, porDefecto = 'Revisa los datos del formulario.'): string {
  return error.issues[0]?.message && !error.issues[0].message.startsWith('Invalid') && !error.issues[0].message.startsWith('Too')
    ? error.issues[0].message
    : porDefecto
}
