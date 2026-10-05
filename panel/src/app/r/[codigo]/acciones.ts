'use server'

// Formulario público del QR: lo llena el alumno desde su celular, sin iniciar sesión.
// Toda la validación y el registro los hace registrar_lead_actividad() en la base.
import { crearClienteServidor } from '@/lib/supabase/server'

export interface ResultadoRegistro {
  error?: string
  ok?: boolean
  nombre?: string
}

export async function registrarseEnActividad(codigo: string, _previo: ResultadoRegistro, formData: FormData): Promise<ResultadoRegistro> {
  const texto = (k: string) => String(formData.get(k) ?? '').trim()
  // Campo trampa: los bots lo llenan, las personas no lo ven
  if (texto('sitio_web')) return { ok: true }
  if (formData.get('acepto') !== 'on') return { error: 'Marca la casilla para que podamos contactarte por WhatsApp.' }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('registrar_lead_actividad', {
    p_codigo: codigo,
    p_nombre: texto('nombre'),
    p_telefono: texto('celular'),
    p_dni: texto('dni') || undefined,
    p_colegio: texto('colegio') || undefined,
    p_grado: texto('grado') || undefined,
    p_carrera: texto('carrera') || undefined,
  })
  // Los mensajes de la base ya están escritos para el alumno ("Revisa tu número de celular", etc.)
  if (error) return { error: error.message || 'No pudimos registrarte. Intenta de nuevo.' }
  return { ok: true, nombre: texto('nombre').split(/\s+/)[0] }
}
